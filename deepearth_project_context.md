# DeepEarth V2 — Project Context Document

This document summarizes the architecture, features, and recent development history of the DeepEarth V2 project. It is designed to be shared with ChatGPT or other LLMs to provide full context on the current state of the codebase and guide future changes.

## 1. Project Overview
**DeepEarth V2** is an AI-powered, full-stack environmental monitoring platform. It performs real-time semantic segmentation on satellite imagery to detect, classify, and track 11 distinct classes of environmental change (e.g., Deforestation, Urban Expansion, Mining Activity, Water Body Shrinkage). It serves as a geospatial analytics dashboard for climate researchers and government agencies.

## 2. Tech Stack

### Backend (`/backend`)
- **Framework**: FastAPI (Python)
- **AI/ML**: PyTorch, NumPy, SciPy (for inference, sliding-window chunking, and smoothing)
- **Data Source**: Google Earth Engine (GEE) Python API (`earthengine-api`)
- **Key Files**: 
  - `app.py`: FastAPI routes, request validation, and application lifecycle.
  - `predict.py`: Handles model loading (UNetV3 and ConvLSTMUNet), patching, and post-processing.
  - `satellite_fetcher.py`: Connects to GEE, pulls multi-band Sentinel/Landsat imagery, computes spectral indices.
  - `explainability.py`: Grad-CAM implementation for UNetV3.
  - `alert_system.py`: Risk scoring and SMTP-based alert generation.
  - `report_generator.py`: PDF report generation.

### Frontend (`/frontend`)
- **Framework**: React.js with Vite
- **Styling**: Tailwind CSS (custom "paradise" theme with glassmorphism, pulse animations, and organic UI aesthetic)
- **Mapping**: React-Leaflet / Leaflet.js
- **Key Components**:
  - `AnalysisPanel.jsx`: Floating UI panel for layer toggles, legend, and analysis controls.
  - Main Map View: Interactive map enabling users to click regions or draw custom polygons for localized ML analysis.

## 3. Core Capabilities & Architecture

### A. The AI Pipeline
The backend relies on two separate PyTorch models:
1. **UNetV3 (Static Model)**: Analyzes a 2-year feature stack (Base Year vs. Current Year) to detect changes.
2. **ConvLSTMUNet (Temporal Model)**: Analyzes a 4-year sequence for deeper temporal change modeling.

**Input Features**: Both models consume 6 multi-spectral indices computed on the fly via GEE: `NDVI, NDWI, NDBI, NBR, EVI, MNDWI`.
**Sliding Window Inference**: Because user-drawn polygons or clicked regions can vary in size, inference is done via a sliding window approach (`PATCH_SIZE = 32`, `STRIDE = 16`). Overlapping predictions are averaged and smoothed using a majority-vote SciPy uniform filter to reduce salt-and-pepper noise.

### B. The 11-Class Taxonomy
The system classifies pixels into the following categories, mapped to distinct hex colors and alert weights:
0. No Change (Weight: 0)
1. Temporary Veg Loss (Weight: 1)
2. Permanent Deforestation (Weight: 10)
3. Forest Degradation (Weight: 8)
4. Urban Expansion (Weight: 3)
5. Industrial Zone (Weight: 5)
6. Mining Activity (Weight: 7)
7. Sand Mining (Weight: 6)
8. Water Body Shrinkage (Weight: 4)
9. Burn Scars (Weight: 5)
10. Agricultural Expansion (Weight: 0.5)

### C. Explainable AI (XAI)
DeepEarth includes a `/explain` endpoint that generates a Grad-CAM heatmap. It attaches hooks to the last encoder block (`enc4`) of the UNetV3 model and computes the gradients with respect to the input image patch, highlighting *why* the model made its change prediction.

### D. Automated Alerting & Reporting
When an analysis is completed, `alert_system.py` computes an aggregated risk score based on the weighted sum of detected classes. If the threshold is crossed, it fires an automated SMTP email alert indicating the severity, coordinates, and top issues. It also triggers an option on the frontend to download a comprehensive PDF report.

## 4. Recent Development History & Known Quirks

- **UI Redesign**: The UI was recently overhauled to match a premium "Dark Theme" design system with glassmorphism, responsive layer panels, and smooth micro-animations.
- **Taxonomy Upgrades**: We recently experimented with upgrading from 11 to 14 classes (Attempted to adjust thresholds, post-processing parameters, and GEE pipelines). Currently, the codebase relies on the stable 11-class taxonomy.
- **Model Loading Fallbacks**: To prevent runtime crashes during deployment or when missing weight files (`best_unet_final.pth` & `best_convlstm_final.pth`), the pipeline includes fail-safes to load randomly initialized weights so the API does not hard-crash. 
- **Explainability API Separation**: The Grad-CAM logic was explicitly separated into a secondary endpoint (`/explain`) rather than running inline with `/predict` to ensure no gradient accumulation overhead slows down standard map tile generation.

## 5. Potential Future Enhancements
*For the LLM processing this document, here are high-impact areas to suggest or focus on next:*
1. **Model Upgrades**: Completing the stable transition to a 14-class taxonomy or merging the spatial and temporal models into a single Swin-Transformer based architecture.
2. **Caching Layer**: Currently, GEE fetches are synchronous and heavy. Implementing a Redis cache for frequently queried regions.
3. **Frontend Polygons**: Ensure smooth synchronization between drawn Leaflet polygons and backend GeoJSON coordinate extraction (especially handling MultiPolygons or complex geometries).
4. **Vector Tie-ins**: Converting the raster output (`pred_map`) to simplified vector polygons post-prediction so the frontend can render crisp SVG/GeoJSON bounds instead of a pixelated PNG overlay.
