import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Build a GeoJSON Polygon from lat/lon center + bbox half-width.
 * Used when no polygon geometry has been explicitly drawn.
 */
export const bboxToGeoJSON = (lat, lon, bboxSize = 0.3) => ({
  type: 'Polygon',
  coordinates: [[
    [lon - bboxSize, lat - bboxSize],
    [lon + bboxSize, lat - bboxSize],
    [lon + bboxSize, lat + bboxSize],
    [lon - bboxSize, lat + bboxSize],
    [lon - bboxSize, lat - bboxSize],   // close the ring
  ]],
});

/**
 * Run inference on a region.
 * geometry: GeoJSON Polygon (optional — falls back to bbox)
 */
export const predictRegion = async (lat, lon, bboxSize = 0.3, modelType = 'static', geometry = null) => {
  const { data } = await api.post('/predict', {
    lat,
    lon,
    bbox_size: bboxSize,
    model_type: modelType,
    geometry: geometry || bboxToGeoJSON(lat, lon, bboxSize),
  });
  return data;
};

/**
 * Run the full change-detection pipeline for a region.
 * geometry: GeoJSON Polygon — stats are clipped to this polygon.
 * If omitted, a bbox polygon is constructed from lat/lon/bboxSize.
 */
export const detectChange = async (lat, lon, regionName = 'Unknown', bboxSize = 0.3, geometry = null) => {
  const { data } = await api.post('/detect-change', {
    lat,
    lon,
    bbox_size: bboxSize,
    region_name: regionName,
    geometry: geometry || bboxToGeoJSON(lat, lon, bboxSize),
  });
  return data;
};

/**
 * Analyze an arbitrary user-drawn GeoJSON polygon.
 */
export const analyzePolygon = async (geometry, regionName = 'Custom Region') => {
  const { data } = await api.post('/analyze-polygon', {
    geometry,
    region_name: regionName,
  });
  return data;
};

export const getAlerts = async () => { const { data } = await api.get('/alerts'); return data; };
export const getRegions = async () => { const { data } = await api.get('/regions'); return data; };
export const getClasses = async () => { const { data } = await api.get('/classes'); return data; };

/**
 * Time-lapse: predict for a specific year (or "latest").
 */
export const predictYear = async (lat, lon, year = 'latest', regionName = 'Region', bboxSize = 0.3, geometry = null) => {
  const { data } = await api.post('/predict-year', {
    lat,
    lon,
    bbox_size: bboxSize,
    year: String(year),
    region_name: regionName,
    geometry: geometry || bboxToGeoJSON(lat, lon, bboxSize),
  });
  return data;
};

export default api;
