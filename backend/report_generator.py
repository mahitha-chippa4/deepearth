"""
DeepEarth V2 — PDF Report Generator
Produces professional downloadable environmental analysis reports.
Requires: reportlab, Pillow
"""
import io
import base64
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


def _decode_b64_image(b64_str: str):
    """Decode a base64 PNG string into a PIL Image, or None on failure."""
    try:
        from PIL import Image
        data = base64.b64decode(b64_str)
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:
        logger.warning("Could not decode image: %s", exc)
        return None


def generate_report(
    region_name: str,
    lat: float,
    lon: float,
    stats: dict,
    timestamp: Optional[str] = None,
    prediction_image_b64: Optional[str] = None,
    explanation_map_b64: Optional[str] = None,
) -> bytes:
    """
    Generate a professional PDF report and return the raw bytes.

    Args:
        region_name:         Analysed region display name
        lat / lon:           Coordinates used for analysis
        stats:               Dict with keys: alert_score, severity,
                             forest_loss_pct, urban_growth_pct,
                             top_issues, distribution
        timestamp:           ISO timestamp string
        prediction_image_b64: base64 AI prediction PNG
        explanation_map_b64:  base64 Grad-CAM heatmap PNG

    Returns:
        PDF bytes
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import (
        HexColor, white, black, Color,
    )
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage,
        HRFlowable,
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
    )

    # ── Colour palette ──────────────────────────────────────────────────────
    GREEN   = HexColor("#1B5E20")
    LGREEN  = HexColor("#43A047")
    DARK    = HexColor("#1A1A1A")
    MGRAY   = HexColor("#555555")
    LGRAY   = HexColor("#F5F5F5")
    RED     = HexColor("#C62828")
    ORANGE  = HexColor("#E65100")
    YELLOW  = HexColor("#F9A825")

    severity_color = {
        "HIGH":   RED,
        "MEDIUM": ORANGE,
        "LOW":    YELLOW,
        "CLEAR":  LGREEN,
    }.get(stats.get("severity", "LOW"), MGRAY)

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=20, textColor=white, alignment=TA_CENTER,
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"],
        fontSize=10, textColor=HexColor("#CCCCCC"), alignment=TA_CENTER,
        spaceAfter=0,
    )
    section_style = ParagraphStyle(
        "Section", parent=styles["Heading2"],
        fontSize=12, textColor=GREEN, spaceBefore=14, spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body", parent=styles["Normal"],
        fontSize=9, textColor=DARK, spaceAfter=4,
    )
    caption_style = ParagraphStyle(
        "Caption", parent=styles["Normal"],
        fontSize=8, textColor=MGRAY, alignment=TA_CENTER, spaceAfter=6,
    )

    elems = []

    # ── Header banner ───────────────────────────────────────────────────────
    header_data = [[
        Paragraph("🌍  DeepEarth Environmental Analysis Report", title_style),
    ]]
    header_table = Table(header_data, colWidths=[17 * cm])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GREEN),
        ("ROUNDEDCORNERS", [6]),
        ("TOPPADDING",    (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ]))
    elems.append(header_table)
    elems.append(Spacer(1, 14))

    ts = timestamp or datetime.utcnow().isoformat()
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        ts_display = dt.strftime("%d %B %Y, %H:%M UTC")
    except Exception:
        ts_display = ts

    elems.append(Paragraph(
        f"Generated: {ts_display}", caption_style,
    ))
    elems.append(HRFlowable(width="100%", thickness=1, color=LGREEN, spaceAfter=10))

    # ── 1. Region Information ───────────────────────────────────────────────
    elems.append(Paragraph("1. Region Information", section_style))
    region_data = [
        ["Region", region_name],
        ["Latitude", f"{lat:.5f}°N"],
        ["Longitude", f"{lon:.5f}°E"],
        ["Analysis Date", ts_display],
    ]
    region_table = Table(region_data, colWidths=[5 * cm, 12 * cm])
    region_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (0, -1), LGRAY),
        ("FONTNAME",     (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("TEXTCOLOR",    (0, 0), (-1, -1), DARK),
        ("GRID",         (0, 0), (-1, -1), 0.5, HexColor("#DDDDDD")),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    elems.append(region_table)

    # ── 2. Environmental Statistics ─────────────────────────────────────────
    elems.append(Paragraph("2. Environmental Statistics", section_style))

    alert_score    = stats.get("alert_score", 0)
    severity       = stats.get("severity", "N/A")
    forest_loss    = stats.get("forest_loss_pct", 0)
    urban_growth   = stats.get("urban_growth_pct", 0)

    stats_data = [
        ["Metric", "Value"],
        ["Alert Score",    str(alert_score)],
        ["Alert Severity", severity],
        ["Forest Loss",    f"{forest_loss}%"],
        ["Urban Growth",   f"{urban_growth}%"],
    ]
    stats_table = Table(stats_data, colWidths=[6 * cm, 11 * cm])
    stats_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND",   (0, 1), (0, -1), LGRAY),
        ("FONTNAME",     (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("TEXTCOLOR",    (0, 1), (-1, -1), DARK),
        ("GRID",         (0, 0), (-1, -1), 0.5, HexColor("#DDDDDD")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LGRAY]),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        # Colour the severity cell
        ("TEXTCOLOR",    (1, 2), (1, 2), severity_color),
        ("FONTNAME",     (1, 2), (1, 2), "Helvetica-Bold"),
    ]))
    elems.append(stats_table)

    # ── 3. Detected Issues ──────────────────────────────────────────────────
    elems.append(Paragraph("3. Detected Issues", section_style))
    issues = stats.get("top_issues", [])
    if issues:
        issue_data = [["Issue", "Coverage (%)", "Impact Score"]]
        for issue in issues:
            issue_data.append([
                issue.get("class_name", ""),
                f"{issue.get('percentage', 0):.1f}%",
                f"{issue.get('impact_score', 0):.1f}",
            ])
        issue_table = Table(issue_data, colWidths=[8 * cm, 4.5 * cm, 4.5 * cm])
        issue_table.setStyle(TableStyle([
            ("BACKGROUND",     (0, 0), (-1, 0), HexColor("#2E7D32")),
            ("TEXTCOLOR",      (0, 0), (-1, 0), white),
            ("FONTNAME",       (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",       (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LGRAY]),
            ("GRID",           (0, 0), (-1, -1), 0.5, HexColor("#DDDDDD")),
            ("ALIGN",          (1, 0), (-1, -1), "CENTER"),
            ("TOPPADDING",     (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 5),
            ("LEFTPADDING",    (0, 0), (-1, -1), 8),
        ]))
        elems.append(issue_table)
    else:
        elems.append(Paragraph("No significant issues detected.", body_style))

    # ── 4. AI Prediction Map ────────────────────────────────────────────────
    if prediction_image_b64:
        elems.append(Paragraph("4. AI Prediction Map", section_style))
        pred_pil = _decode_b64_image(prediction_image_b64)
        if pred_pil:
            pred_pil = pred_pil.resize((300, 300))
            pred_io = io.BytesIO()
            pred_pil.save(pred_io, format="PNG")
            pred_io.seek(0)
            img_rl = RLImage(pred_io, width=8 * cm, height=8 * cm)
            # Centre it
            img_table = Table([[img_rl]], colWidths=[17 * cm])
            img_table.setStyle(TableStyle([
                ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            elems.append(img_table)
            elems.append(Paragraph(
                "AI pixel-level environmental change classification map", caption_style,
            ))

    # ── 5. Grad-CAM Explanation ─────────────────────────────────────────────
    if explanation_map_b64:
        elems.append(Paragraph("5. AI Explanation Heatmap (Grad-CAM)", section_style))
        expl_pil = _decode_b64_image(explanation_map_b64)
        if expl_pil:
            expl_pil = expl_pil.resize((300, 300))
            expl_io = io.BytesIO()
            expl_pil.save(expl_io, format="PNG")
            expl_io.seek(0)
            img_rl = RLImage(expl_io, width=8 * cm, height=8 * cm)
            img_table = Table([[img_rl]], colWidths=[17 * cm])
            img_table.setStyle(TableStyle([
                ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            elems.append(img_table)
            elems.append(Paragraph(
                "Grad-CAM attention heatmap — Red = high model attention, Blue = low attention",
                caption_style,
            ))

    # ── 6. AI Interpretation ───────────────────────────────────────────────
    elems.append(Paragraph("6. AI Interpretation", section_style))
    elems.append(Paragraph(
        f"The DeepEarth V2 model (UNetV3) analysed satellite imagery for "
        f"<b>{region_name}</b> (lat {lat:.3f}°, lon {lon:.3f}°). "
        f"The model detected a <b>{severity}</b> environmental alert with a composite "
        f"score of <b>{alert_score}</b>. "
        f"An estimated <b>{forest_loss}%</b> of the analysed area showed forest-cover "
        f"loss, while urban expansion accounted for <b>{urban_growth}%</b>.",
        body_style,
    ))
    if explanation_map_b64:
        elems.append(Paragraph(
            "The Grad-CAM heatmap highlights the spatial regions that most strongly "
            "influenced the model's classification. Areas shown in red indicate the "
            "strongest model attention, suggesting the highest confidence in detected "
            "environmental changes. Yellow indicates moderate attention, and blue "
            "indicates lower model focus.",
            body_style,
        ))

    # ── Footer ──────────────────────────────────────────────────────────────
    elems.append(Spacer(1, 16))
    elems.append(HRFlowable(width="100%", thickness=0.5, color=MGRAY))
    elems.append(Paragraph(
        "DeepEarth V2 — AI-powered Environmental Monitoring Platform | "
        "Data sourced from Google Earth Engine & Hansen Global Forest Watch",
        ParagraphStyle("footer", parent=styles["Normal"],
                       fontSize=7, textColor=MGRAY, alignment=TA_CENTER),
    ))

    doc.build(elems)
    buf.seek(0)
    return buf.read()
