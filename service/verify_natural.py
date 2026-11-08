"""Two exact acceptance questions over HTTP; at most four Flash completion calls."""
from __future__ import annotations

import hashlib
import json
import secrets
import tempfile
import threading
import time
import urllib.request
from dataclasses import replace
from pathlib import Path

from .app import make_server
from .config import Config, PROJECT

QUESTION = "请概括 Arkansas State 对阵 South Alabama 的比赛结果，并给出原文引用。"
FOLLOWUP = "这条资料里双方比分是怎样的？请继续引用同一来源。"


def source_hash():
    digest = hashlib.sha256()
    for path in sorted((PROJECT / "service").glob("*.py")) + [PROJECT / "tests/test_service.py"]:
        digest.update(path.relative_to(PROJECT).as_posix().encode() + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()


def main():
    config = Config.from_env()
    with tempfile.TemporaryDirectory(prefix="service-natural-http-", dir=config.database.parent) as directory:
        password_file = Path(directory) / "password"
        password = secrets.token_urlsafe(32)
        password_file.write_text(password)
        server = make_server(port=0, config=replace(config, password_file=password_file))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        token = ""

        def request(path, body):
            headers = {"Origin": "http://127.0.0.1:8789", "Content-Type": "application/json"}
            if token:
                headers["Authorization"] = "Bearer " + token
            req = urllib.request.Request(f"http://127.0.0.1:{server.server_port}" + path,
                                         data=json.dumps(body, ensure_ascii=False).encode(), headers=headers)
            with opener.open(req, timeout=105) as response:
                if response.status != 200:
                    raise AssertionError("Unexpected HTTP status")
                return json.load(response)

        try:
            token = request("/api/session", {"password": password})["token"]
            snapshot = server.app.retriever.snapshot
            print(json.dumps({"source_version": snapshot["source_version"], "research_version": snapshot["research_version"],
                              "database_sha256": snapshot["content_sha256"], "schema_version": snapshot["schema_version"],
                              "service_source_sha256": source_hash(), "model": config.llm_model,
                              "credential": "ephemeral_fixture_only", "maximum_model_completions": 4}, ensure_ascii=False), flush=True)
            history, failures = [], []
            scope = {"institution": [1002550], "angle": ["social"], "date_field": "published_at"}
            for name, question in [("acceptance_original_natural", QUESTION), ("acceptance_same_source_followup", FOLLOWUP)]:
                started = time.monotonic()
                response = request("/api/chat", {"message": question, "history": history, "filters": scope, "expand": True})
                citations = response["citations"]
                valid = bool(response["state"] == "answered" and response["model"]["used"] and citations
                             and {c["id"] for c in citations} == {"social-1"}
                             and all(c.get("quotes") and all(q in c["snippet"] for q in c["quotes"]) for c in citations)
                             and not response["plan"]["relaxed"])
                safe = {"name": name, "question": question, "transport": "loopback_http",
                        "duration_seconds": round(time.monotonic() - started, 3), "passed": valid,
                        "state": response["state"], "model": response["model"], "usage": response["usage"],
                        "query": response["query"], "plan": response["plan"], "coverage": response["coverage"],
                        "answer": response["answer"], "answer_format": response.get("answer_format"),
                        "citations": [{k: c.get(k) for k in ("citation_id", "id", "angle", "field", "source_field", "paragraph", "paragraph_scheme", "source_url", "snippet", "quotes")} for c in citations]}
                print(json.dumps(safe, ensure_ascii=False), flush=True)
                if not valid:
                    failures.append(name)
                    break  # Do not spend further calls after a failed first turn.
                history += [{"role": "user", "content": question}, {"role": "assistant", "content": response["answer"]}]
            print(json.dumps({"verification": "pass" if not failures else "fail", "failures": failures,
                              "source_sha256": source_hash()}, ensure_ascii=False), flush=True)
            if failures:
                raise SystemExit(1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    main()
