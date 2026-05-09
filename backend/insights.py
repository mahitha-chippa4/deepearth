"""
DeepEarth V2 — AI Insights & Reforms Generator

Analyzes environmental change statistics and generates natural-language
trend analysis, consequence warnings, and practical reform suggestions.

No external AI API needed — uses rule-based NLG with rich templates
derived from environmental science best practices.
"""

from __future__ import annotations
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Trend Classification ─────────────────────────────────────────────────

def _classify_trend(current_pct: float, threshold_high: float = 5.0) -> str:
    """Classify a metric as increasing, stable, or low."""
    if current_pct >= threshold_high:
        return "increasing"
    elif current_pct >= 2.0:
        return "moderate"
    elif current_pct >= 0.5:
        return "low"
    else:
        return "minimal"


# ── Consequence Templates ────────────────────────────────────────────────

CONSEQUENCES = {
    "Permanent Deforestation": {
        "increasing": "Continued deforestation at this rate could lead to significant biodiversity loss, soil erosion, and disruption of local water cycles. Carbon sequestration capacity will decline, contributing to regional climate warming.",
        "moderate": "Moderate deforestation levels indicate ongoing forest conversion. Without intervention, this could accelerate and cross ecological tipping points within a few years.",
        "low": "Low-level deforestation is present but manageable. Early intervention can prevent escalation.",
    },
    "Forest Degradation": {
        "increasing": "Widespread forest degradation reduces canopy density and ecosystem health without complete removal. This weakens forests' resilience to drought, fire, and pest outbreaks.",
        "moderate": "Selective logging and degradation patterns suggest unsustainable extraction practices that weaken forest integrity over time.",
        "low": "Minor degradation is detectable. Monitoring should continue to prevent escalation.",
    },
    "Urban Expansion": {
        "increasing": "Rapid urban sprawl is converting natural and agricultural land at a concerning rate. This leads to habitat fragmentation, increased heat island effects, and strain on water resources.",
        "moderate": "Steady urbanization is reshaping the landscape. Green infrastructure planning is essential to mitigate environmental impact.",
        "low": "Urban growth is contained at manageable levels.",
    },
    "Mining Activity": {
        "increasing": "High mining activity causes severe land degradation, water contamination, and biodiversity destruction. Heavy metal runoff poses risks to downstream communities and aquatic ecosystems.",
        "moderate": "Active mining operations are present. Regulatory enforcement and environmental impact monitoring are critical.",
        "low": "Limited mining detected. Continued monitoring recommended.",
    },
    "Industrial Zone": {
        "increasing": "Industrial expansion is contributing to air and water pollution, soil contamination, and displacement of agricultural land. Emission controls and buffer zone planning are urgent priorities.",
        "moderate": "Industrial growth is steady. Environmental compliance monitoring should be strengthened.",
        "low": "Industrial footprint is limited in this region.",
    },
    "Agricultural Expansion": {
        "increasing": "Rapid agricultural conversion is replacing natural vegetation. While supporting food security, this reduces biodiversity corridors and increases agrochemical runoff into waterways.",
        "moderate": "Agricultural activity is expanding into previously natural areas. Sustainable farming practices can help balance food production with conservation.",
        "low": "Agricultural changes are minimal in this region.",
    },
    "Water Body Shrinkage": {
        "increasing": "Significant water body reduction indicates severe hydrological stress. This threatens freshwater availability, fisheries, and wetland ecosystems that serve as natural flood buffers.",
        "moderate": "Water bodies show signs of shrinkage, potentially from upstream diversion or climate impacts.",
        "low": "Minor water level changes detected.",
    },
    "Burn Scars": {
        "increasing": "Extensive burn scars indicate frequent or severe fire events. This may be linked to land clearing practices or drought conditions, and severely impacts soil health and air quality.",
        "moderate": "Fire damage is present in the region. Fire management and early detection systems should be prioritized.",
        "low": "Limited fire impact detected.",
    },
}

# ── Reform Templates ─────────────────────────────────────────────────────

