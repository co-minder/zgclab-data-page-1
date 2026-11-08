from __future__ import annotations

import base64
import collections
import hashlib
import hmac
import json
import secrets
import threading
import time
from pathlib import Path


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class Auth:
    def __init__(self, password_file: Path, ttl: int = 900):
        self.password_file, self.ttl = password_file, ttl
        # An ephemeral signing key never leaves memory; restarting invalidates sessions.
        self.signing_key = secrets.token_bytes(32)
        self.lock = threading.Lock()
        self.validation_slots = threading.BoundedSemaphore(3)
        self.failures: collections.OrderedDict[str, list[float]] = collections.OrderedDict()

    def password_digest(self) -> bytes | None:
        try:
            password = self.password_file.read_bytes().rstrip(b"\r\n")
            if not 1 <= len(password) <= 4096:
                return None
            return hashlib.sha256(password).digest()
        except OSError:
            return None

    def ready(self) -> bool:
        return self.password_file.is_file()

    def allowed_attempt(self, client: str) -> bool:
        now = time.monotonic()
        with self.lock:
            self.failures.setdefault(client, [])
            self.failures.move_to_end(client)
            self.failures[client] = [stamp for stamp in self.failures[client] if now - stamp < 300]
            while len(self.failures) > 2048:
                self.failures.popitem(last=False)
            return len(self.failures[client]) < 8

    def session(self, password: str, origin: str, client: str) -> dict | None:
        supplied = hashlib.sha256(password.encode()).digest()
        expected = self.password_digest()
        valid = hmac.compare_digest(supplied, expected or bytes(32))
        if not valid or expected is None:
            with self.lock:
                events = self.failures.setdefault(client, [])
                events.append(time.monotonic())
                self.failures[client] = events[-8:]
            return None
        now = int(time.time())
        payload = {"exp": now + self.ttl, "iat": now, "origin": origin, "nonce": secrets.token_hex(12),
                   "generation": hmac.new(self.signing_key, expected, hashlib.sha256).hexdigest()[:24]}
        body = encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
        signature = encode(hmac.new(self.signing_key, body.encode(), hashlib.sha256).digest())
        return {"token": body + "." + signature, "token_type": "Bearer", "expires_in": self.ttl, "expires_at": payload["exp"]}

    def session_id(self, header: str) -> str:
        return hmac.new(self.signing_key, header.encode(), hashlib.sha256).hexdigest()[:32]

    def verify(self, header: str, origin: str) -> bool:
        if len(header) > 2048 or not header.startswith("Bearer "):
            return False
        try:
            body, signature = header[7:].split(".", 1)
            expected_signature = encode(hmac.new(self.signing_key, body.encode("ascii"), hashlib.sha256).digest())
            if not hmac.compare_digest(signature, expected_signature):
                return False
            payload = json.loads(decode(body))
            now = int(time.time())
            expected = self.password_digest()
            generation = hmac.new(self.signing_key, expected or bytes(32), hashlib.sha256).hexdigest()[:24]
            return bool(expected is not None and payload["origin"] == origin and payload["iat"] <= now + 5
                        and now < payload["exp"] <= now + self.ttl + 5 and hmac.compare_digest(payload["generation"], generation))
        except (ValueError, KeyError, TypeError, UnicodeError):
            return False
