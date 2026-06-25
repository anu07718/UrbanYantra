"""Download datasets from URLs / Google Drive into a shared cache (works on Render, CI, any machine)."""

from __future__ import annotations

import io
import logging
import os
import re
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE = ROOT / "data" / "cache"
BENCHMARKS_DIR = ROOT / "data" / "benchmarks"


def _cache_root(config: dict) -> Path:
    raw = (config.get("remote_data") or {}).get("cache_dir") or os.environ.get("URBANCOOL_DATA_CACHE", "")
    path = Path(str(raw)).expanduser() if raw else DEFAULT_CACHE
    path.mkdir(parents=True, exist_ok=True)
    return path


def google_drive_download_url(file_id: str) -> str:
    return f"https://drive.google.com/uc?export=download&id={file_id}"


def parse_google_drive_id(value: str) -> str | None:
    """Extract file/folder ID from a sharing URL or bare ID."""
    value = value.strip()
    if not value:
        return None
    if re.fullmatch(r"[\w-]{20,}", value):
        return value
    parsed = urlparse(value)
    if "drive.google.com" not in parsed.netloc:
        return None
    if "/file/d/" in parsed.path:
        match = re.search(r"/file/d/([\w-]+)", parsed.path)
        return match.group(1) if match else None
    if "/folders/" in parsed.path:
        match = re.search(r"/folders/([\w-]+)", parsed.path)
        return match.group(1) if match else None
    qs = parse_qs(parsed.query)
    if "id" in qs:
        return qs["id"][0]
    return None


def sync_google_drive_folder(folder_id: str, dest: Path, *, force: bool = False) -> Path:
    """
    Download all files in a public Google Drive folder via gdown.
    Used for GHSL India tiles (7 zips per layer) and ERA5 zip bundles.
    """
    dest = Path(dest)
    marker = dest / ".folder_sync_ok"
    if marker.exists() and not force and any(dest.rglob("*")):
        logger.info("Drive folder cached → %s", dest)
        return dest

    dest.mkdir(parents=True, exist_ok=True)
    try:
        import gdown

        logger.info("Syncing Google Drive folder %s → %s (may take several minutes)", folder_id, dest)
        gdown.download_folder(
            id=folder_id,
            output=str(dest),
            quiet=False,
            use_cookies=False,
        )
        marker.write_text(folder_id, encoding="utf-8")
        logger.info("Drive folder sync complete: %s files", len(list(dest.rglob("*"))))
    except Exception as exc:
        raise RuntimeError(
            f"Google Drive folder sync failed for {folder_id}. "
            "Ensure folder is shared as 'Anyone with the link' and gdown is installed."
        ) from exc
    return dest


def _download_bytes(url: str, timeout: int = 300) -> bytes:
    session = requests.Session()
    resp = session.get(url, timeout=timeout, stream=True)
    resp.raise_for_status()

    # Google Drive large-file confirmation token
    if "text/html" in resp.headers.get("Content-Type", "") and "drive.google.com" in url:
        for key, val in resp.cookies.items():
            if key.startswith("download_warning"):
                confirm_url = url + f"&confirm={val}"
                resp = session.get(confirm_url, timeout=timeout)
                resp.raise_for_status()
                break
        # gdown-style token in HTML
        if "text/html" in resp.headers.get("Content-Type", ""):
            try:
                import gdown

                file_id = parse_qs(urlparse(url).query).get("id", [None])[0]
                if file_id:
                    buf = io.BytesIO()
                    gdown.download(id=file_id, output=str(buf), quiet=True, fuzzy=True)
                    buf.seek(0)
                    return buf.read()
            except Exception as exc:
                logger.warning("gdown fallback failed: %s", exc)

    return resp.content


def download_to_cache(
    url: str,
    dest: Path,
    *,
    force: bool = False,
    extract_zip: bool = False,
) -> Path:
    dest = Path(dest)
    if dest.exists() and not force:
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading → %s", dest.name)
    content = _download_bytes(url)
    dest.write_bytes(content)

    if extract_zip and zipfile.is_zipfile(dest):
        extract_dir = dest.with_suffix("")
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(dest) as zf:
            zf.extractall(extract_dir)
        logger.info("Extracted zip → %s", extract_dir)
        return extract_dir

    return dest


