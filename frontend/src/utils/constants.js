export const CLASS_NAMES = [
  'No Change', 'Temporary Veg Loss', 'Permanent Deforestation',
  'Forest Degradation', 'Urban Expansion', 'Industrial Zone',
  'Mining Activity', 'Sand Mining', 'Water Body Shrinkage',
  'Burn Scars', 'Agricultural Expansion',
];

export const CLASS_COLORS = [
  '#D3D3D3', '#FFA726', '#EF1010', '#B71C1C', '#9C27B0',
  '#6A1B9A', '#8D6E63', '#FFD600', '#039BE5', '#FF6D00', '#43A047',
];

export const SEVERITY_CONFIG = {
  CRITICAL: { icon: '🔴', color: '#e74c3c', bg: '#fdecea' },
  HIGH: { icon: '🟠', color: '#e67e22', bg: '#fef5e7' },
  MEDIUM: { icon: '🟡', color: '#f1c40f', bg: '#fef9e7' },
  LOW: { icon: '🟢', color: '#2ecc71', bg: '#eafaf1' },
  CLEAR: { icon: '✅', color: '#27ae60', bg: '#eafaf1' },
};

export const SIDEBAR_ITEMS = [
  { id: 'forest-change', label: 'FOREST CHANGE', icon: '🌲', hasNotif: true },
  { id: 'land-cover', label: 'LAND COVER', icon: '🗺️', hasNotif: true },
  { id: 'land-use', label: 'LAND USE', icon: '🏗️' },
  { id: 'climate', label: 'CLIMATE', icon: '🌡️' },
  { id: 'biodiversity', label: 'BIODIVERSITY', icon: '🌿' },
];

export const SIDEBAR_BOTTOM = [
  { id: 'explore', label: 'EXPLORE', icon: '🔭' },
  { id: 'search', label: 'SEARCH', icon: '🔍' },
  { id: 'my-gfw', label: 'MY GFW', icon: '⭐' },
];
