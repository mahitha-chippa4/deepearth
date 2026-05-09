"""
DeepEarth V2 — Satellite Data Pipeline
Fetches Sentinel-2 imagery and computes spectral indices via Google Earth Engine.
Supports both bbox (lat/lon) and GeoJSON polygon geometry for region-specific analysis.

Dynamic date handling:
  - Baseline year (2019) is fixed as the historical reference.
  - "Recent" imagery uses the latest available data (last 30 days → last 90 days
    → current year → previous year) with automatic fallback.
"""

import os
import hashlib
import logging
from datetime import datetime, timedelta

import numpy as np

# GEE import with graceful fallback
try:
    import ee
    EE_AVAILABLE = True
except ImportError:
    EE_AVAILABLE = False

from .utils import (
    SCALE, SPECTRAL_BANDS, BASELINE_YEAR,
    get_current_year, get_temporal_years,
)

logger = logging.getLogger(__name__)


def initialize_ee(project_id: str = None):
    """Initialize Google Earth Engine with project credentials."""
    if not EE_AVAILABLE:
        print("⚠️  earthengine-api not installed. Using mock data.")
        return False

    project_id = project_id or os.getenv("GEE_PROJECT_ID", "deepearth-project")
    try:
        ee.Initialize(project=project_id)
        print(f"✅ Earth Engine initialized: {project_id}")
        return True
    except Exception:
        try:
            ee.Authenticate()
            ee.Initialize(project=project_id)
            print(f"✅ Earth Engine authenticated and initialized")
            return True
        except Exception as e:
            print(f"⚠️  Earth Engine init failed: {e}")
            return False


def _compute_indices(image):
    """Compute 6 spectral indices from Sentinel-2 bands."""
    ndvi  = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
    ndwi  = image.normalizedDifference(["B3", "B8"]).rename("NDWI")
    ndbi  = image.normalizedDifference(["B11", "B8"]).rename("NDBI")
    nbr   = image.normalizedDifference(["B8", "B12"]).rename("NBR")
    evi   = image.expression(
        "2.5*(NIR-RED)/(NIR+6*RED-7.5*BLUE+1)",
        {"NIR": image.select("B8"), "RED": image.select("B4"), "BLUE": image.select("B2")},
    ).rename("EVI")
    mndwi = image.normalizedDifference(["B3", "B11"]).rename("MNDWI")
    return ee.Image.cat([ndvi, ndwi, ndbi, nbr, evi, mndwi])


# ── GEE-backed fetchers ────────────────────────────────────────────────────

def _safe_scale(bbox_size: float, max_pixels: int = 200_000) -> int:
    """
    Compute a GEE reproject scale (metres) so that the sampled region
    stays within GEE's sampleRectangle pixel limit.

    bbox_size in degrees → degrees_span = 2 × bbox_size.
    At the equator 1° ≈ 111 km.
    side_metres = degrees_span × 111_000
    scale = ceil(side_metres / sqrt(max_pixels))
    Clamp to [SCALE, 1000] so we never go coarser than 1 km or finer than SCALE.
    """
    import math
    side_m = 2 * bbox_size * 111_000          # worst-case (equatorial)
    min_scale = math.ceil(side_m / math.sqrt(max_pixels))
    return max(SCALE, min(min_scale, 1000))


# ── Date window utilities ──────────────────────────────────────────────────

def _resolve_date_range(year: int | str) -> tuple[str, str, str]:
    """
    Resolve a year (or the special string 'latest') to a (start, end, label)
    date range for GEE filtering.

    Returns:
        (start_iso, end_iso, label)   e.g. ("2026-03-21", "2026-04-20", "latest-30d")
    """
    if year == "latest":
        now = datetime.now()
        end   = now.strftime("%Y-%m-%d")
        start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        return start, end, "latest-30d"
    else:
        return f"{year}-01-01", f"{year}-12-31", str(year)


_FALLBACK_WINDOWS = [
    ("latest",),              # last 30 days
    ("latest_90",),           # last 90 days
    ("current_year",),        # full current year
    ("previous_year",),       # full previous year
]