def _urban_drive_folder_id(config: dict) -> str | None:
    remote = config.get("remote_data") or {}
    for key in ("urban_dataset_folder", "ghsl_drive_root"):
        block = remote.get(key) or {}
        raw = block.get("google_drive_folder_id") or block.get("google_drive_folder_url", "")
        fid = parse_google_drive_id(str(raw))
        if fid:
            return fid
    return None


def ensure_urban_dataset_cached(config: dict, *, force: bool = False) -> Path:
    """Download Urban Dataset Google Drive folder once → data/cache/urban_dataset/."""
    folder_id = _urban_drive_folder_id(config)
    if not folder_id:
        raise FileNotFoundError(
            "Set remote_data.urban_dataset_folder in configs/remote_datasets.yaml"
        )
    cache = _cache_root(config) / "urban_dataset"
    marker = cache / ".sync_complete"
    if marker.exists() and not force and any(cache.rglob("*.zip")):
        return cache
    sync_google_drive_folder(folder_id, cache, force=force)
    marker.write_text(folder_id, encoding="utf-8")
    return cache


def resolve_dataset(
    config: dict,
    key: str,
    *,
    force: bool = False,
) -> Path | None:
    """
    Resolve a dataset path with priority:
    1. Bundled data/benchmarks/ (small files committed to repo — works on Vercel/Render)
    2. local_data path on disk (dev machine)
    3. data/cache/ if already downloaded
    4. remote_data URL or Google Drive file ID → download to cache
    """
    force = force or bool(config.get("force_refresh"))

    # Bundled benchmarks (cloud-safe, no download)
    bundled_map = {
        "kaggle_uhi_csv": "urban_heat_island_dataset.csv",
        "ey_uhi_training_csv": "Training_data_uhi_index_2025-02-18.csv",
    }
    bundled_name = bundled_map.get(key)
    if bundled_name:
        bundled = BENCHMARKS_DIR / bundled_name
        if bundled.exists() and not force:
            return bundled

    local_raw = (config.get("local_data") or {}).get(key, "")
    if local_raw:
        local_path = Path(str(local_raw)).expanduser()
        if local_path.exists():
            return local_path

    remote: dict[str, Any] = (config.get("remote_data") or {}).get(key) or {}
    if not remote and not bundled_name:
        return None

    cache = _cache_root(config)
    filename = remote.get("filename") or bundled_name or f"{key}.bin"
    cache_path = cache / filename

    if cache_path.exists() and not force:
        return cache_path

    url = remote.get("url", "").strip()
    gdrive = remote.get("google_drive_file_id") or remote.get("google_drive_url", "")
    gdrive_id = parse_google_drive_id(str(gdrive)) if gdrive else None
    if not url and gdrive_id:
        url = google_drive_download_url(gdrive_id)
    if not url:
        return bundled if bundled_name and (BENCHMARKS_DIR / bundled_name).exists() else None

    result = download_to_cache(
        url,
        cache_path,
        force=force,
        extract_zip=bool(remote.get("extract_zip")),
    )
    return result


def resolve_dataset_dir(config: dict, key: str, *, force: bool = False) -> Path | None:
    """Resolve a folder dataset (e.g. UTCI NetCDF directory)."""
    force = force or bool(config.get("force_refresh"))

    local_raw = (config.get("local_data") or {}).get(key, "")
    if local_raw:
        local_path = Path(str(local_raw)).expanduser()
        if local_path.is_dir():
            return local_path

    remote: dict[str, Any] = (config.get("remote_data") or {}).get(key) or {}
    cache = _cache_root(config)

    dir_name = remote.get("dirname") or key
    dir_path = cache / dir_name
    if dir_path.is_dir() and any(dir_path.iterdir()) and not force:
        return dir_path

    # Zip on Drive → download + extract
    zip_file = remote.get("zip_filename") or f"{key}.zip"
    zip_path = cache / zip_file
    url = remote.get("url", "").strip()
    gdrive = remote.get("google_drive_file_id") or remote.get("google_drive_url", "")
    gdrive_id = parse_google_drive_id(str(gdrive)) if gdrive else None
    if not url and gdrive_id:
        url = google_drive_download_url(gdrive_id)
    if not url:
        return None

    extracted = download_to_cache(url, zip_path, force=force, extract_zip=True)
    return extracted if extracted.is_dir() else dir_path
