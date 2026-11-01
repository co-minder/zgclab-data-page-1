#!/usr/bin/env python3
"""Create the encrypted static Pages deployment in docs/. Password stays local."""
from __future__ import annotations

import base64
import getpass
import gzip
import hashlib
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

HERE = Path(__file__).resolve().parent
OUT = HERE / "docs"
PASSWORD_FILE = HERE / ".runtime" / "pages-password"
ITERATIONS = 600_000


def main() -> None:
    password = os.environ.get("ZGCLAB_BUILD_PASSWORD")
    if password is None and PASSWORD_FILE.is_file():
        password = PASSWORD_FILE.read_text().rstrip("\r\n")
    if password is None:
        password = getpass.getpass("Pages access password: ")
    if not password:
        raise SystemExit("Password cannot be empty")
    salt = os.urandom(16)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(password.encode())
    aes = AESGCM(key)
    paths = [HERE / name for name in ["index.html", "styles.css", "app.js", "core.js"]]
    paths += sorted((HERE / "data").rglob("*.js"))
    (OUT / "encrypted").mkdir(parents=True, exist_ok=True)
    assets = {}
    total_bytes = 0
    for path in paths:
        name = path.relative_to(HERE).as_posix()
        iv = os.urandom(12)
        data = iv + aes.encrypt(iv, gzip.compress(path.read_bytes(), compresslevel=9, mtime=0), name.encode())
        encrypted_name = "encrypted/" + hashlib.sha256(data).hexdigest() + ".bin"
        (OUT / encrypted_name).write_bytes(data)
        assets[name] = encrypted_name
        total_bytes += len(data)
    manifest = {
        "version": hashlib.sha256(json.dumps(assets, sort_keys=True).encode()).hexdigest()[:20],
        "salt": base64.b64encode(salt).decode(), "iterations": ITERATIONS,
        "cipher": "AES-256-GCM", "kdf": "PBKDF2-SHA256", "assets": assets,
    }
    name = "manifest-" + manifest["version"] + ".json"
    (OUT / name).write_text(json.dumps(manifest, separators=(",", ":")))
    for asset in ["access.js", "access.css", "favicon.svg"]:
        (OUT / asset).write_bytes((HERE / asset).read_bytes())
    gate = (HERE / "access.html").read_text().replace("ACCESS_MANIFEST", name).replace("ACCESS_VERSION", manifest["version"])
    (OUT / "index.html").write_text(gate)
    (OUT / ".nojekyll").touch()
    print(json.dumps({"out": str(OUT), "version": manifest["version"], "encrypted_assets": len(assets), "encrypted_mb": round(total_bytes / 1024 / 1024, 2)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
