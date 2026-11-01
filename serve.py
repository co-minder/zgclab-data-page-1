#!/usr/bin/env python3
"""Serve only published application files, with gzip and conditional caching."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
ASSETS = {"index.html", "app.js", "core.js", "styles.css", "favicon.svg", "favicon.ico"}
CACHE: dict[tuple[str, int, int, bool], bytes] = {}


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        self.serve(False)

    def do_GET(self) -> None:
        self.serve(True)

    def serve(self, body: bool) -> None:
        name = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
        if name == "favicon.ico":
            name = "favicon.svg"
        path = (ROOT / name).resolve()
        is_data = name.startswith("data/") and name.endswith(".js")
        if not path.is_relative_to(ROOT) or not (name in ASSETS or is_data) or not path.is_file():
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
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if name.startswith("data/details/") else "no-cache")
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", default=8788, type=int)
    args = parser.parse_args()
    print(f"ZGCLab serving on http://{args.bind}:{args.port}/", flush=True)
    ThreadingHTTPServer((args.bind, args.port), Handler).serve_forever()
