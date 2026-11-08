#!/usr/bin/env python3
"""Read-only research runtime status on social. No credentials or model calls."""
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
origin = "https://co-minder.github.io"
status = {}
for label, url in (("database", "http://127.0.0.1:8791/api/status"), ("relay", "http://127.0.0.1:13426/health")):
    try:
        with urlopen(Request(url, headers={"Origin": origin}), timeout=5) as response:
            body = json.load(response)
        status[label] = {"http_status": response.status, "state": body.get("state") or body.get("status"), "model_available": body.get("available", body.get("llm", {}).get("available"))}
    except Exception:
        status[label] = {"state": "unavailable"}
status["runtime_database_present"] = (ROOT / ".runtime/retrieval.sqlite3").is_file()
print(json.dumps(status, ensure_ascii=False, indent=2))
