#!/usr/bin/env python3
"""Serve only published application files, with gzip and conditional caching."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import mimetypes
import http.client
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PROJECT = Path(__file__).resolve().parent
ROOT = PROJECT / "docs" if (PROJECT / "docs" / "index.html").is_file() else PROJECT
ASSETS = {"index.html", "app.js", "core.js", "query.js", "explorer.js", "tools.js", "styles.css", "favicon.svg", "favicon.ico", "access.js", "access.css", "service-config.js", "service-client.js", "projects.js", "projects.css", "research.js", "research.css", "assistant.js", "assistant.css"}
CACHE: dict[tuple[str, int, int, bool], bytes] = {}
API_PATHS = {"/api/session", "/api/status", "/api/search", "/api/chat", "/api/changes", "/api/snapshot"}
ALLOWED_ORIGINS = {"https://co-minder.github.io", "https://bringing-themes-mae-dating.trycloudflare.com", "http://127.0.0.1:8787", "http://127.0.0.1:8788", "http://127.0.0.1:8789", "http://localhost:8787", "http://localhost:8788", "http://localhost:8789"}


class Handler(BaseHTTPRequestHandler):
    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(12)

    def log_message(self, format, *args) -> None:
        # Query strings may contain research questions. Never log bodies or credentials.
        if urlsplit(self.path).path.startswith("/api/"):
            print(f"API {self.command} {urlsplit(self.path).path}", flush=True)
        else:
            super().log_message(format, *args)

    def do_HEAD(self) -> None:
        if urlsplit(self.path).path.startswith("/api/"):
            self.api_error(405, "不支持的请求方式", body=False)
            return
        self.serve(False)

    def do_GET(self) -> None:
        if urlsplit(self.path).path.startswith("/api/"):
            self.proxy_api()
            return
        self.serve(True)

    def do_POST(self) -> None:
        if urlsplit(self.path).path.startswith("/api/"):
            self.proxy_api()
        else:
            self.api_error(404, "请求地址不存在")

    def do_OPTIONS(self) -> None:
        if urlsplit(self.path).path in API_PATHS:
            self.proxy_api()
        else:
            self.api_error(404, "请求地址不存在")

    def api_error(self, status: int, message: str, body: bool = True) -> None:
        data = json.dumps({"error": message}, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        if body:
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def proxy_api(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path not in API_PATHS or parsed.query or "%" in self.path:
            self.api_error(404, "请求地址不存在")
            return
        for key in ("Host", "Origin", "Authorization", "Content-Type", "Content-Length", "Referer", "Sec-Fetch-Site"):
            if len(self.headers.get_all(key, [])) > 1:
                self.api_error(400, "重复请求头无效")
                self.close_connection = True
                return
        if self.headers.get("Transfer-Encoding"):
            self.api_error(400, "不支持的请求编码")
            self.close_connection = True
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.api_error(400, "请求长度无效")
            return
        if length < 0 or length > 65_536:
            self.api_error(413, "请求内容过长")
            self.close_connection = True
            return
        headers = {key: self.headers[key] for key in ("Authorization", "Content-Type", "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers") if self.headers.get(key)}
        if self.command == "GET" and not self.headers.get_all("Origin", []):
            # Browsers may omit Origin on same-origin GET. Require browser same-origin
            # metadata plus an exact allowed Referer and matching trusted public Host.
            try:
                ref = urlsplit(self.headers.get("Referer", ""))
                if ref.username or ref.password or ref.port == 0:
                    raise ValueError("Invalid referring address")
            except ValueError:
                self.api_error(400, "来源地址无效")
                return
            inferred = ref.scheme + "://" + ref.netloc if ref.scheme and ref.netloc else ""
            hosts = self.headers.get_all("Host", [])
            if self.headers.get("Sec-Fetch-Site") == "same-origin" and inferred in ALLOWED_ORIGINS and len(hosts) == 1 and hosts[0] == ref.netloc:
                headers["Origin"] = inferred
        connection = http.client.HTTPConnection("127.0.0.1", 8791, timeout=120 if parsed.path == "/api/chat" else 35)
        try:
            self.connection.settimeout(15)
            payload = self.rfile.read(length) if length else None
            if payload is not None and len(payload) != length:
                self.api_error(400, "请求内容不完整")
                return
            connection.request(self.command, parsed.path, body=payload, headers=headers)
            response = connection.getresponse()
            data = response.read(3_000_001)
            if len(data) > 3_000_000:
                self.api_error(502, "资料服务响应过长")
                return
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() in ("content-type", "access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers", "access-control-max-age", "vary", "retry-after"):
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except TimeoutError:
            self.api_error(504, "资料服务响应超时，请重试")
        except (OSError, http.client.HTTPException):
            self.api_error(502, "资料服务暂时无法连接")
        finally:
            connection.close()

    def serve(self, body: bool) -> None:
        name = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
        if name == "favicon.ico":
            name = "favicon.svg"
        path = (ROOT / name).resolve()
        is_data = name.startswith("data/") and name.endswith(".js")
        is_protected = (name.startswith("encrypted/") and name.endswith(".bin")) or (name.startswith("manifest-") and name.endswith(".json"))
        if not path.is_relative_to(ROOT) or not (name in ASSETS or is_data or is_protected) or not path.is_file():
            self.send_error(404)
            return
        stat = path.stat()
        compress = "gzip" in self.headers.get("Accept-Encoding", "") and stat.st_size > 512
        tag = '"' + hashlib.sha256(f"{name}:{stat.st_mtime_ns}:{stat.st_size}:{compress}".encode()).hexdigest()[:24] + '"'
        if self.headers.get("If-None-Match") == tag:
            self.send_response(304)
            self.send_header("ETag", tag)
            self.end_headers()
            return
        key = (name, stat.st_mtime_ns, stat.st_size, compress)
        if key not in CACHE:
            data = path.read_bytes()
            CACHE[key] = gzip.compress(data, compresslevel=6, mtime=0) if compress else data
        data = CACHE[key]
        self.send_response(200)
        self.send_header("Content-Type", (mimetypes.guess_type(name)[0] or "application/octet-stream") + ("; charset=utf-8" if name.endswith((".js", ".html", ".css")) else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if name.startswith(("data/details/", "encrypted/", "manifest-")) else "no-cache")
        self.send_header("ETag", tag)
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        if compress:
            self.send_header("Content-Encoding", "gzip")
        self.end_headers()
        if body:
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 32

    def __init__(self, address, handler=Handler):
        super().__init__(address, handler)
        self.slots = threading.BoundedSemaphore(48)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, request, client_address):
        print("Website request failed", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", default=8788, type=int)
    args = parser.parse_args()
    print(f"ZGCLab serving on http://{args.bind}:{args.port}/", flush=True)
    Server((args.bind, args.port), Handler).serve_forever()
