"""Reflection Beam streaming client for the Gradio Space.

Beam is a thinking model: the stream interleaves `reasoning_content` deltas
before `content` deltas. We surface both — the reasoning panel is the point.
"""
import json
import os

import requests

BASE = os.environ.get("REFLECTION_BASE_URL", "https://api.reflection.ai/openai/v1").rstrip("/")
MODEL = os.environ.get("BEAM_MODEL", "Beam-1.0-501B-A23B")
API_KEY = os.environ.get("REFLECTION_API_KEY", "")


class BeamError(Exception):
    pass


def _post(body, timeout=240):
    if not API_KEY:
        raise BeamError("REFLECTION_API_KEY is not configured on this Space.")
    return requests.post(
        f"{BASE}/chat/completions",
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json=body,
        timeout=timeout,
        stream=body.get("stream", False),
    )


def stream_chat(system, user, max_tokens=32_000, temperature=0.8, json_mode=False):
    """Generator yielding event dicts:
    {"kind": "reasoning"|"content", "delta": str}
    {"kind": "usage", "usage": {...}}
    {"kind": "done", "text": str, "reasoning": str, "usage": dict|None}
    Raises BeamError on failure. Retries once without response_format if the
    endpoint rejects it (same fallback as the production TS chain).
    """
    for attempt in (1, 2):
        body = {
            "model": MODEL,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if json_mode and attempt == 1:
            body["response_format"] = {"type": "json_object"}
        try:
            res = _post(body)
        except requests.RequestException as e:
            raise BeamError(f"network error: {str(e)[:200]}")

        if not res.ok:
            err = res.text[:300]
            if attempt == 1 and json_mode and "response_format" in err:
                continue  # retry without response_format
            raise BeamError(f"HTTP {res.status_code}: {err}")

        content, reasoning, usage = [], [], None
        try:
            for line in res.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if chunk.get("usage"):
                    usage = chunk["usage"]
                for choice in chunk.get("choices") or []:
                    delta = choice.get("delta") or {}
                    if delta.get("reasoning_content"):
                        reasoning.append(delta["reasoning_content"])
                        yield {"kind": "reasoning", "delta": delta["reasoning_content"]}
                    if delta.get("content"):
                        content.append(delta["content"])
                        yield {"kind": "content", "delta": delta["content"]}
        except requests.RequestException as e:
            raise BeamError(f"stream interrupted: {str(e)[:200]}")

        text = "".join(content).strip()
        if not text:
            raise BeamError("model returned no visible content (reasoning consumed the whole budget)")
        yield {
            "kind": "done",
            "text": text,
            "reasoning": "".join(reasoning),
            "usage": usage,
        }
        return
    raise BeamError("exhausted retries")


def chat(system, user, max_tokens=16_000, temperature=0.2, json_mode=True):
    """Blocking convenience wrapper (used for the DDL-parsing stage)."""
    last = None
    for ev in stream_chat(system, user, max_tokens=max_tokens, temperature=temperature, json_mode=json_mode):
        last = ev
    return last


def extract_json(text):
    """Strip one surrounding fence if present, then parse (mirrors parseJsonFromText)."""
    trimmed = text.strip()
    if trimmed.startswith("```"):
        inner = trimmed.strip("`")
        if inner.lower().startswith("json"):
            inner = inner[4:]
        trimmed = inner.strip()
    return json.loads(trimmed)
