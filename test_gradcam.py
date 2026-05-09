"""
Diagnostic: is Grad-CAM producing real heatmaps or synthetic ones?
Tests two different locations and checks if the heatmaps differ.
"""
import requests
import base64
import hashlib
import sys

BASE = "http://localhost:8000"

# Two distinct locations
LOCATIONS = [
    {"name": "Hyderabad", "lat": 17.45, "lon": 78.45},
    {"name": "Bangalore", "lat": 12.97, "lon": 77.59},
]

heatmaps = []

for loc in LOCATIONS:
    print(f"\n{'='*60}")
    print(f"Testing: {loc['name']} ({loc['lat']}, {loc['lon']})")
    print(f"{'='*60}")

    # Step 1: Run prediction to cache features
    print("  [1] Running /detect-change ...")
    r = requests.post(f"{BASE}/detect-change", json={
        "lat": loc["lat"], "lon": loc["lon"],
        "bbox_size": 0.3, "region_name": loc["name"],
    }, timeout=120)
    print(f"      Status: {r.status_code}, success: {r.json().get('success')}")

    # Step 2: Run explain
    print("  [2] Running /explain ...")
    r2 = requests.post(f"{BASE}/explain", json={
        "lat": loc["lat"], "lon": loc["lon"],
        "region_name": loc["name"],
    }, timeout=60)
    data = r2.json()
    print(f"      Status: {r2.status_code}, success: {data.get('success')}")

    heatmap_b64 = data.get("explanation_map", "")
    if not heatmap_b64:
        print("      ❌ NO HEATMAP RETURNED")
        continue

    # Decode and hash
    raw = base64.b64decode(heatmap_b64)
    h = hashlib.md5(raw).hexdigest()
    print(f"      Heatmap size: {len(raw)} bytes")
    print(f"      MD5 hash:     {h}")
    heatmaps.append((loc["name"], h, len(raw)))

print(f"\n{'='*60}")
print("COMPARISON")
print(f"{'='*60}")
if len(heatmaps) >= 2:
    if heatmaps[0][1] == heatmaps[1][1]:
        print("⚠️  SAME heatmap for both locations — likely SYNTHETIC (fake).")
        print("   The radial gradient fallback always produces the same pattern.")
    else:
        print("✅ DIFFERENT heatmaps — Grad-CAM is producing REAL, data-dependent output.")
    for name, h, sz in heatmaps:
        print(f"   {name}: MD5={h}  size={sz}B")
else:
    print("❌ Could not compare — one or both locations failed.")
