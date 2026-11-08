"""Build the ignored SQLite snapshot from complete checked-in JS details."""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import fcntl
import hashlib
import json
import os
import sqlite3
import tempfile
from pathlib import Path

from . import SCHEMA_VERSION
from .config import PROJECT
from .text import WORD, normalize, paragraphs, tokens

ANGLES = ("news", "clue", "social")
COLUMNS = """
    id TEXT PRIMARY KEY, ktid INTEGER NOT NULL,
    institution_cn TEXT NOT NULL, institution_en TEXT NOT NULL,
    title TEXT NOT NULL, title_en TEXT NOT NULL, summary TEXT NOT NULL,
    original_text TEXT NOT NULL, translation TEXT NOT NULL,
    platform TEXT NOT NULL, source_url TEXT NOT NULL,
    collected_at TEXT NOT NULL, published_at TEXT NOT NULL,
    source_version TEXT NOT NULL, fields_json TEXT NOT NULL, summary_json TEXT NOT NULL,
    published_original TEXT NOT NULL, published_effective_at TEXT NOT NULL,
    date_origin TEXT NOT NULL, date_verified INTEGER NOT NULL, date_basis_json TEXT NOT NULL,
    translation_status TEXT NOT NULL
"""


def load_assignment(path: Path):
    text = path.read_text(encoding="utf-8")
    prefix, separator, payload = text.partition("=")
    if not separator or not prefix.strip().startswith("window.ZGCLAB_"):
        raise ValueError(f"Unexpected snapshot format: {path.name}")
    return json.loads(payload.strip().removesuffix(";"))


def iso_date(value) -> str:
    if not value:
        return ""
    raw = str(value).strip()
    try:
        date = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if date.tzinfo is None:
            date = date.replace(tzinfo=dt.timezone.utc)
        return date.astimezone(dt.timezone.utc).isoformat(timespec="seconds")
    except ValueError:
        return ""