def _get_latest_date(collection) -> str | None:
    """
    Extract the most recent acquisition date from a GEE ImageCollection.
    Returns ISO date string (e.g. '2026-04-15') or None.
    """
    try:
        latest = collection.sort("system:time_start", False).first()
        ts_ms = latest.get("system:time_start").getInfo()
        if ts_ms:
            return datetime.utcfromtimestamp(ts_ms / 1000).strftime("%Y-%m-%d")
    except Exception:
        pass
    return None


def _fetch_with_fallback(region, bbox_size, cloud_pct=20):
    """
    Try progressively wider date windows until we get usable imagery.
    Returns (ee.Image, date_label, imagery_date) or raises if all fail.
        imagery_date: ISO date string of most recent image, or None.

    SPEED: The previous version called col.size().getInfo() for every window
    (a blocking GEE round-trip each time, ~1-3s).  We now skip that check
    and just build the median composite directly.  If the collection is empty
    the sampleRectangle call downstream will raise, which we catch and use to
    advance to the next fallback window.
    """
    now = datetime.now()
    cy  = get_current_year()
    windows = [
        ((now - timedelta(days=30)).strftime("%Y-%m-%d"),  now.strftime("%Y-%m-%d"),  "latest-30d"),
        ((now - timedelta(days=90)).strftime("%Y-%m-%d"),  now.strftime("%Y-%m-%d"),  "latest-90d"),
        (f"{cy}-01-01",                                    now.strftime("%Y-%m-%d"),  f"{cy}"),
        (f"{cy-1}-01-01",                                  f"{cy-1}-12-31",           f"{cy-1}"),
    ]

    scale = _safe_scale(bbox_size)
    last_error = None

    for start, end, label in windows:
        try:
            col = (
                ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(region)
                .filterDate(start, end)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_pct))
            )
            img = col.median().clip(region).reproject(crs="EPSG:4326", scale=scale)
            imagery_date = _get_latest_date(col)
            logger.info(
                "Satellite data window [%s → %s] (%s), latest=%s",
                start, end, label, imagery_date,
            )
            return img, label, imagery_date
        except Exception as exc:
            logger.debug("Window [%s → %s] failed: %s", start, end, exc)
            last_error = exc
            continue

    raise RuntimeError(
        f"No Sentinel-2 imagery found for any date window (last tried {cy-1}). "
        f"Region may be outside Sentinel-2 coverage. Last error: {last_error}"
    )


def fetch_spectral_indices(
    lat: float, lon: float, year: int | str, bbox_size: float = 0.3,
    geometry: dict = None,
) -> tuple[np.ndarray, str, str | None]:
    """
    Fetch 6-channel spectral indices for a region.

    Args:
        year: int for a specific year, or 'latest' for most-recent imagery.
        geometry: optional GeoJSON Polygon to clip imagery.

    Returns:
        (data, date_label, imagery_date):
            data         — (H, W, 6) float32 array
            date_label   — e.g. "latest-30d", "2026", "2019"
            imagery_date — ISO date of most recent image, or None
    """
    if not EE_AVAILABLE:
        # Mock: generate a plausible recent date
        if year == "latest":
            mock_date = (datetime.now() - timedelta(days=8)).strftime("%Y-%m-%d")
        else:
            mock_date = f"{year}-06-15"  # mid-year placeholder
        return (
            _mock_spectral_data(lat=lat, lon=lon, year=year if isinstance(year, int) else get_current_year()),
            str(year),
            mock_date,
        )

    if geometry:
        region = ee.Geometry(geometry)
        try:
            coords = geometry.get('coordinates', [[]])[0]
            if coords:
                lons = [c[0] for c in coords]
                lats = [c[1] for c in coords]
                bbox_size = max(
                    (max(lons) - min(lons)) / 2,
                    (max(lats) - min(lats)) / 2,
                    0.05,
                )
        except Exception:
            pass
    else:
        region = ee.Geometry.Rectangle([
            lon - bbox_size, lat - bbox_size,
            lon + bbox_size, lat + bbox_size,
        ])

    scale = _safe_scale(bbox_size)
    imagery_date = None

    if year == "latest":
        img, date_label, imagery_date = _fetch_with_fallback(region, bbox_size)
    else:
        col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(region)
            .filterDate(f"{year}-01-01", f"{year}-12-31")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
        )
        imagery_date = _get_latest_date(col)
        img = col.median().clip(region).reproject(crs="EPSG:4326", scale=scale)
        date_label = str(year)

    stack = _compute_indices(img)
    d = stack.sampleRectangle(region=region, defaultValue=0).getInfo()
    arrays = [np.array(d["properties"][b], dtype=np.float32) for b in SPECTRAL_BANDS]
    return np.stack(arrays, axis=-1), date_label, imagery_date


