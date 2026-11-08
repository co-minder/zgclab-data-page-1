#!/usr/bin/env python3
"""Mac loopback relay for the website's one authorized model; no credentials on social."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MODEL = "auto/deepseek-v4.1-flash"
BOUND = threading.BoundedSemaphore(2)
HEALTH_LOCK = threading.Lock()
HEALTH = (0, False)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        if args:
            print("relay", self.command, self.path, flush=True)

    def reply(self, status, body):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path == "/health":
            global HEALTH
            with HEALTH_LOCK:
                now = time.monotonic()
                if now - HEALTH[0] > 10:
                    available = False
                    try:
                        request = Request("http://127.0.0.1:3425/v1/models", headers={"Authorization":"Bearer magpie"})
                        with urlopen(request,timeout=3) as response:
                            data = json.loads(response.read(1_000_000))
                        available = any(item.get("id") == MODEL for item in data.get("data",[]))
                    except (OSError, ValueError, URLError):
                        pass
                    HEALTH = (now,available)
                available = HEALTH[1]
            return self.reply(200 if available else 503, {"status":"ok" if available else "unavailable", "available":available, "model":MODEL})
        return self.reply(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            return self.reply(404, {"error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 400_000:
                return self.reply(413, {"error": "Request size exceeded"})
            source = json.loads(self.rfile.read(length))
            if source.get("model") != MODEL:
                return self.reply(400, {"error": "Unsupported model"})
            messages = source.get("messages")
            if not isinstance(messages, list) or not 1 <= len(messages) <= 24:
                return self.reply(400, {"error": "Invalid messages"})
            bounded = []
            for item in messages:
                if not isinstance(item, dict) or item.get("role") not in ("system", "user", "assistant") or not isinstance(item.get("content"), str) or len(item["content"]) > 160_000:
                    return self.reply(400, {"error": "Invalid message"})
                bounded.append({"role": item["role"], "content": item["content"]})
            payload = {"model": MODEL, "messages": bounded, "stream": False, "max_tokens": min(4096, max(128, int(source.get("max_tokens", 2048))))}
            if source.get("thinking") == {"type": "disabled"}:
                payload["thinking"] = {"type": "disabled"}
            if source.get("response_format") == {"type": "json_object"}:
                payload["response_format"] = {"type": "json_object"}
            if not BOUND.acquire(blocking=False):
                return self.reply(429, {"error": "Model is busy"})
            try:
                request = Request("http://127.0.0.1:3425/v1/chat/completions", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer magpie"}, method="POST")
                with urlopen(request, timeout=100) as response:
                    result = json.loads(response.read(2_000_000))
                return self.reply(200, result)
            except HTTPError as error:
                return self.reply(error.code if error.code in (400, 401, 403, 429) else 502, {"error": "Model gateway request failed"})
            except (URLError, TimeoutError, OSError, json.JSONDecodeError):
                return self.reply(503, {"error": "Local model gateway unavailable"})
            finally:
                BOUND.release()
        except (ValueError, TypeError, json.JSONDecodeError):
            return self.reply(400, {"error": "Invalid request"})


if __name__ == "__main__":
    print("Research relay listening on Mac loopback 13427", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 13427), Handler).serve_forever()
