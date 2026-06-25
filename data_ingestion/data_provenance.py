"""Helpers to enforce real-data-only runs when data_mode is gee."""

from __future__ import annotations


def is_real_data_mode(config: dict) -> bool:
    return config.get("data_mode", "synthetic") == "gee"


def require_real_source(config: dict, source: str, exc: Exception | None = None) -> None:
    """Raise when a real data source fails in gee mode (no synthetic substitute)."""
    if not is_real_data_mode(config):
        return
    detail = f": {exc}" if exc else ""
    raise RuntimeError(
        f"Real data required for '{source}' (data_mode=gee) but fetch failed{detail}. "
        "Authenticate GEE (`earthengine authenticate`), set gee_project in configs/cities.yaml, "
        "and re-run: py run_pipeline.py --city <City> --data-mode gee --force"
    ) from exc
