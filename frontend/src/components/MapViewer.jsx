import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

/*
 * MAP ENGINE: MapLibre GL JS v5
 * Flat 2D Mercator projection — matches Global Forest Watch.
 *
 * Layers:
 *   1. Carto Positron basemap
 *   2. Hansen tree cover (green)
 *   3. Hansen forest loss (pink)
 *   4. AI prediction overlay (dynamic — added/removed per analysis)
 */

const INDIAN_REGIONS = [
  { name: 'Telangana, India', lat: 17.45, lon: 78.45, area: '11.2', bbox: 0.3 },
  { name: 'Maharashtra, India', lat: 19.75, lon: 75.71, area: '30.8', bbox: 0.3 },
  { name: 'Karnataka, India', lat: 15.32, lon: 75.71, area: '19.2', bbox: 0.3 },
  { name: 'Kerala, India', lat: 10.85, lon: 76.27, area: '3.9', bbox: 0.3 },
  { name: 'West Bengal, India', lat: 22.98, lon: 87.75, area: '8.9', bbox: 0.3 },
  { name: 'Jharkhand, India', lat: 23.61, lon: 85.28, area: '7.9', bbox: 0.3 },
  { name: 'Delhi NCR, India', lat: 28.70, lon: 77.10, area: '1.5', bbox: 0.3 },
  { name: 'Rajasthan, India', lat: 27.02, lon: 74.22, area: '34.2', bbox: 0.3 },
  { name: 'Assam, India', lat: 26.20, lon: 92.94, area: '7.8', bbox: 0.3 },
  { name: 'Uttarakhand, India', lat: 30.07, lon: 79.02, area: '5.3', bbox: 0.3 },
  { name: 'Andaman Islands, India', lat: 11.74, lon: 92.66, area: '0.8', bbox: 0.3 },
  { name: 'Goa, India', lat: 15.30, lon: 74.00, area: '0.4', bbox: 0.2 },
  { name: 'Tamil Nadu, India', lat: 11.13, lon: 78.66, area: '13.0', bbox: 0.3 },
  { name: 'Odisha, India', lat: 20.94, lon: 84.80, area: '15.6', bbox: 0.3 },
  { name: 'Madhya Pradesh, India', lat: 22.97, lon: 78.66, area: '30.8', bbox: 0.3 },
  { name: 'Punjab, India', lat: 31.15, lon: 75.34, area: '5.0', bbox: 0.3 },
  { name: 'Gujarat, India', lat: 22.26, lon: 71.19, area: '19.6', bbox: 0.3 },
  { name: 'Chhattisgarh, India', lat: 21.28, lon: 81.87, area: '13.5', bbox: 0.3 },
  { name: 'Himachal Pradesh, India', lat: 31.90, lon: 77.11, area: '5.6', bbox: 0.3 },
  { name: 'Arunachal Pradesh, India', lat: 27.10, lon: 93.62, area: '8.4', bbox: 0.3 },
];

const PREDICTION_SOURCE = 'ai-prediction-src';
const PREDICTION_LAYER = 'ai-prediction-layer';
const GRADCAM_SOURCE = 'gradcam-src';
const GRADCAM_LAYER = 'gradcam-layer';
const POLYGON_OUTLINE_SOURCE = 'drawn-polygon-src';
const POLYGON_OUTLINE_LAYER  = 'drawn-polygon-outline';
const POLYGON_FILL_LAYER     = 'drawn-polygon-fill';

