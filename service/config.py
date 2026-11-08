from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_ORIGINS = (
    "https://co-minder.github.io",
    "https://bringing-themes-mae-dating.trycloudflare.com",
    "http://127.0.0.1:8788",
    "http://localhost:8788",
    "http://127.0.0.1:8789",
    "http://localhost:8789",
    "http://127.0.0.1:8791",
    "http://localhost:8791",
)


def valid_origin(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        return bool(
            parsed.scheme in {"http", "https"}
            and parsed.hostname
            and "*" not in value
            and not parsed.username
            and not parsed.password
            and parsed.path == ""
            and not parsed.query
            and not parsed.fragment
            and parsed.port != 0
        )
    except ValueError:
        return False


@dataclass
class Config:
    database: Path = PROJECT / ".runtime" / "retrieval.sqlite3"
    password_file: Path = PROJECT / ".runtime" / "pages-password"
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: DEFAULT_ORIGINS)
    llm_base_url: str = "http://127.0.0.1:13426/v1"
    llm_model: str = "auto/deepseek-v4.1-flash"
    token_ttl: int = 900
    max_body: int = 65536
    request_timeout: float = 10.0
    database_timeout: float = 4.0
    llm_timeout: float = 55.0
    chat_timeout: float = 95.0
    max_requests: int = 12
    max_llm_requests: int = 2
    search_per_minute: int = 24
    chat_per_minute: int = 8
    model_per_minute: int = 10
    global_search_per_minute: int = 180
    global_chat_per_minute: int = 40
    global_model_per_hour: int = 180
    login_per_hour: int = 120

    def __post_init__(self) -> None:
        if not self.allowed_origins or not all(valid_origin(o) for o in self.allowed_origins):
            raise ValueError("Allowed origins must be explicit HTTP(S) origins without paths or wildcards")
        if self.token_ttl < 30 or self.token_ttl > 3600:
            raise ValueError("Token lifetime must be between 30 and 3600 seconds")

    @classmethod
    def from_env(cls) -> "Config":
        origins = os.environ.get("ZGCLAB_ALLOWED_ORIGINS")
        return cls(
            database=Path(os.environ.get("ZGCLAB_DB_PATH", str(PROJECT / ".runtime/retrieval.sqlite3"))),
            allowed_origins=tuple(o.strip() for o in origins.split(",") if o.strip()) if origins is not None else DEFAULT_ORIGINS,
            llm_base_url=os.environ.get("ZGCLAB_LLM_BASE_URL", "http://127.0.0.1:13426/v1"),
            llm_model=os.environ.get("ZGCLAB_LLM_MODEL", "auto/deepseek-v4.1-flash"),
        )
