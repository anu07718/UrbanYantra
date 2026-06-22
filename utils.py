"""Urban heat mitigation pipeline — shared utilities."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml


def load_config(path: str | Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_city_config(cities_path: str | Path, city_key: str) -> dict[str, Any]:
    """Merge defaults + per-city entry from configs/cities.yaml."""
    raw = load_config(cities_path)
    defaults = deepcopy(raw.get("defaults", {}))
    city = raw["cities"][city_key]
    merged = {**defaults, **city}
    merged["city_key"] = city_key
    return merged


def list_city_keys(cities_path: str | Path) -> list[str]:
    raw = load_config(cities_path)
    return list(raw.get("cities", {}).keys())


def ensure_dir(path: str | Path) -> Path:
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent
