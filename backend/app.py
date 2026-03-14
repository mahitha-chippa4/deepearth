"""
DeepEarth V2 — FastAPI Backend
REST API for environmental change detection and analysis.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (one level up from backend/)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)
# Fallback: also try CWD (in case uvicorn runs from project root)
load_dotenv()

print(f"[DeepEarth] .env path: {_env_path} (exists={_env_path.exists()})")
print(f"[DeepEarth] GMAIL_ADDRESS loaded: {'YES' if os.getenv('GMAIL_ADDRESS') else 'NO'}")

import io
import base64
import numpy as np
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List

from .predict import DeepEarthPredictor
from .satellite_fetcher import (
    fetch_static_features,
    fetch_temporal_features,
    initialize_ee,
)
from .change_detection import compute_region_stats, compare_predictions
from .alert_system import send_alert_email, should_trigger_alert
from .utils import CLASS_NAMES, CLASS_COLORS, colorize_prediction

# ── App Setup ─────────────────────────────────────────────────

app = FastAPI(
    title="DeepEarth V2 API",
    description="AI-powered environmental monitoring and change detection",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

predictor: Optional[DeepEarthPredictor] = None
ee_initialized = False
recent_alerts = []


@app.on_event("startup")
async def startup():
    global predictor, ee_initialized
    predictor = DeepEarthPredictor(model_dir="models")
    ee_initialized = initialize_ee()


# ── Request / Response Models ──────────────────────────────────

class GeoJSONGeometry(BaseModel):
    """Minimal GeoJSON geometry (Polygon or MultiPolygon)."""
    type: str                           # "Polygon" or "MultiPolygon"
    coordinates: list                   # [[lon,lat], ...] ring(s)


class PredictRequest(BaseModel):
    lat: float = Field(..., description="Latitude of region center")
    lon: float = Field(..., description="Longitude of region center")
    bbox_size: float = Field(0.3, description="Half-width of bounding box in degrees")
    model_type: str = Field("static", description="'static' (UNetV3) or 'temporal' (ConvLSTM)")
    geometry: Optional[GeoJSONGeometry] = Field(None, description="GeoJSON polygon geometry")


class ChangeDetectRequest(BaseModel):
    lat: float
    lon: float
    bbox_size: float = 0.3
    region_name: str = "Unknown Region"
    geometry: Optional[GeoJSONGeometry] = Field(
        None,
        description="Optional GeoJSON polygon. Stats are clipped to this region.",
    )


class AnalyzePolygonRequest(BaseModel):
    """Analyze an arbitrary user-drawn polygon."""
    geometry: GeoJSONGeometry = Field(..., description="GeoJSON polygon geometry")
    region_name: str = "Custom Region"
    lat: Optional[float] = None   # centroid hint for mock data fallback
    lon: Optional[float] = None


# ── Endpoints ──────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "DeepEarth V2 API",
        "version": "2.0.0",
        "status": "running",
        "models_loaded": predictor is not None,
        "earth_engine": ee_initialized,
    }


@app.get("/classes")
async def get_classes():
    """Return the 11 environmental change classes with colors."""
    return {
        "num_classes": len(CLASS_NAMES),
        "classes": [
            {"id": i, "name": name, "color": CLASS_COLORS[i]}
            for i, name in enumerate(CLASS_NAMES)
        ],
    }


@app.post("/predict")
async def predict(req: PredictRequest):
    """
    Run AI segmentation on satellite imagery.
    If req.geometry is provided, imagery is clipped to the polygon.
    """
    if predictor is None:
        raise HTTPException(500, "Models not loaded")

    geom = req.geometry.dict() if req.geometry else None

    try:
        if req.model_type == "temporal":
            features = fetch_temporal_features(req.lat, req.lon, req.bbox_size, geometry=geom)
            pred_map = predictor.predict_temporal(features)
        else:
            features = fetch_static_features(req.lat, req.lon, req.bbox_size, geometry=geom)
            pred_map = predictor.predict_static(features)

        stats = compute_region_stats(pred_map)
        pred_image = _encode_prediction_image(pred_map)

        return {
            "success": True,
            "coordinates": {"lat": req.lat, "lon": req.lon},
            "model_type": req.model_type,
            "stats": stats,
            "prediction_image": pred_image,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(500, f"Prediction failed: {str(e)}")


@app.post("/detect-change")
async def detect_change(req: ChangeDetectRequest):
    """
    Full pipeline: fetch imagery → predict → detect changes → alert.
    If req.geometry is provided, all imagery is clipped to that polygon,
    so statistics reflect only the selected region.
    """
    if predictor is None:
        raise HTTPException(500, "Models not loaded")

    # Convert geometry pydantic model → plain dict for GEE / mock
    geom = req.geometry.dict() if req.geometry else None

    try:
        features = fetch_static_features(req.lat, req.lon, req.bbox_size, geometry=geom)
        pred_map  = predictor.predict_static(features)
        stats     = compute_region_stats(pred_map)

        if should_trigger_alert(stats["severity"], stats["forest_loss_pct"]):
            alert = {
                "region": req.region_name,
                "severity": stats["severity"],
                "score": stats["alert_score"],
                "forest_loss_pct": stats["forest_loss_pct"],
                "top_issues": stats["top_issues"],
                "timestamp": datetime.now().isoformat(),
                "coordinates": {"lat": req.lat, "lon": req.lon},
            }
            recent_alerts.insert(0, alert)
            if len(recent_alerts) > 100:
                recent_alerts.pop()

            send_alert_email(
                region_name=req.region_name,
                severity=stats["severity"],
                alert_score=stats["alert_score"],
                top_issues=stats["top_issues"],
                coordinates={"lat": req.lat, "lon": req.lon},
                forest_loss_pct=stats["forest_loss_pct"],
            )

        pred_image = _encode_prediction_image(pred_map)

        return {
            "success": True,
            "region": req.region_name,
            "coordinates": {"lat": req.lat, "lon": req.lon},
            "bbox": {
                "west":  req.lon - req.bbox_size,
                "south": req.lat - req.bbox_size,
                "east":  req.lon + req.bbox_size,
                "north": req.lat + req.bbox_size,
            },
            "stats": stats,
            "prediction_image": pred_image,
            "alert_triggered": should_trigger_alert(
                stats["severity"], stats["forest_loss_pct"]
            ),
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(500, f"Change detection failed: {str(e)}")


@app.post("/analyze-polygon")
async def analyze_polygon(req: AnalyzePolygonRequest):
    """
    Analyze an arbitrary GeoJSON polygon drawn by the user.
    Computes centroid automatically if lat/lon not provided.
    """
    if predictor is None:
        raise HTTPException(500, "Models not loaded")

    geom = req.geometry.dict()

    # Extract centroid from polygon coordinates if not provided
    lat, lon = req.lat, req.lon
    if lat is None or lon is None:
        coords = req.geometry.coordinates[0]  # outer ring
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        lon, lat = float(np.mean(lons)), float(np.mean(lats))

    try:
        features = fetch_static_features(lat, lon, geometry=geom)
        pred_map = predictor.predict_static(features)
        stats    = compute_region_stats(pred_map)
        pred_image = _encode_prediction_image(pred_map)

        bbox_size = 0.3
        return {
            "success": True,
            "region": req.region_name,
            "coordinates": {"lat": lat, "lon": lon},
            "bbox": {
                "west":  lon - bbox_size,
                "south": lat - bbox_size,
                "east":  lon + bbox_size,
                "north": lat + bbox_size,
            },
            "stats": stats,
            "prediction_image": pred_image,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(500, f"Polygon analysis failed: {str(e)}")


@app.get("/alerts")
async def get_alerts():
    """Return recent environmental alerts."""
    return {"count": len(recent_alerts), "alerts": recent_alerts[:20]}


@app.get("/regions")
async def get_regions():
    """Return pre-defined monitoring regions."""
    regions = {
        "Hyderabad":    {"lat": 17.45, "lon": 78.45, "bbox": 0.25},
        "Delhi":        {"lat": 28.60, "lon": 77.00, "bbox": 0.30},
        "Western Ghats":{"lat": 13.60, "lon": 75.70, "bbox": 0.25},
        "Jharkhand":    {"lat": 23.40, "lon": 85.30, "bbox": 0.30},
        "Sundarbans":   {"lat": 21.90, "lon": 88.90, "bbox": 0.20},
        "Rajasthan":    {"lat": 26.60, "lon": 72.90, "bbox": 0.30},
        "Bellary":      {"lat": 15.10, "lon": 76.90, "bbox": 0.30},
        "Assam":        {"lat": 26.10, "lon": 93.60, "bbox": 0.30},
        "Kerala Coast": {"lat":  9.80, "lon": 76.30, "bbox": 0.30},
        "Pune":         {"lat": 18.70, "lon": 74.00, "bbox": 0.30},
        "Bangalore":    {"lat": 13.10, "lon": 77.70, "bbox": 0.30},
        "Mumbai":       {"lat": 19.30, "lon": 73.10, "bbox": 0.30},
    }
    return {"regions": regions}


# ── Helpers ───────────────────────────────────────────────────

def _encode_prediction_image(pred_map: np.ndarray) -> str:
    """Encode prediction map as base64 PNG string."""
    try:
        from PIL import Image
        rgb      = colorize_prediction(pred_map)
        rgb_uint8 = (rgb * 255).astype(np.uint8)
        img      = Image.fromarray(rgb_uint8)
        buffer   = io.BytesIO()
        img.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
    except ImportError:
        return ""


# ── Explainability ─────────────────────────────────────────────

class ExplainRequest(BaseModel):
    lat:         float
    lon:         float
    bbox_size:   float = 0.3
    region_name: str   = "Unknown"
    geometry:    Optional[dict] = None

@app.post("/explain")
async def explain_prediction(req: ExplainRequest):
    """
    Generate a Grad-CAM explanation heatmap for the most recent prediction.
    This runs AFTER prediction and does NOT modify the prediction pipeline.
    """
    if predictor is None:
        raise HTTPException(500, "Models not loaded")
    try:
        from .satellite_fetcher import fetch_static_features  # already imported above
        geom = req.geometry or {
            "type": "Polygon",
            "coordinates": [[
                [req.lon - req.bbox_size, req.lat - req.bbox_size],
                [req.lon + req.bbox_size, req.lat - req.bbox_size],
                [req.lon + req.bbox_size, req.lat + req.bbox_size],
                [req.lon - req.bbox_size, req.lat + req.bbox_size],
                [req.lon - req.bbox_size, req.lat - req.bbox_size],
            ]],
        }
        features = fetch_static_features(req.lat, req.lon, geometry=geom)
        explanation_map = predictor.generate_explanation(features)
        return {
            "success": True,
            "region": req.region_name,
            "explanation_map": explanation_map,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(500, f"Explanation failed: {str(e)}")


# ── Report Generation ──────────────────────────────────────────

class ReportRequest(BaseModel):
    region_name:         str
    lat:                 float
    lon:                 float
    stats:               dict
    timestamp:           Optional[str] = None
    prediction_image:    Optional[str] = None   # base64 PNG
    explanation_map:     Optional[str] = None   # base64 PNG

@app.post("/generate-report")
async def generate_report(req: ReportRequest):
    """
    Generate and return a downloadable PDF environmental analysis report.
    """
    try:
        from .report_generator import generate_report as _gen
        pdf_bytes = _gen(
            region_name         = req.region_name,
            lat                 = req.lat,
            lon                 = req.lon,
            stats               = req.stats,
            timestamp           = req.timestamp,
            prediction_image_b64= req.prediction_image,
            explanation_map_b64 = req.explanation_map,
        )
        # Sanitise filename
        safe_name = req.region_name.split(",")[0].strip().lower()
        safe_name = "".join(c if c.isalnum() else "_" for c in safe_name)
        date_str  = datetime.now().strftime("%Y")
        filename  = f"deepearth_report_{safe_name}_{date_str}.pdf"

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        raise HTTPException(500, f"Report generation failed: {str(e)}")


# ── Email Alert (Demo) ────────────────────────────────────────────────

import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

DEMO_RECIPIENT = "mahitha.chippa05@gmail.com"


class AlertEmailRequest(BaseModel):
    region_name:   str
    latitude:      float
    longitude:     float
    alert_level:   str
    risk_score:    float
    forest_loss:   float   = 0.0
    urban_growth:  float   = 0.0
    top_issues:    List[str] = []


def send_demo_alert_email(data: AlertEmailRequest) -> bool:
    """
    Send a formatted environmental alert email via Gmail SMTP.
    Requires GMAIL_ADDRESS and GMAIL_APP_PASSWORD env vars.
    """
    sender   = os.getenv("GMAIL_ADDRESS", "")
    password = os.getenv("GMAIL_APP_PASSWORD", "")
    if not sender or not password:
        raise ValueError(
            "Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD environment variables"
        )

    # Build issue bullet list
    issues_text = ""
    if data.top_issues:
        issues_text = "\n".join(f"  • {issue}" for issue in data.top_issues)
    else:
        issues_text = "  • No significant issues detected"

    body = f"""\
