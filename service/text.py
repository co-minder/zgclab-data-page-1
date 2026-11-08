from __future__ import annotations

import re
import unicodedata

WORD = re.compile(r"[a-z0-9]+|[\u3400-\u9fff]+", re.I)
CHINESE = re.compile(r"^[\u3400-\u9fff]+$")


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold()


def tokens(value: str) -> str:
    """FTS5 Unicode tokens plus adjacent Chinese bigrams; no external tokenizer."""
    result = []
    for word in WORD.findall(normalize(value)):
        if CHINESE.fullmatch(word) and len(word) > 1:
            result.extend(word[i : i + 2] for i in range(len(word) - 1))
        else:
            result.append(word)
    return " ".join(result)


def phrase(value: str) -> str:
    # All user/model terms become quoted literal FTS tokens, never FTS syntax.
    return '"' + tokens(value).replace('"', '""') + '"'


def paragraphs(value: str, limit: int = 900):
    """Stable paragraph/chunk numbering, preserving text without summarizing it."""
    for block in re.split(r"\n\s*\n|\n", value.replace("\r\n", "\n").replace("\r", "\n")):
        block = block.strip()
        while block:
            if len(block) <= limit:
                yield block
                break
            boundary = max(block.rfind(ch, limit // 2, limit) for ch in ("。", "！", "？", ". ", "; ", " "))
            end = boundary + 1 if boundary >= limit // 2 else limit
            yield block[:end].strip()
            block = block[end:].lstrip()


def snippet(text: str, terms: list[str], limit: int = 620) -> str:
    if len(text) <= limit:
        return text
    lower = normalize(text)
    positions = [lower.find(normalize(t)) for t in terms if t and normalize(t) in lower]
    start = max(0, min(positions, default=0) - 100)
    start = min(start, len(text) - limit)
    # Return an exact substring, without synthetic ellipses, for quote validation.
    return text[start : start + limit]