def build(project: Path = PROJECT, database: Path | None = None) -> dict:
    database = database or project / ".runtime" / "retrieval.sqlite3"
    # Runtime must stay outside published files and versioned source data.
    runtime = (project / ".runtime").resolve()
    if not database.resolve().is_relative_to(runtime):
        raise ValueError("Runtime database must be under the project's ignored .runtime directory")
    runtime.mkdir(mode=0o700, exist_ok=True)
    with (runtime / "retrieval-ingest.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return _build(project, database)


def _build(project: Path, database: Path) -> dict:
    data = project / "data"
    metadata = load_assignment(data / "meta.js")
    version = metadata["version"]
    if not isinstance(version, str) or not version.isalnum():
        raise ValueError("Invalid source version")
    details_dir = data / "details" / version
    if not details_dir.is_dir():
        raise ValueError("Complete detail snapshot is missing; ingestion will not use truncated summaries")
    institutions = {int(i["ktid"]): i for i in metadata["institutions"]}
    research_path = data / "research.js"
    research = load_assignment(research_path) if research_path.is_file() else {}
    if research and (research.get("source", {}).get("version") != version or research.get("source", {}).get("simulation_included") is not False):
        raise ValueError("Research metadata does not match the real source snapshot")
    research_records = research.get("records", {})
    descriptor, filename = tempfile.mkstemp(prefix="retrieval-build-", suffix=".sqlite3", dir=database.parent)
    os.close(descriptor)
    temp = Path(filename)
    con = sqlite3.connect(temp)
    counts = {}
    digest = hashlib.sha256()
    if research:
        digest.update(research_path.read_bytes())
    vocab = collections.Counter()
    try:
        con.executescript("""
            PRAGMA journal_mode=OFF;
            PRAGMA synchronous=OFF;
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE institutions (ktid INTEGER PRIMARY KEY, cn TEXT NOT NULL, en TEXT NOT NULL);
            CREATE TABLE paragraphs (
                pid INTEGER PRIMARY KEY, record_id TEXT NOT NULL, angle TEXT NOT NULL,
                paragraph INTEGER NOT NULL, field TEXT NOT NULL, text TEXT NOT NULL,
                UNIQUE(record_id, paragraph)
            );
            CREATE INDEX paragraph_record ON paragraphs(record_id, paragraph);
            CREATE VIRTUAL TABLE paragraph_fts USING fts5(text, context, content='', tokenize='unicode61 remove_diacritics 2');
            CREATE TABLE vocabulary (word TEXT PRIMARY KEY, frequency INTEGER NOT NULL);
        """)
        con.executemany("INSERT INTO institutions VALUES (?,?,?)", [(k, v["cn"], v["en"]) for k, v in institutions.items()])
        for angle in ANGLES:
            con.execute(f"CREATE TABLE {angle} ({COLUMNS})")
            con.execute(f"CREATE INDEX {angle}_institution ON {angle}(ktid)")
            con.execute(f"CREATE INDEX {angle}_dates ON {angle}(published_at, collected_at)")
            con.execute(f"CREATE INDEX {angle}_effective_dates ON {angle}(published_effective_at)")
            con.execute(f"CREATE INDEX {angle}_platform ON {angle}(platform)")
            summary_path = data / f"{angle}.js"
            digest.update(summary_path.read_bytes())
            summaries = load_assignment(summary_path)
            details = {}
            for path in sorted(details_dir.glob(f"{angle}-*.js")):
                digest.update(path.read_bytes())
                for item in load_assignment(path):
                    if item["id"] in details:
                        raise ValueError("Duplicate stable detail ID")
                    details[item["id"]] = item
            if set(details) != {s["id"] for s in summaries}:
                raise ValueError(f"Summary/detail ID mismatch for {angle}")
            for summary in summaries:
                item = details[summary["id"]]
                fields = item["fields"]
                ktid = int(summary["ktid"])
                if int(item["ktid"]) != ktid or ktid not in institutions:
                    raise ValueError("Institution association mismatch")
                inst = institutions[ktid]
                title = str(fields.get("title_cn") or fields.get("clue_title") or fields.get("title") or summary.get("title") or "")
                title_en = str(fields.get("title_en") or "")
                short = str(fields.get("summary_cn") or fields.get("clue_summary") or summary.get("summary") or "")
                original = str(fields.get("content") or fields.get("original_content") or "")
                translation = str(fields.get("content_cn") or fields.get("chinese_trans") or fields.get("chinese_translation") or "")
                platform = str(fields.get("platform") or fields.get("publish_channel") or fields.get("source") or summary.get("source") or "")
                url = str(fields.get("url") or fields.get("original_url") or fields.get("source_url") or fields.get("content_url") or "")
                collected = iso_date(fields.get("collected_time") or fields.get("discovery_time") or fields.get("founddate"))
                published = iso_date(fields.get("publish_time"))
                research_record = research_records.get(summary["id"], {})
                publication = research_record.get("publication", {})
                if research_record and (research_record.get("angle") != angle or research_record.get("ktid") != ktid):
                    raise ValueError("Research institution/angle association mismatch")
                original_raw = str(fields.get("publish_time") or "")
                origin = publication.get("status", "provided" if published else "missing")
                if origin not in {"provided", "recovered", "missing", "unverified"}:
                    raise ValueError("Unknown research publication status")
                effective = published
                if origin == "recovered" and publication.get("verified") is True:
                    effective = iso_date(publication.get("effective"))
                translation_status = research_record.get("translation", {}).get("status", "available" if translation else "missing")
                if translation_status not in {"available", "placeholder", "missing"}:
                    raise ValueError("Unknown translation status")
                row = (summary["id"], ktid, inst["cn"], inst["en"], title, title_en, short,
                       original, translation, platform, url, collected, published, version,
                       json.dumps(fields, ensure_ascii=False, separators=(",", ":")),
                       json.dumps(summary, ensure_ascii=False, separators=(",", ":")),
                       original_raw, effective, origin, int(publication.get("verified") is True),
                       json.dumps(publication.get("basis", []), ensure_ascii=False), translation_status)
                con.execute(f"INSERT INTO {angle} VALUES ({','.join('?' for _ in row)})", row)
                context = tokens(" ".join([title, title_en, inst["cn"], inst["en"], platform]))
                number = 0
                for field, value in [("title", title), ("title_en", title_en), ("summary", short),
                                     ("summary_en", str(fields.get("summary_en") or "")),
                                     ("original_text", original), ("translation", translation)]:
                    for paragraph in paragraphs(value):
                        number += 1
                        cursor = con.execute("INSERT INTO paragraphs(record_id,angle,paragraph,field,text) VALUES (?,?,?,?,?)",
                                             (summary["id"], angle, number, field, paragraph))
                        con.execute("INSERT INTO paragraph_fts(rowid,text,context) VALUES (?,?,?)", (cursor.lastrowid, tokens(paragraph), context))
                    vocab.update(w for w in WORD.findall(normalize(value)) if w.isascii() and w.isalpha() and 3 <= len(w) <= 32)
            counts[angle] = len(summaries)
            if counts[angle] != int(metadata["totals"][angle]):
                raise ValueError(f"Unexpected snapshot count for {angle}")
            con.commit()
            print(f"Imported {angle}: {counts[angle]} complete records", flush=True)
        con.execute("CREATE VIEW records AS " + " UNION ALL ".join(f"SELECT '{a}' AS angle, * FROM {a}" for a in ANGLES))
        con.executemany("INSERT INTO vocabulary VALUES (?,?)", [(w, n) for w, n in vocab.most_common(50000) if n >= 2])
        snapshot = {
            "schema_version": SCHEMA_VERSION,
            "source_version": version,
            "source_package": str(metadata.get("source_package", "")),
            "source_generated_at": metadata.get("generated_at"),
            "ingested_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "content_sha256": digest.hexdigest(),
            "dataset": "real",
            "total": sum(counts.values()),
            "by_angle": counts,
            "paragraphs": con.execute("SELECT COUNT(*) FROM paragraphs").fetchone()[0],
            "research_version": research.get("version"),
            "research_builder_version": research.get("builder_version"),
            "date_scope_default": "published_at (original source field only)",
            "field_map": research.get("field_map", {}),
            "quality": {
                "publication": dict(con.execute("SELECT date_origin,COUNT(*) FROM records GROUP BY date_origin").fetchall()),
                "translation": dict(con.execute("SELECT translation_status,COUNT(*) FROM records GROUP BY translation_status").fetchall()),
            },
        }
        # Source fields are immutable inputs; do not publish a mixed metadata/data build.
        if research and load_assignment(research_path).get("version") != research.get("version"):
            raise ValueError("Research metadata changed during ingestion; rebuild the final snapshot")
        con.execute("INSERT INTO metadata VALUES ('snapshot',?)", (json.dumps(snapshot, ensure_ascii=False),))
        con.execute("INSERT INTO paragraph_fts(paragraph_fts) VALUES ('optimize')")
        con.commit()
        if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("SQLite integrity verification failed")
        con.close()
        os.chmod(temp, 0o600)
        os.replace(temp, database)
        return snapshot
    except BaseException:
        con.close()
        temp.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=PROJECT)
    parser.add_argument("--database", type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.project, args.database), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