DeepEarth Environmental Monitoring Alert
{'=' * 45}

Region: {data.region_name}
Latitude: {data.latitude:.4f}
Longitude: {data.longitude:.4f}

Alert Level: {data.alert_level}
Environmental Risk Index: {data.risk_score:.1f} / 100

Forest Loss: {data.forest_loss:.1f}%
Urban Growth: {data.urban_growth:.1f}%

Detected Issues:
{issues_text}

{'─' * 45}
This alert was generated by the DeepEarth AI
environmental monitoring system.
"""

    msg = MIMEMultipart()
    msg["From"]    = sender
    msg["To"]      = DEMO_RECIPIENT
    msg["Subject"] = f"🌍 DeepEarth Environmental Alert — {data.alert_level}"
    msg.attach(MIMEText(body, "plain"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
        server.login(sender, password)
        server.sendmail(sender, DEMO_RECIPIENT, msg.as_string())

    return True


@app.post("/send-alert-email")
async def send_alert_email_endpoint(req: AlertEmailRequest):
    """Send a demo Gmail alert for HIGH / CRITICAL environmental alerts."""
    try:
        send_demo_alert_email(req)
        return {
            "success": True,
            "message": "Email alert sent successfully",
            "recipient": DEMO_RECIPIENT,
        }
    except Exception as e:
        raise HTTPException(500, f"Email sending failed: {str(e)}")

