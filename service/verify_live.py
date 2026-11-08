"""Explicit live-model HTTP checks using a private ephemeral test password, never the Pages password."""
from __future__ import annotations

import json
import time
import secrets
import tempfile
import threading
import urllib.request
from dataclasses import replace
from pathlib import Path

from .app import make_server

from .chat import Chat
from .config import Config
from .llm import LLMClient
from .planner import SearchEngine
from .retrieval import Retriever


def main():
    config = Config.from_env()
    temporary = tempfile.TemporaryDirectory(prefix="service-live-http-", dir=config.database.parent)
    password_file = Path(temporary.name) / "password"
    password = secrets.token_urlsafe(32)
    password_file.write_text(password)
    server = make_server(port=0, config=replace(config, password_file=password_file))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    token = ""

    def request(path, body):
        headers = {"Content-Type": "application/json", "Origin": "https://co-minder.github.io"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(f"http://127.0.0.1:{server.server_port}" + path,
                                     data=json.dumps(body, ensure_ascii=False).encode(), headers=headers)
        with opener.open(req, timeout=105) as response:
            if response.status != 200:
                raise RuntimeError("HTTP live verification failed")
            return json.load(response)

    token = request("/api/session", {"password": password})["token"]
    history = []
    outputs = []
    jobs = [
        ("arkansas_match", "chat", "ArkansasState 比赛", {"institution": [1002550], "angle": ["social"]}),
        ("bilingual_semantic", "search", "人工智能安全", {"angle": ["clue"]}),
        ("bilingual_chat", "chat", "人工智能安全", {"angle": ["clue"]}),
        ("followup_counts", "chat", "那新闻有多少条", {}),
    ]
    for name, kind, query, filters in jobs:
        started = time.monotonic()
        if kind == "search":
            response = request("/api/search", {"query": query, "filters": filters, "semantic": True})
        else:
            response = request("/api/chat", {"message": query, "history": history if name == "followup_counts" else [], "filters": filters})
        safe = {"name": name, "transport": "http", "seconds": round(time.monotonic() - started, 2), "state": response["state"],
                "model": response["model"], "usage": response["usage"], "query": response["query"], "plan": response["plan"],
                "coverage": response["coverage"], "answer": response.get("answer"),
                "citations": response.get("citations", response.get("results", []))}
        outputs.append(safe)
        print(json.dumps(safe, ensure_ascii=False), flush=True)
        if name == "arkansas_match":
            history = [{"role": "user", "content": query}, {"role": "assistant", "content": response["answer"]}]
    expected = {"arkansas_match": "answered", "bilingual_semantic": "retrieval", "bilingual_chat": "answered", "followup_counts": "database_answer"}
    failures = [o["name"] for o in outputs if o["state"] != expected[o["name"]] or (o["name"] != "followup_counts" and not o["model"]["used"])]
    print(json.dumps({"verification": "pass" if not failures else "fail", "failures": failures}, ensure_ascii=False), flush=True)
    server.shutdown()
    server.server_close()
    thread.join(timeout=3)
    temporary.cleanup()
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