def fetch_static_features(
    lat: float, lon: float, bbox_size: float = 0.3, geometry: dict = None,
) -> tuple[np.ndarray, dict]:
    """
    Fetch 12-channel feature stack (baseline + latest) for UNetV3.

    Returns:
        (features, metadata):
            features — (H, W, 12) float32 array
            metadata — {"baseline_year": 2019, "recent_label": "latest-30d", ...}
    """
    if not EE_AVAILABLE:
        mock_date = (datetime.now() - timedelta(days=8)).strftime("%Y-%m-%d")
        return _mock_static_features(lat=lat, lon=lon), {
            "baseline_year": BASELINE_YEAR,
            "recent_label": str(get_current_year()),
            "imagery_date": mock_date,
        }

    arr_baseline, bl_label, bl_date = fetch_spectral_indices(
        lat, lon, BASELINE_YEAR, bbox_size, geometry,
    )
    arr_recent, rc_label, rc_date = fetch_spectral_indices(
        lat, lon, "latest", bbox_size, geometry,
    )

    H = min(arr_baseline.shape[0], arr_recent.shape[0])
    W = min(arr_baseline.shape[1], arr_recent.shape[1])

    features = np.concatenate([arr_baseline[:H, :W, :], arr_recent[:H, :W, :]], axis=-1)
    metadata = {
        "baseline_year": BASELINE_YEAR,
        "baseline_label": bl_label,
        "recent_label": rc_label,
        "imagery_date": rc_date or "Data unavailable",
    }
    return features, metadata


def fetch_temporal_features(
    lat: float, lon: float, bbox_size: float = 0.3, geometry: dict = None,
) -> tuple[np.ndarray, dict]:
    """
    Fetch multi-year temporal stack for ConvLSTMUNet.

    Returns:
        (stack, metadata):
            stack    — (T, H, W, 6) float32
            metadata — {"years": [2019, 2021, 2025, 2026], "labels": [...]}
    """
    if not EE_AVAILABLE:
        years = get_temporal_years()
        mock_date = (datetime.now() - timedelta(days=8)).strftime("%Y-%m-%d")
        return _mock_temporal_features(lat=lat, lon=lon), {
            "years": years, "labels": [str(y) for y in years],
            "imagery_date": mock_date,
        }

    years = get_temporal_years()
    yearly_stacks = []
    labels = []
    latest_date = None
    for i, yr in enumerate(years):
        # Use 'latest' for the final (most recent) year
        year_arg = "latest" if i == len(years) - 1 else yr
        arr, lbl, img_date = fetch_spectral_indices(lat, lon, year_arg, bbox_size, geometry)
        yearly_stacks.append(arr)
        labels.append(lbl)
        if img_date:
            latest_date = img_date  # keep the most recent

    min_h = min(s.shape[0] for s in yearly_stacks)
    min_w = min(s.shape[1] for s in yearly_stacks)
    stack = np.stack([s[:min_h, :min_w, :] for s in yearly_stacks], axis=0)
    metadata = {
        "years": years, "labels": labels,
        "imagery_date": latest_date or "Data unavailable",
    }
    return stack, metadata


