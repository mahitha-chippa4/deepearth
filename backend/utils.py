"""
DeepEarth V2 — Shared Constants & Utilities
"""

import numpy as np
from datetime import datetime

# ── 11 Environmental Change Classes ──────────────────────────

NUM_CLASSES = 11
PATCH_SIZE = 32
STRIDE = 16
SCALE = 30  # GEE reproject scale in meters

CLASS_NAMES = [
    "No Change",
    "Temporary Veg Loss",
    "Permanent Deforestation",
    "Forest Degradation",
    "Urban Expansion",
    "Industrial Zone",
    "Mining Activity",
    "Sand Mining",
    "Water Body Shrinkage",
    "Burn Scars",
    "Agricultural Expansion",
]

CLASS_COLORS = [
    "#D3D3D3",  # 0  No Change — light gray
    "#FFA726",  # 1  Temp Veg Loss — vivid orange
    "#EF1010",  # 2  Permanent Deforestation — bright red
    "#B71C1C",  # 3  Forest Degradation — dark red
    "#9C27B0",  # 4  Urban Expansion — vivid purple
    "#6A1B9A",  # 5  Industrial Zone — deep purple
    "#8D6E63",  # 6  Mining Activity — brown
    "#FFD600",  # 7  Sand Mining — vivid gold
    "#039BE5",  # 8  Water Shrinkage — bright blue
    "#FF6D00",  # 9  Burn Scars — vivid orange
    "#43A047",  # 10 Agricultural Expansion — vivid green
]

# Alert weights for severity scoring
ALERT_WEIGHTS = {
    0: 0,      # No Change
    1: 1,      # Temporary Veg Loss
    2: 10,     # Permanent Deforestation
    3: 8,      # Forest Degradation
    4: 3,      # Urban Expansion
    5: 5,      # Industrial Zone
    6: 7,      # Mining Activity
    7: 6,      # Sand Mining
    8: 4,      # Water Body Shrinkage
    9: 5,      # Burn Scars
    10: 0.5,   # Agricultural Expansion
}

# Focal Loss manual class weights
MANUAL_WEIGHTS = np.array(
    [0.1, 3.0, 8.0, 5.0, 4.0, 8.0, 6.0, 7.0, 8.0, 7.0, 1.0],
    dtype=np.float32,
)

# Spectral bands used
SPECTRAL_BANDS = ["NDVI", "NDWI", "NDBI", "NBR", "EVI", "MNDWI"]

# ── Dynamic Year Resolution ──────────────────────────────────
# Baseline year stays fixed; "recent" year is always the current year.
BASELINE_YEAR = 2019

def get_current_year() -> int:
    """Return the current calendar year for satellite data queries."""
    return datetime.now().year

def get_temporal_years() -> list[int]:
    """4-year temporal stack: baseline, two intermediates, and current."""
    cy = get_current_year()
    return [BASELINE_YEAR, BASELINE_YEAR + 2, cy - 1, cy]

# Legacy constant — kept for imports that may reference it
TEMPORAL_YEARS = get_temporal_years()


# ── Label Generation ─────────────────────────────────────────

def make_labels(arr_2019: np.ndarray, arr_2024: np.ndarray) -> np.ndarray:
    """
    Generate pseudo-labels from spectral index differences.

    Args:
        arr_2019: (H, W, 6) — NDVI, NDWI, NDBI, NBR, EVI, MNDWI for 2019
        arr_2024: (H, W, 6) — same for 2024

    Returns:
        labels: (H, W) int64 — class index per pixel
    """
    ndvi_19, ndwi_19 = arr_2019[:, :, 0], arr_2019[:, :, 1]
    ndvi_24, ndwi_24 = arr_2024[:, :, 0], arr_2024[:, :, 1]
    ndbi_24 = arr_2024[:, :, 2]
    nbr_19, nbr_24 = arr_2019[:, :, 3], arr_2024[:, :, 3]

    delta_ndvi = ndvi_24 - ndvi_19
    delta_ndwi = ndwi_24 - ndwi_19
    delta_nbr = nbr_24 - nbr_19

    labels = np.zeros(ndvi_24.shape, dtype=np.int64)
    labels[delta_ndvi < -0.05] = 1
    labels[delta_ndvi < -0.15] = 2
    labels[(delta_ndvi < -0.08) & (ndvi_19 > 0.3)] = 3
    labels[(ndbi_24 > 0.1) & (delta_ndvi < -0.05)] = 4
    labels[(ndbi_24 > 0.2) & (delta_ndvi < -0.1)] = 5
    labels[
    (ndvi_24 < 0.15) &
    (ndbi_24 < 0.1) &
    (delta_ndvi < -0.1) &
    (delta_ndwi < 0.05)
    ] = 6
    # Sand Mining: requires genuine shallow water signature (NDWI > 0.15), not just moist soil
    labels[(ndwi_19 > 0.15) & (ndvi_24 < 0.15)] = 7
    # Water Body Shrinkage: requires actual water body (NDWI > 0.2 in 2019) + strong decrease
    labels[(delta_ndwi < -0.15) & (ndwi_19 > 0.2)] = 8
    labels[delta_nbr < -0.2] = 9
    labels[(delta_ndvi > 0.1) & (ndvi_24 > 0.2)] = 10

    return labels


def hex_to_rgb(hex_color: str) -> tuple:
    """Convert hex color to (R, G, B) tuple (0-255)."""
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def colorize_prediction(pred_map: np.ndarray) -> np.ndarray:
    """
    Convert class index map to RGB image.

    Args:
        pred_map: (H, W) int array with class indices 0-10

    Returns:
        rgb: (H, W, 3) float array (0-1) for visualization
    """
    color_arr = np.array([hex_to_rgb(c) for c in CLASS_COLORS]) / 255.0
    rgb = np.zeros((*pred_map.shape, 3))
    for cls in range(NUM_CLASSES):
        rgb[pred_map == cls] = color_arr[cls]
    return rgb


def compute_class_distribution(pred_map: np.ndarray) -> dict:
    """Compute percentage of each class in a prediction map."""
    total = pred_map.size
    distribution = {}
    for cls in range(NUM_CLASSES):
        pct = float(100 * (pred_map == cls).sum() / total)
        if pct > 0.1:
            distribution[CLASS_NAMES[cls]] = round(pct, 2)
    return distribution
