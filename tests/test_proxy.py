import importlib.util
import json
from pathlib import Path
import socket
import threading
import types
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("research_static_server", ROOT / "serve.py")
serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve)


class FakeResponse:
    status = 200
    def read(self, limit):
        return b"{\"state\":\"fixture\"}"
    def getheaders(self):
        return [("Content-Type", "application/json"), ("Access-Control-Allow-Origin", "https://co-minder.github.io"), ("Set-Cookie", "must-not-forward"), ("Connection", "keep-alive")]


class FakeConnection:
    calls = []
    def __init__(self, host, port, timeout):
        self.target = (host, port)
    def request(self, method, path, body, headers):
        self.calls.append({"target": self.target, "method": method, "path": path, "body": body, "headers": headers})
    def getresponse(self):
        return FakeResponse()
    def close(self):
        pass


class ProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve.Server(("127.0.0.1", 0), serve.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]
        cls.base = "http://127.0.0.1:" + str(cls.port)
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def setUp(self):
        FakeConnection.calls.clear()
        self.proxy = patch.object(serve, "http", types.SimpleNamespace(client=types.SimpleNamespace(HTTPConnection=FakeConnection, HTTPException=OSError)))
        self.proxy.start()
        self.addCleanup(self.proxy.stop)
    def request(self, path, headers=None, body=None, method="GET"):
        request = Request(self.base + path, data=body, headers=headers or {}, method=method)
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, dict(response.headers), response.read()
        except HTTPError as error:
            return error.code, dict(error.headers), error.read()
    def test_fixed_target_and_header_allowlist(self):
        status, headers, _ = self.request("/api/search", {"Origin":"https://co-minder.github.io", "Authorization":"Bearer fixture", "Content-Type":"application/json", "X-Forwarded-For":"attacker", "Cookie":"secret"}, b"{}", "POST")
        self.assertEqual(status, 200)
        call = FakeConnection.calls[-1]
        self.assertEqual(call["target"], ("127.0.0.1", 8791))
        self.assertEqual(call["headers"]["Authorization"], "Bearer fixture")
        self.assertNotIn("Cookie", call["headers"])
        self.assertNotIn("X-Forwarded-For", call["headers"])
        self.assertNotIn("Set-Cookie", headers)
        self.assertEqual(headers["Cache-Control"], "no-store")
    def test_non_api_targets_and_query_are_not_proxied(self):
        for path in ("/api/search?url=https://elsewhere.example", "/api/v1/models", "/api/../.runtime/pages-password", "/v1/models", "/.git/config", "/.runtime/retrieval.sqlite3", "/service/app.py"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(FakeConnection.calls, [])
    def test_same_origin_get_requires_all_metadata(self):
        for headers in ({}, {"Referer":"https://bringing-themes-mae-dating.trycloudflare.com/"}, {"Referer":"https://evil.example/", "Sec-Fetch-Site":"same-origin", "Host":"evil.example"}):
            self.request("/api/status", headers)
            self.assertNotIn("Origin", FakeConnection.calls[-1]["headers"])
        self.request("/api/status", {"Referer":"https://bringing-themes-mae-dating.trycloudflare.com/", "Sec-Fetch-Site":"same-origin", "Host":"bringing-themes-mae-dating.trycloudflare.com"})
        self.assertEqual(FakeConnection.calls[-1]["headers"]["Origin"], "https://bringing-themes-mae-dating.trycloudflare.com")
    def test_large_body_is_rejected_before_upstream(self):
        status, headers, _ = self.request("/api/chat", {"Origin":"https://co-minder.github.io", "Content-Type":"application/json"}, b"x" * 65537, "POST")
        self.assertEqual(status, 413)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://co-minder.github.io")
        self.assertEqual(FakeConnection.calls, [])
    def test_duplicate_origin_headers_are_rejected(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as connection:
            connection.sendall(b"GET /api/status HTTP/1.0\r\nHost: fixture\r\nOrigin: https://co-minder.github.io\r\nOrigin: https://evil.example\r\n\r\n")
            first = connection.recv(4096)
        self.assertIn(b" 400 ", first.split(b"\r\n",1)[0])
        self.assertEqual(FakeConnection.calls, [])


    def test_upstream_errors_are_generic_and_keep_error_cors(self):
        class FailedConnection(FakeConnection):
            def request(self, *args, **kwargs):
                raise OSError("private/path/provider-token-must-not-appear")
        with patch.object(serve, "http", types.SimpleNamespace(client=types.SimpleNamespace(HTTPConnection=FailedConnection, HTTPException=OSError))):
            status, headers, data = self.request("/api/status", {"Origin":"https://co-minder.github.io"})
        self.assertEqual(status, 502)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://co-minder.github.io")
        self.assertNotIn(b"provider-token", data)
        self.assertNotIn(b"private/path", data)


    def test_origin_inference_is_get_only_and_referer_is_validated(self):
        headers={"Referer":"https://bringing-themes-mae-dating.trycloudflare.com/", "Sec-Fetch-Site":"same-origin", "Host":"bringing-themes-mae-dating.trycloudflare.com", "Content-Type":"application/json"}
        self.request("/api/session",headers,b"{}","POST")
        self.assertNotIn("Origin", FakeConnection.calls[-1]["headers"])
        self.request("/api/status",{**headers,"Origin":""})
        self.assertNotIn("Origin", FakeConnection.calls[-1]["headers"])
        previous=len(FakeConnection.calls)
        self.assertEqual(self.request("/api/status",{**headers,"Referer":"https://[invalid/"})[0],400)
        self.assertEqual(len(FakeConnection.calls),previous)

    def test_header_read_timeout_and_connection_limit_exist(self):
        entered=threading.Event();observed=[]
        class Observe(serve.Handler):
            def handle(self):
                observed.append(self.connection.gettimeout());entered.set()
        finished=threading.Event()
        class ObserveServer(serve.Server):
            def process_request_thread(self, request, client_address):
                try:
                    super().process_request_thread(request, client_address)
                finally:
                    finished.set()
        server=ObserveServer(("127.0.0.1",0),Observe)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with socket.create_connection(server.server_address,timeout=2):
                self.assertTrue(entered.wait(2))
            self.assertEqual(observed,[12.0])
            self.assertTrue(finished.wait(2), "The observed request must release its slot before checking capacity")
            acquired=[server.slots.acquire(blocking=False) for _ in range(49)]
            self.assertEqual(sum(acquired),48)
            for success in acquired:
                if success:server.slots.release()
        finally:
            server.shutdown();server.server_close();thread.join()


if __name__ == "__main__":
    unittest.main()