REFORMS = {
    "Permanent Deforestation": [
        "Enforce strict logging bans in primary/old-growth forest zones",
        "Expand community forest management programs with economic incentives",
        "Establish biological corridors connecting remaining forest patches",
        "Implement satellite-based real-time deforestation alert systems",
    ],
    "Forest Degradation": [
        "Promote sustainable forestry certification (FSC/PEFC) for timber operations",
        "Invest in assisted natural regeneration programs",
        "Implement selective harvesting quotas with mandatory replanting",
    ],
    "Urban Expansion": [
        "Adopt urban growth boundaries and green belt policies",
        "Mandate green infrastructure (parks, urban forests) in new developments",
        "Incentivize vertical development over horizontal sprawl",
        "Require environmental impact assessments for all development projects",
    ],
    "Mining Activity": [
        "Enforce mandatory mine reclamation and land rehabilitation bonds",
        "Implement water quality monitoring downstream of mining operations",
        "Create buffer zones between mining areas and water sources/settlements",
        "Transition to less destructive extraction technologies",
    ],
    "Industrial Zone": [
        "Strengthen emission monitoring and enforce pollution control standards",
        "Require industrial effluent treatment before discharge",
        "Plan green buffer zones between industrial and residential areas",
    ],
    "Agricultural Expansion": [
        "Promote agroforestry systems that combine crops with tree cover",
        "Implement precision agriculture to reduce land conversion needs",
        "Establish riparian buffer zones along waterways in agricultural areas",
        "Support organic farming transitions with subsidies and training",
    ],
    "Water Body Shrinkage": [
        "Regulate groundwater extraction with permit systems",
        "Restore wetland buffer zones around shrinking water bodies",
        "Implement rainwater harvesting and watershed management programs",
    ],
    "Burn Scars": [
        "Deploy early fire detection systems using satellite monitoring",
        "Create firebreaks and manage fuel loads in fire-prone areas",
        "Enforce strict penalties for illegal burning and land clearing",
    ],
}


def generate_insights(
    region_name: str,
    current_stats: dict,
    historical_stats: dict | None = None,
) -> dict:
    """
    Generate AI-powered trend analysis and reform recommendations.

    Args:
        region_name: Name of the analysed region
        current_stats: Stats dict from compute_region_stats()
        historical_stats: Optional historical stats for comparison

    Returns:
        {
            "insight_text": "Full natural language analysis",
            "trends": [...],
            "reforms": [...],
            "generated_at": "ISO timestamp",
        }
    """
    top_issues = current_stats.get("top_issues", [])
    severity = current_stats.get("severity", "LOW")
    alert_score = current_stats.get("alert_score", 0)
    forest_loss = current_stats.get("forest_loss_pct", 0)
    urban_growth = current_stats.get("urban_growth_pct", 0)

    # ── Build trend analysis ──────────────────────────────────────────
    trends = []
    consequences = []
    reform_list = []

    for issue in top_issues:
        name = issue.get("class_name", "Unknown")
        pct = issue.get("percentage", 0)
        trend = _classify_trend(pct)

        trends.append({
            "issue": name,
            "percentage": pct,
            "trend": trend,
        })

        # Consequence text
        issue_consequences = CONSEQUENCES.get(name, {})
        consequence_text = issue_consequences.get(
            trend if trend in issue_consequences else "low",
            f"{name} activity detected at {pct:.1f}% of the region."
        )
        consequences.append(f"**{name}** ({pct:.1f}%): {consequence_text}")

        # Reforms
        issue_reforms = REFORMS.get(name, [])
        if issue_reforms and trend in ("increasing", "moderate"):
            reform_list.extend(issue_reforms[:3])

    # Remove duplicate reforms
    seen = set()
    unique_reforms = []
    for r in reform_list:
        if r not in seen:
            seen.add(r)
            unique_reforms.append(r)

    # ── Compose insight text ──────────────────────────────────────────
    sections = []

    # Header
    sections.append(
        f"## Environmental Analysis: {region_name}\n\n"
        f"**Alert Level:** {severity} (Score: {alert_score:.1f})\n\n"
    )

    # Overview
    overview_parts = []
    if forest_loss > 0:
        overview_parts.append(f"forest loss at {forest_loss:.1f}%")
    if urban_growth > 0:
        overview_parts.append(f"urban growth at {urban_growth:.1f}%")

    if overview_parts:
        sections.append(
            f"This region shows {', '.join(overview_parts)} "
            f"based on the latest satellite data analysis.\n\n"
        )

    # Trend analysis section
    if consequences:
        sections.append("### Trend Analysis\n\n")
        sections.append(
            "If current patterns continue at the observed rate, "
            "the following impacts are projected:\n\n"
        )
        for c in consequences:
            sections.append(f"- {c}\n\n")

    # Reforms section
    if unique_reforms:
        sections.append("### Recommended Reforms & Actions\n\n")
        sections.append(
            "Based on the detected environmental changes, the following "
            "interventions are recommended:\n\n"
        )
        for i, reform in enumerate(unique_reforms[:8], 1):
            sections.append(f"{i}. {reform}\n")
        sections.append("\n")

    # Closing
    sections.append(
        "---\n\n"
        "*This analysis is generated from satellite imagery and AI classification. "
        "Field verification is recommended for policy decisions. "
        "Data reflects the most recent available Sentinel-2 observations.*"
    )

    insight_text = "".join(sections)

    return {
        "insight_text": insight_text,
        "trends": trends,
        "reforms": unique_reforms[:8],
        "severity": severity,
        "alert_score": alert_score,
        "generated_at": datetime.now().isoformat(),
    }
