"""Shared input validation for task ids, tool filenames, and slugs.

Keeps path construction out of attacker/LLM-controlled relative segments.
"""

from __future__ import annotations

import re

_SLUG_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
_TOOL_ID_RE = re.compile(r"^[a-z0-9_]+$")
_NON_SLUG = re.compile(r"[^a-zA-Z0-9_-]+")


def slugify(value: str, *, fallback: str = "task") -> str:
    """Turn free-form industry text into a filesystem-safe task id."""
    cleaned = _NON_SLUG.sub("_", value.strip().lower()).strip("_")
    cleaned = re.sub(r"_+", "_", cleaned)
    return cleaned or fallback


def require_slug(value: str, *, what: str = "id") -> str:
    if not isinstance(value, str) or not value or not _SLUG_RE.fullmatch(value):
        raise ValueError(
            f"invalid {what} {value!r}: must match [a-zA-Z0-9_-]+ (no path separators)"
        )
    return value


def require_tool_id(value: str) -> str:
    if not isinstance(value, str) or not value or not _TOOL_ID_RE.fullmatch(value):
        raise ValueError(
            f"invalid tool/case id {value!r}: must match [a-z0-9_]+ (no path separators)"
        )
    return value