export default function MapViewer({
  onRegionClick,
  layers,
  onViewerReady,
  predictionOverlay,
  showPredictionLayer,
  gradcamOverlay,
  showGradcam,
  onDrawCreate,
  onDrawDelete,
  onDrawModeChange,
  drawnPolygon,    // GeoJSON geometry | null — drawn polygon to outline
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  // ── Initialise map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [78.9, 20.5],
      zoom: 4.2,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      dragRotate: false,
      touchZoomRotate: false,
    });

    map.keyboard.disableRotation();

    map.on('load', () => {
      // Forest Cover
      map.addSource('forest-cover-src', {
        type: 'raster',
        tiles: ['https://storage.googleapis.com/earthenginepartners-hansen/tiles/gfc2015/tree_alpha/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 12,
      });
      map.addLayer({
        id: 'forest-cover-layer',
        type: 'raster',
        source: 'forest-cover-src',
        paint: {
          'raster-opacity': 0.6,
          'raster-brightness-min': 0.08,
          'raster-brightness-max': 0.9,
          'raster-saturation': 1.5,
          'raster-hue-rotate': 100,
          'raster-contrast': 0.2,
        },
      });

      // Forest Loss
      map.addSource('forest-loss-src', {
        type: 'raster',
        tiles: ['https://storage.googleapis.com/earthenginepartners-hansen/tiles/gfc_v1.11/loss_alpha/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 12,
      });
      map.addLayer({
        id: 'forest-loss-layer',
        type: 'raster',
        source: 'forest-loss-src',
        paint: { 'raster-opacity': 0.8 },
      });
    });

    // ── MapboxDraw control ──────────────────────────────────────────────
    // Instantiate BEFORE the click handler so the guard below works.
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
      styles: [
        // ── Polygon ─────────────────────────────────────────────────────
        // Completed + in-progress polygon fill
        { id: 'gl-draw-polygon-fill-inactive',
          type: 'fill',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: { 'fill-color': '#1976d2', 'fill-outline-color': '#1565c0', 'fill-opacity': 0.15 } },
        { id: 'gl-draw-polygon-fill-active',
          type: 'fill',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          paint: { 'fill-color': '#1976d2', 'fill-outline-color': '#1565c0', 'fill-opacity': 0.12 } },
        // Polygon stroke — inactive
        { id: 'gl-draw-polygon-stroke-inactive',
          type: 'line',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: { 'line-color': '#1565c0', 'line-width': 2, 'line-dasharray': [4, 2] } },
        // Polygon stroke — active (solid blue while drawing)
        { id: 'gl-draw-polygon-stroke-active',
          type: 'line',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          paint: { 'line-color': '#1565c0', 'line-width': 2.5 } },
        // ── Live drawing line (from last point to cursor) ──────────────
        { id: 'gl-draw-line-active',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
          paint: { 'line-color': '#1565c0', 'line-width': 2.5, 'line-dasharray': [2, 2] } },
        // ── Vertices ─────────────────────────────────────────────────────
        // White halo on all vertex points
        { id: 'gl-draw-point-stroke-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'true'], ['!=', 'meta', 'midpoint']],
          paint: { 'circle-radius': 8, 'circle-color': '#fff' } },
        // Blue dot on active vertices
        { id: 'gl-draw-point-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['!=', 'meta', 'midpoint'], ['==', 'active', 'true']],
          paint: { 'circle-radius': 6, 'circle-color': '#1976d2', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
        // Inactive vertices (after polygon completed)
        { id: 'gl-draw-point-inactive',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'false'], ['==', 'meta', 'feature']],
          paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#1565c0', 'circle-stroke-width': 2 } },
        // Mid-point drag handles
        { id: 'gl-draw-midpoint',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
          paint: { 'circle-radius': 4, 'circle-color': '#1976d2', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } },
      ],
    });
    map.addControl(draw);

    // Click handler — skip entirely when MapboxDraw is capturing points
    map.on('click', async (e) => {
      if (draw.getMode() === 'draw_polygon') return;  // ← key guard

      const lat = +e.lngLat.lat.toFixed(5);
      const lng = +e.lngLat.lng.toFixed(5);

      let closest = null;
      let minDist = Infinity;
      for (const region of INDIAN_REGIONS) {
        const d = Math.hypot(lat - region.lat, lng - region.lon);
        if (d < minDist && d < 3.5) { minDist = d; closest = region; }
      }

      let displayName = closest ? closest.name : `Region at ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=8`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (resp.ok) {
          const geo = await resp.json();
          const addr = geo.address || {};
          const local = addr.county || addr.state_district || addr.city || addr.town || addr.village || '';
          const state = addr.state || '';
          if (local && state) displayName = `${local}, ${state}`;
          else if (state) displayName = state;
          else if (geo.display_name) displayName = geo.display_name.split(',').slice(0, 2).join(',').trim();
        }
      } catch (_) { /* keep fallback */ }

      onRegionClick({ lat, lon: lng, clickLat: lat, clickLon: lng,
        name: displayName, area: closest?.area || 'N/A',
        bbox: closest?.bbox || 0.3, stateName: closest?.name || null });
    });

    map.on('mousemove', () => { map.getCanvas().style.cursor = 'crosshair'; });

    map.on('draw.create', (e) => {
      const validFeatures = e.features.filter(f => f.geometry.type === 'Polygon');
      if (validFeatures.length) onDrawCreate?.({ type: 'FeatureCollection', features: validFeatures });
    });
    map.on('draw.delete', () => onDrawDelete?.());
    map.on('draw.modechange', (e) => onDrawModeChange?.(e.mode));

    mapRef.current = map;
    onViewerReady?.({
      camera: {
        zoomIn: () => map.zoomIn({ duration: 300 }),
        zoomOut: () => map.zoomOut({ duration: 300 }),
      },
      flyTo: (center, zoom = 8) => { map.flyTo({ center, zoom, duration: 1200 }); },
      draw,   // expose draw instance so App.jsx can call draw.changeMode() etc.
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Layer toggles ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    try { map.setLayoutProperty('forest-cover-layer', 'visibility', layers.forestCover ? 'visible' : 'none'); } catch (_) { }
  }, [layers.forestCover]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    try { map.setLayoutProperty('forest-loss-layer', 'visibility', layers.forestLoss ? 'visible' : 'none'); } catch (_) { }
  }, [layers.forestLoss]);

  // ── AI Prediction Overlay ───────────────────────────────────────────────
  // Adds / removes a MapLibre image source + raster layer
  // whenever predictionOverlay or showPredictionLayer change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;

    // Remove previous overlay
    try { if (map.getLayer(PREDICTION_LAYER)) map.removeLayer(PREDICTION_LAYER); } catch (_) { }
    try { if (map.getSource(PREDICTION_SOURCE)) map.removeSource(PREDICTION_SOURCE); } catch (_) { }

    // Add new overlay if data is available and toggle is on
    if (predictionOverlay && showPredictionLayer) {
      const { imageUrl, bbox } = predictionOverlay;
      if (!imageUrl || !bbox) return;

      map.addSource(PREDICTION_SOURCE, {
        type: 'image',
        url: imageUrl,
        coordinates: [
          [bbox.west, bbox.north],   // top-left
          [bbox.east, bbox.north],   // top-right
          [bbox.east, bbox.south],   // bottom-right
          [bbox.west, bbox.south],   // bottom-left
        ],
      });

      map.addLayer({
        id: PREDICTION_LAYER,
        type: 'raster',
        source: PREDICTION_SOURCE,
        paint: {
          'raster-opacity': 0.65,
          'raster-fade-duration': 300,
        },
      });
    }
  }, [predictionOverlay, showPredictionLayer]);

  // ── Grad-CAM Explanation Overlay ────────────────────────────────────────
  // Sits ABOVE the prediction layer at 0.4 opacity with 500ms fade.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;

    try { if (map.getLayer(GRADCAM_LAYER)) map.removeLayer(GRADCAM_LAYER); } catch (_) { }
    try { if (map.getSource(GRADCAM_SOURCE)) map.removeSource(GRADCAM_SOURCE); } catch (_) { }

    if (gradcamOverlay && showGradcam) {
      const { imageUrl, bbox } = gradcamOverlay;
      if (!imageUrl || !bbox) return;

      map.addSource(GRADCAM_SOURCE, {
        type: 'image',
        url: imageUrl,
        coordinates: [
          [bbox.west, bbox.north],
          [bbox.east, bbox.north],
          [bbox.east, bbox.south],
          [bbox.west, bbox.south],
        ],
      });

      map.addLayer({
        id: GRADCAM_LAYER,
        type: 'raster',
        source: GRADCAM_SOURCE,
        paint: {
          'raster-opacity': 0.4,
          'raster-fade-duration': 500,   // 500ms fade-in
        },
      });
    }
  }, [gradcamOverlay, showGradcam]);

  // ── Drawn Polygon Outline ────────────────────────────────────────────────
  // Shows a blue border + light fill over the user's drawn polygon so the
  // analysis boundary is always visible, independent of the prediction raster.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;

    // Remove old outline
    try { if (map.getLayer(POLYGON_OUTLINE_LAYER)) map.removeLayer(POLYGON_OUTLINE_LAYER); } catch (_) {}
    try { if (map.getLayer(POLYGON_FILL_LAYER))    map.removeLayer(POLYGON_FILL_LAYER);    } catch (_) {}
    try { if (map.getSource(POLYGON_OUTLINE_SOURCE)) map.removeSource(POLYGON_OUTLINE_SOURCE); } catch (_) {}

    if (!drawnPolygon) return;

    map.addSource(POLYGON_OUTLINE_SOURCE, {
      type: 'geojson',
      data: { type: 'Feature', geometry: drawnPolygon, properties: {} },
    });

    // Semi-transparent fill
    map.addLayer({
      id: POLYGON_FILL_LAYER,
      type: 'fill',
      source: POLYGON_OUTLINE_SOURCE,
      paint: { 'fill-color': '#1976d2', 'fill-opacity': 0.06 },
    });

    // Solid blue dashed border
    map.addLayer({
      id: POLYGON_OUTLINE_LAYER,
      type: 'line',
      source: POLYGON_OUTLINE_SOURCE,
      paint: {
        'line-color': '#1565c0',
        'line-width': 2.5,
        'line-dasharray': [3, 2],
      },
    });
  }, [drawnPolygon]);

  return (
    <div
      ref={containerRef}
      id="maplibre-map"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 28 }}
    />
  );
}
