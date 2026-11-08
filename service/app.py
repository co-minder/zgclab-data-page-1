"""Bounded local HTTP API; static hosting may reverse-proxy /api/* to this service."""
from __future__ import annotations

import argparse
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from .auth import Auth
from .chat import Chat
from .config import Config
from .llm import LLMClient
from .limits import Limits
from .planner import SearchEngine
from .retrieval import InputError, QueryTimeout, SnapshotChanged, Retriever


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


class Application:
    def __init__(self, config: Config):
        self.config = config
        self.auth = Auth(config.password_file, config.token_ttl)
        self.retriever = Retriever(config.database, config.database_timeout)
        self.llm = LLMClient(config.llm_base_url, config.llm_model, config.llm_timeout, config.max_llm_requests)
        self.search = SearchEngine(self.retriever, self.llm)
        self.chat = Chat(self.retriever, self.llm, config.chat_timeout)
        self.limits = Limits()
        self.semaphore = threading.BoundedSemaphore(config.max_requests)

    def status(self, authenticated: bool) -> dict:
        result = {"service": "zgclab-database", "state": "ready", "authentication_required": True,
                  "session_ttl": self.config.token_ttl, "dataset": "real", "llm": self.llm.health(),
                  "limits": {"max_body_bytes": self.config.max_body, "message_characters": 1200,
                             "history_characters": 12000, "history_messages": 8, "chat_timeout_seconds": self.config.chat_timeout}}
        if authenticated:
            result.update(self.retriever.status())
        return result


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ZGCLabRetrieval/1"
    sys_version = ""

    @property
    def app(self) -> Application:
        return self.server.app

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(self.server.app.config.request_timeout)

    def log_message(self, format, *args) -> None:
        # No bodies, query strings, origins, credentials, tokens, or remote error text.
        pass

    def send_json(self, status: int, payload: dict, origin: str = "") -> None:
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Vary", "Origin")
        self.send_header("Connection", "close")
        if origin in self.app.config.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(body)
        except (OSError, socket.timeout):
            pass

    def origin(self) -> str:
        origins = self.headers.get_all("Origin", [])
        if len(origins) != 1 or origins[0] not in self.app.config.allowed_origins:
            raise APIError(403, "origin_forbidden", "An explicitly allowed Origin is required")
        return origins[0]

    def body(self) -> dict:
        if self.headers.get("Transfer-Encoding"):
            raise APIError(400, "invalid_body", "Transfer-Encoding is not supported")
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not lengths[0].isdigit():
            raise APIError(411, "length_required", "A single Content-Length is required")
        length = int(lengths[0])
        if length > self.app.config.max_body:
            raise APIError(413, "body_too_large", f"Request body exceeds {self.app.config.max_body} bytes")
        if self.headers.get_content_type() != "application/json" or self.headers.get("Content-Encoding"):
            raise APIError(415, "content_type", "Use an uncompressed application/json request")
        try:
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError("Incomplete request")
            value = json.loads(body, object_pairs_hook=object_pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite number")))
            if not isinstance(value, dict):
                raise ValueError("JSON body must be an object")
            # Reject escaped lone surrogates before password hashing, tokenization or
            # downstream JSON encoding. Normal astral Unicode remains valid UTF-8.
            json.dumps(value, ensure_ascii=False).encode("utf-8")
            return value
        except (ValueError, UnicodeError, RecursionError):
            raise APIError(400, "invalid_json", "Request must be a valid JSON object without duplicate keys") from None

    def quota(self, rules):
        allowed, retry = self.app.limits.take(rules)
        if not allowed:
            raise APIError(429, "rate_limited", f"Request quota exceeded; retry in {retry} seconds")

    def model_guard(self, session_id):
        c = self.app.config
        self.quota([(f"model:{session_id}", c.model_per_minute, 60),
                    ("model:global", c.global_model_per_hour, 3600)])

    def handle_request(self, method: str) -> None:
        origin = ""
        acquired = False
        try:
            origin = self.origin()
            parsed = urlsplit(self.path)
            path = parsed.path
            if parsed.query or parsed.fragment:
                raise APIError(400, "invalid_path", "API parameters belong in the JSON body")
            supported = {"/api/session": "POST", "/api/status": "GET", "/api/search": "POST", "/api/chat": "POST", "/api/changes": "GET"}
            if path not in supported:
                raise APIError(404, "not_found", "Unknown API endpoint")
            if method == "OPTIONS":
                wanted = self.headers.get("Access-Control-Request-Method", "")
                allowed_headers = {h.strip().lower() for h in self.headers.get("Access-Control-Request-Headers", "").split(",") if h.strip()}
                if wanted != supported[path] or allowed_headers - {"authorization", "content-type"}:
                    raise APIError(403, "preflight_forbidden", "Unsupported preflight method or headers")
                self.send_json(200, {"ok": True}, origin)
                return
            if method != supported[path]:
                raise APIError(405, "method_not_allowed", "Method is not supported for this endpoint")
            if not self.app.semaphore.acquire(blocking=False):
                raise APIError(429, "busy", "Service concurrency limit reached; retry shortly")
            acquired = True
            authorization = self.headers.get_all("Authorization", [])
            authenticated = len(authorization) == 1 and self.app.auth.verify(authorization[0], origin)
            session_id = self.app.auth.session_id(authorization[0]) if authenticated else ""
            c = self.app.config
            if path == "/api/status":
                if authorization and not authenticated:
                    raise APIError(401, "session_expired", "Sign in again to continue")
                self.send_json(200, self.app.status(authenticated), origin)
                return
            if path != "/api/session" and not authenticated:
                raise APIError(401, "authentication_required", "A valid Bearer session is required")
            if path == "/api/changes":
                status = self.app.retriever.status()
                self.send_json(200, {"snapshot": status["snapshot"], "aggregates": status["aggregates"],
                                     "changes": None, "change_tracking": "snapshot_only", "dataset": "real"}, origin)
                return
            body = self.body()
            if path == "/api/session":
                if set(body) != {"password"} or not isinstance(body["password"], str) or not 1 <= len(body["password"]) <= 1024:
                    raise InputError("password must be a nonempty string of at most 1024 characters")
                # Bound verification concurrency, then compare even during failed-login
                # throttling so one proxied peer cannot lock out a correct password.
                if not self.app.auth.validation_slots.acquire(blocking=False):
                    raise APIError(429, "authentication_busy", "Authentication concurrency limit reached")
                try:
                    session = self.app.auth.session(body["password"], origin, self.client_address[0])
                finally:
                    self.app.auth.validation_slots.release()
                if session is None:
                    if not self.app.auth.allowed_attempt(self.client_address[0]):
                        raise APIError(429, "login_rate_limited", "Too many failed sign-ins; retry in five minutes")
                    self.quota([("invalid-login:global", c.login_per_hour, 3600)])
                    raise APIError(401, "invalid_password", "Invalid password or authentication unavailable")
                # Session issuance and model work have independent global budgets.
                self.quota([("session-issuance:global", 600, 3600)])
                self.send_json(200, session, origin)
            elif path == "/api/search":
                if set(body) - {"query", "filters", "expand", "semantic", "relax", "limit"}:
                    raise InputError("Unknown search field")
                self.quota([(f"search:{session_id}", c.search_per_minute, 60), ("search:global", c.global_search_per_minute, 60)])
                result = self.app.search.search(body.get("query", ""), body.get("filters"), expand=body.get("expand", True),
                                                semantic=body.get("semantic", True), limit=body.get("limit", 12),
                                                relax=body.get("relax", False), model_guard=lambda: self.model_guard(session_id))
                self.send_json(200, result, origin)
            elif path == "/api/chat":
                if set(body) - {"message", "history", "filters", "expand", "relax"}:
                    raise InputError("Unknown chat field")
                self.quota([(f"chat:{session_id}", c.chat_per_minute, 60), ("chat:global", c.global_chat_per_minute, 60)])
                self.send_json(200, self.app.chat.answer(body.get("message"), body.get("history"), body.get("filters"),
                                                        expand=body.get("expand", True), relax=body.get("relax", False),
                                                        model_guard=lambda: self.model_guard(session_id)), origin)
        except APIError as error:
            self.send_json(error.status, {"error": {"code": error.code, "message": error.message}}, origin)
        except InputError as error:
            self.send_json(400, {"error": {"code": "invalid_input", "message": str(error)}}, origin)
        except SnapshotChanged:
            self.send_json(503, {"error": {"code": "snapshot_changed", "message": "Database snapshot changed; the API must restart before serving this version"}}, origin)
        except QueryTimeout:
            self.send_json(503, {"error": {"code": "query_timeout", "message": "Database query exceeded its time limit; narrow the query"}}, origin)
        except (TimeoutError, socket.timeout):
            self.send_json(408, {"error": {"code": "request_timeout", "message": "Request read timed out"}}, origin)
        except (OSError, ValueError, RuntimeError):
            self.send_json(503, {"error": {"code": "service_unavailable", "message": "The database service is temporarily unavailable"}}, origin)
        finally:
            if acquired:
                self.app.semaphore.release()

    def do_GET(self):
        self.handle_request("GET")

    def do_POST(self):
        self.handle_request("POST")

    def do_OPTIONS(self):
        self.handle_request("OPTIONS")

    def do_HEAD(self):
        self.handle_request("HEAD")


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 24

    def __init__(self, address, app: Application):
        self.app = app
        super().__init__(address, Handler)
        self.connection_slots = threading.BoundedSemaphore(app.config.max_requests + 8)

    def process_request(self, request, client_address):
        if not self.connection_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.connection_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.connection_slots.release()

    def handle_error(self, request, client_address):
        # No traceback might accidentally contain request/body or local configuration.
        print("API request failed", flush=True)


def make_server(bind: str = "127.0.0.1", port: int = 8791, config: Config | None = None) -> Server:
    if bind not in {"127.0.0.1", "localhost"}:
        raise ValueError("This service must bind to loopback; use the existing public reverse proxy")
    return Server((bind, port), Application(config or Config.from_env()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()
    server = make_server(args.bind, args.port)
    print(f"ZGCLab read-only database API listening on {args.bind}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
