from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def token_usage(value) -> dict:
    """Keep the existing public token counters; never carry remote error text."""
    return {key: item for key, item in value.items()
            if key in {"prompt_tokens", "completion_tokens", "total_tokens"}
            and isinstance(item, int) and not isinstance(item, bool) and item >= 0} if isinstance(value, dict) else {}


def protocol_metadata(result: dict) -> dict:
    """Structural diagnostics only: no generated text, reasoning, URLs or IDs."""
    choices = result.get("choices")
    choice = choices[0] if isinstance(choices, list) and choices else None
    message = choice.get("message") if isinstance(choice, dict) else None
    finish = choice.get("finish_reason") if isinstance(choice, dict) else None
    metadata = {"choices_type": type(choices).__name__, "message_type": type(message).__name__,
                "finish_reason": finish if isinstance(finish, str) and finish in {"stop", "length", "tool_calls", "function_call", "content_filter"} else "absent" if finish is None else "other"}
    if isinstance(message, dict):
        for key in ("content", "reasoning_content"):
            value = message.get(key)
            metadata[key + "_type"] = type(value).__name__
            if isinstance(value, (str, list)):
                metadata[key + "_length"] = len(value)
    usage = result.get("usage")
    details = usage.get("completion_tokens_details") if isinstance(usage, dict) else None
    reasoning_tokens = details.get("reasoning_tokens") if isinstance(details, dict) else None
    if isinstance(reasoning_tokens, int) and not isinstance(reasoning_tokens, bool) and reasoning_tokens >= 0:
        metadata["reasoning_tokens"] = reasoning_tokens
    return metadata


class ModelUnavailable(RuntimeError):
    def __init__(self, reason: str, *, usage=None, diagnostics=None):
        self.reason = reason
        self.usage = token_usage(usage)
        self.diagnostics = diagnostics or {}
        super().__init__(reason)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, newurl):
        return None


