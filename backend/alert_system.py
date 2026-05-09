"""
DeepEarth V2 — Email Alert System
Sends Gmail notifications when major environmental changes are detected.
Also provides alert deduplication and per-region cooldown utilities.
"""

import os
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime


def send_alert_email(
    region_name: str,
    severity: str,
    alert_score: float,
    top_issues: list,
    coordinates: dict = None,
    forest_loss_pct: float = 0,
):
    """
    Send an environmental alert email via Gmail SMTP.

    Requires env vars: GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_RECIPIENT
    """
    gmail_user = os.getenv("GMAIL_USER")
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD")
    recipient = os.getenv("ALERT_RECIPIENT", gmail_user)

    if not gmail_user or not gmail_pass:
        print("⚠️  Gmail credentials not set. Skipping email alert.")
        print(f"   Would have sent: {severity} alert for {region_name}")
        return False

    # Build email
    subject = f"🚨 Environmental Alert: {severity} — {region_name}"

    issues_html = ""
    for issue in top_issues[:5]:
        icon = _severity_icon(issue.get("percentage", 0))
        issues_html += (
            f"<tr>"
            f"<td style='padding:8px;border-bottom:1px solid #eee'>"
            f"{icon} {issue['class_name']}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #eee;"
            f"text-align:right'>{issue['percentage']:.1f}%</td>"
            f"</tr>"
        )

    coords_text = ""
    if coordinates:
        coords_text = (
            f"<p><strong>📍 Location:</strong> "
            f"{coordinates.get('lat', 'N/A')}°N, "
            f"{coordinates.get('lon', 'N/A')}°E</p>"
        )

    severity_color = {
        "CRITICAL": "#e74c3c",
        "HIGH": "#e67e22",
        "MEDIUM": "#f1c40f",
        "LOW": "#2ecc71",
        "CLEAR": "#27ae60",
    }.get(severity, "#666")

    html = f"""
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
                 Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto;
                 background: #f5f5f5; padding: 20px;">

        <div style="background: white; border-radius: 12px; padding: 30px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #2E7D32; margin: 0;">🌍 DeepEarth Alert</h1>
                <p style="color: #666; margin: 5px 0;">
                    Environmental Monitoring System
                </p>
            </div>

            <div style="background: {severity_color}; color: white;
                        border-radius: 8px; padding: 15px; text-align: center;
                        margin-bottom: 20px;">
                <h2 style="margin: 0;">{severity} ALERT</h2>
                <p style="margin: 5px 0; opacity: 0.9;">
                    Alert Score: {alert_score:.1f}
                </p>
            </div>

            <h3 style="color: #333;">📍 Region: {region_name}</h3>
            {coords_text}

            <p><strong>🌲 Forest Loss:</strong> {forest_loss_pct:.1f}%</p>
            <p><strong>📅 Detected:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>

            <h4 style="color: #333; margin-top: 20px;">
                Detected Environmental Issues:
            </h4>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background: #f9f9f9;">
                    <th style="padding: 10px; text-align: left;">Issue</th>
                    <th style="padding: 10px; text-align: right;">Coverage</th>
                </tr>
                {issues_html}
            </table>

            <div style="margin-top: 25px; padding: 15px; background: #f0f7f0;
                        border-radius: 8px; border-left: 4px solid #4CAF50;">
                <p style="margin: 0; color: #2E7D32;">
                    <strong>Action Required:</strong> Review satellite imagery
                    and confirm changes in the DeepEarth dashboard.
                </p>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
                DeepEarth V2 — AI-Powered Environmental Monitoring<br>
                Powered by Sentinel-2 & Google Earth Engine
            </p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = gmail_user
    msg["To"] = recipient
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_user, gmail_pass)
            server.sendmail(gmail_user, recipient, msg.as_string())
        print(f"✅ Alert email sent to {recipient}")
        return True
    except Exception as e:
        print(f"❌ Failed to send email: {e}")
        return False


def should_trigger_alert(severity: str, forest_loss_pct: float) -> bool:
    """Determine if an alert should be triggered."""
    if severity in ("CRITICAL", "HIGH"):
        return True
    if forest_loss_pct > 30:
        return True
    return False


# ── Bug 1: Alert deduplication by region name ──────────────────

def dedup_alert(alerts: list, new_alert: dict, max_alerts: int = 100) -> None:
    """
    Insert *new_alert* into *alerts* (mutates in place).

    Dedup key: region name (case-insensitive, stripped).
    • If an alert for the same region already exists → UPDATE its
      score, severity, trend, top_issues, and timestamp in-place.
    • Otherwise → prepend to the list (capped at *max_alerts*).
    """
    key = new_alert.get("region", "").strip().lower()
    for idx, existing in enumerate(alerts):
        if existing.get("region", "").strip().lower() == key:
            # Update existing record
            existing["score"] = new_alert.get("score", existing.get("score"))
            existing["severity"] = new_alert.get("severity", existing.get("severity"))
            existing["forest_loss_pct"] = new_alert.get("forest_loss_pct", existing.get("forest_loss_pct"))
            existing["top_issues"] = new_alert.get("top_issues", existing.get("top_issues"))
            existing["timestamp"] = new_alert.get("timestamp", existing.get("timestamp"))
            existing["coordinates"] = new_alert.get("coordinates", existing.get("coordinates"))
            return
    # No existing entry — prepend
    alerts.insert(0, new_alert)
    if len(alerts) > max_alerts:
        alerts.pop()


# ── Bug 2: Per-region cooldown cache ───────────────────────────

class RegionCooldownCache:
    """
    Simple dict-based cache: { region_key: (timestamp, result) }.
    Returns cached result if the same region was processed within
    *cooldown_secs* seconds.
    """

    def __init__(self, cooldown_secs: int = 60):
        self._store: dict = {}       # region_key → (float_ts, result)
        self._cooldown = cooldown_secs

    def get(self, region_name: str):
        """Return cached result or None if expired / not found."""
        key = region_name.strip().lower()
        entry = self._store.get(key)
        if entry is None:
            return None
        cached_ts, cached_result = entry
        if time.time() - cached_ts < self._cooldown:
            return cached_result
        # Expired
        del self._store[key]
        return None

    def put(self, region_name: str, result):
        """Store a result with the current timestamp."""
        key = region_name.strip().lower()
        self._store[key] = (time.time(), result)


def _severity_icon(pct: float) -> str:
    if pct > 10:
        return "🔴"
    elif pct > 5:
        return "🟠"
    elif pct > 2:
        return "🟡"
    return "🟢"