def fetch_region_by_bbox(
    lon_min: float, lat_min: float, lon_max: float, lat_max: float,
    year: int | str = "latest",
) -> np.ndarray:
    """Fetch spectral indices for an explicit bounding box."""
    if not EE_AVAILABLE:
        lat = (lat_min + lat_max) / 2
        lon = (lon_min + lon_max) / 2
        yr = year if isinstance(year, int) else get_current_year()
        return _mock_spectral_data(lat=lat, lon=lon, year=yr)

    region = ee.Geometry.Rectangle([lon_min, lat_min, lon_max, lat_max])
    bbox_size = max((lon_max - lon_min), (lat_max - lat_min)) / 2
    scale = _safe_scale(bbox_size)

    if year == "latest":
        img, _ = _fetch_with_fallback(region, bbox_size)
    else:
        img = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(region)
            .filterDate(f"{year}-01-01", f"{year}-12-31")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
            .median()
            .clip(region)
            .reproject(crs="EPSG:4326", scale=scale)
        )

    stack  = _compute_indices(img)
    d      = stack.sampleRectangle(region=region, defaultValue=0).getInfo()
    arrays = [np.array(d["properties"][b], dtype=np.float32) for b in SPECTRAL_BANDS]
    return np.stack(arrays, axis=-1)


# ── Mock Data — region-specific via coordinate-derived seed ─────────────────
#
# The seed is derived from lat/lon so that:
#   • The same region always returns the same values (deterministic)
#   • Different regions return DIFFERENT values
# This makes the demo realistic without needing GEE credentials.

def _region_seed(lat: float, lon: float, year: int = 0) -> int:
    """
    Derive an integer seed from (lat, lon, year) so each region
    produces unique but reproducible mock data.
    """
    key = f"{round(lat, 3)}_{round(lon, 3)}_{year}"
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) & 0x7FFFFFFF


def _mock_spectral_data(h: int = 64, w: int = 64,
                        lat: float = 20.0, lon: float = 78.0,
                        year: int = 2024) -> np.ndarray:
    """
    Generate realistic mock spectral indices, unique per region.

    The seed is derived from (lat, lon, year) so Telangana, Madhya Pradesh,
    Assam, etc. each get distinct spectral fingerprints.
    """
    seed = _region_seed(lat, lon, year)
    rng  = np.random.default_rng(seed)

    # Region-specific base NDVI (proxy for vegetation health)
    # lat/lon determine what kind of landscape this "is"
    base_ndvi  = float(np.clip(0.3 + 0.4 * np.sin(lat * 0.15) * np.cos(lon * 0.10), 0.1, 0.85))
    base_ndwi  = float(np.clip(-0.1 + 0.3 * np.cos(lat * 0.12), -0.4, 0.4))
    base_ndbi  = float(np.clip(0.05 + 0.2 * np.sin(lon * 0.08), -0.2, 0.4))

    data = np.zeros((h, w, 6), dtype=np.float32)
    spread = 0.15
    data[:, :, 0] = np.clip(rng.normal(base_ndvi,  spread, (h, w)), 0.0,  1.0)   # NDVI
    data[:, :, 1] = np.clip(rng.normal(base_ndwi,  spread, (h, w)), -0.5, 0.5)   # NDWI
    data[:, :, 2] = np.clip(rng.normal(base_ndbi,  spread, (h, w)), -0.3, 0.5)   # NDBI
    data[:, :, 3] = np.clip(rng.normal(base_ndvi * 0.8, spread, (h, w)), 0.0, 0.7)  # NBR
    data[:, :, 4] = np.clip(rng.normal(base_ndvi * 0.6, spread, (h, w)), 0.0, 0.6)  # EVI
    data[:, :, 5] = np.clip(rng.normal(base_ndwi * 0.9, spread, (h, w)), -0.4, 0.4) # MNDWI
    return data


def _mock_static_features(h: int = 64, w: int = 64,
                           lat: float = 20.0, lon: float = 78.0) -> np.ndarray:
    """12-channel (baseline + current year) feature stack, region-specific."""
    arr_baseline = _mock_spectral_data(h, w, lat=lat, lon=lon, year=BASELINE_YEAR)
    arr_recent   = _mock_spectral_data(h, w, lat=lat, lon=lon, year=get_current_year())
    return np.concatenate([arr_baseline, arr_recent], axis=-1)


def _mock_temporal_features(h: int = 64, w: int = 64,
                             lat: float = 20.0, lon: float = 78.0) -> np.ndarray:
    """(4, H, W, 6) temporal stack, region-specific."""
    return np.stack(
        [_mock_spectral_data(h, w, lat=lat, lon=lon, year=y) for y in get_temporal_years()],
        axis=0,
    )