class LLMClient:
    """Keyless OpenAI chat client restricted to the explicitly configured local relay."""

    def __init__(self, base_url: str, model: str, timeout: float = 55, concurrency: int = 2):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = min(float(timeout), 95.0)
        self.semaphore = threading.BoundedSemaphore(concurrency)
        self.health_lock = threading.Lock()
        self.health_cache: tuple[float, dict] = (0, {})
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            parsed = urlsplit(self.base_url)
            parsed_port = parsed.port
        except ValueError:
            parsed = urlsplit("")
            parsed_port = None
        self.configured = bool(
            parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
            and parsed_port and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment and parsed.path.rstrip("/") == "/v1"
            and model == "auto/deepseek-v4.1-flash"
        )
        self.health_url = f"{parsed.scheme}://{parsed.netloc}/health" if self.configured else ""

    def health(self) -> dict:
        if not self.configured:
            return {"available": False, "state": "configuration_unavailable", "model": self.model, "checked_at": None}
        with self.health_lock:
            now = time.monotonic()
            if now - self.health_cache[0] < 15:
                return dict(self.health_cache[1])
            result = {"available": False, "state": "unreachable", "model": self.model, "checked_at": int(time.time())}
            try:
                with self.opener.open(urllib.request.Request(self.health_url, headers={"Accept": "application/json"}), timeout=2) as response:
                    body = self.bounded_response(response, 16384, time.monotonic() + 2)
                    payload = json.loads(body)
                    if not isinstance(payload, dict):
                        raise ValueError("Invalid health response")
                    announced = payload.get("model")
                    if announced and announced != self.model:
                        result["state"] = "model_mismatch"
                    elif payload.get("ok", True) is False or payload.get("available", True) is False or payload.get("upstream_available", True) is False:
                        result["state"] = "relay_unavailable"
                    else:
                        result.update(available=True, state="ready")
                        result["health_scope"] = "relay_reported_upstream" if any(k in payload for k in ("upstream", "upstream_available", "upstream_checked_at")) else "relay_health"
            except (OSError, ValueError, urllib.error.URLError, ModelUnavailable):
                pass
            self.health_cache = (time.monotonic(), result)
            return dict(result)

    @staticmethod
    def bounded_response(response, maximum: int, deadline: float) -> bytes:
        chunks, length = [], 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ModelUnavailable("model_timeout")
            # urllib's HTTPResponse supports read1; update the local relay socket's
            # timeout before each bounded read so a slow body cannot renew the budget.
            raw = getattr(getattr(response, "fp", None), "raw", None)
            sock = getattr(raw, "_sock", None)
            if sock is not None:
                sock.settimeout(remaining)
            part = response.read1(min(65536, maximum + 1 - length))
            if not part:
                return b"".join(chunks)
            chunks.append(part)
            length += len(part)
            if length > maximum:
                raise ModelUnavailable("model_response_too_large")

    def complete(self, messages: list[dict], max_tokens: int, timeout: float | None = None) -> tuple[str, dict]:
        if not self.configured:
            raise ModelUnavailable("configuration_unavailable")
        if not self.semaphore.acquire(blocking=False):
            raise ModelUnavailable("model_busy")
        try:
            # DeepSeek Chat defaults to high thinking, which consumes max_tokens
            # before final content. The fixed model supports this documented toggle;
            # the restricted project relay must allowlist it through to magpie.
            payload = {"model": self.model, "messages": messages, "max_tokens": min(max_tokens, 4096),
                       "temperature": 0, "stream": False, "thinking": {"type": "disabled"}}
            request = urllib.request.Request(self.base_url + "/chat/completions", data=json.dumps(payload, ensure_ascii=False).encode(), headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")
            budget = min(self.timeout, timeout if timeout is not None else self.timeout)
            if budget <= 0:
                raise ModelUnavailable("model_timeout")
            try:
                request_deadline = time.monotonic() + budget
                with self.opener.open(request, timeout=budget) as response:
                    body = self.bounded_response(response, 786432, request_deadline)
                    result = json.loads(body)
            except TimeoutError:
                raise ModelUnavailable("model_timeout") from None
            except urllib.error.URLError as error:
                # Never expose remote error bodies or headers, which may contain private config.
                reason = "model_timeout" if isinstance(error.reason, TimeoutError) else "model_unreachable"
                raise ModelUnavailable(reason) from None
            except (OSError, ValueError, RecursionError):
                raise ModelUnavailable("model_unreachable") from None
            if not isinstance(result, dict):
                raise ModelUnavailable("invalid_model_response")
            served = result.get("model", "")
            if not isinstance(served, str) or served not in {self.model, "deepseek-v4.1-flash"}:
                raise ModelUnavailable("model_mismatch")
            safe_usage = token_usage(result.get("usage"))
            diagnostics = protocol_metadata(result)
            choices = result.get("choices")
            if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
                raise ModelUnavailable("invalid_model_response", usage=safe_usage, diagnostics=diagnostics)
            choice = choices[0]
            message = choice.get("message")
            if not isinstance(message, dict):
                raise ModelUnavailable("invalid_model_response", usage=safe_usage, diagnostics=diagnostics)
            # A length stop can contain a partial JSON string or reasoning alone.
            # Neither is a complete answer, even if some final content is present.
            if choice.get("finish_reason") == "length":
                raise ModelUnavailable("model_output_truncated", usage=safe_usage, diagnostics=diagnostics)
            if choice.get("finish_reason") not in (None, "stop") or message.get("role", "assistant") != "assistant" or message.get("tool_calls") or message.get("function_call") or message.get("refusal"):
                raise ModelUnavailable("invalid_model_response", usage=safe_usage, diagnostics=diagnostics)
            text = message.get("content")
            # reasoning_content is deliberately never an alternate final channel.
            if not isinstance(text, str) or not text.strip() or len(text) > 30000:
                raise ModelUnavailable("invalid_model_response", usage=safe_usage, diagnostics=diagnostics)
            return text, safe_usage
        finally:
            self.semaphore.release()


def json_object(text: str) -> dict:
    stripped = text.strip()
    if stripped.startswith("```json") and stripped.endswith("```"):
        stripped = stripped[7:-3].strip()
    elif stripped.startswith("```") and stripped.endswith("```"):
        stripped = stripped[3:-3].strip()
    try:
        obj = json.loads(stripped)
    except ValueError:
        raise ModelUnavailable("invalid_model_json") from None
    if not isinstance(obj, dict):
        raise ModelUnavailable("invalid_model_json")
    return obj
