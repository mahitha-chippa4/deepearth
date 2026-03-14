import React, { useState } from 'react';
import { CLASS_NAMES, CLASS_COLORS, SEVERITY_CONFIG } from '../utils/constants';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function AnalysisResults({
  results,
  onClose,
  onExplain,          // (explanationMapDataUrl) => void
  showExplanation,    // boolean
  onToggleExplanation,// () => void
}) {
  const { stats, region, timestamp, bbox } = results;
  const severity = SEVERITY_CONFIG[stats?.severity] || SEVERITY_CONFIG.CLEAR;
  const [explaining, setExplaining] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [explainError, setExplainError] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // ── Send Gmail Alert ──────────────────────────────────────────────────
  const handleSendAlert = async () => {
    if (sendingEmail || emailSent) return;
    setSendingEmail(true);
    try {
      const lat = results.lat ?? ((bbox.north + bbox.south) / 2);
      const lon = results.lon ?? ((bbox.east + bbox.west) / 2);
      const resp = await fetch(`${API_BASE}/send-alert-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region_name: region,
          latitude: lat,
          longitude: lon,
          alert_level: stats.severity,
          risk_score: stats.alert_score,
          forest_loss: stats.forest_loss_pct || 0,
          urban_growth: stats.urban_growth_pct || 0,
          top_issues: (stats.top_issues || []).map(i => i.class_name),
        }),
      });
      if (!resp.ok) throw new Error(`Server ${resp.status}`);
      setEmailSent(true);
    } catch (err) {
      console.error('Email alert failed:', err);
      alert('Failed to send email alert. Please check backend configuration.');
    } finally {
      setSendingEmail(false);
    }
  };

  // ── Explain AI — call /explain then hand image URL to parent ──────────
  const handleExplain = async () => {
    if (explaining) return;
    setExplaining(true);
    setExplainError(null);
    try {
      // Derive lat/lon from bbox centre (robust when clickLat not in results)
      const lat = results.lat ?? ((bbox.north + bbox.south) / 2);
      const lon = results.lon ?? ((bbox.east + bbox.west) / 2);
      const resp = await fetch(`${API_BASE}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, bbox_size: 0.3, region_name: region }),
      });
      if (!resp.ok) throw new Error(`Server ${resp.status}`);
      const data = await resp.json();
      if (data.explanation_map) {
        onExplain?.(`data:image/png;base64,${data.explanation_map}`);
      } else {
        throw new Error('No heatmap returned');
      }
    } catch (err) {
      console.error('Explain AI failed:', err);
      setExplainError('Could not generate explanation. Try again.');
    } finally {
      setExplaining(false);
    }
  };

  // ── Download Report ────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const lat = results.lat ?? ((bbox.north + bbox.south) / 2);
      const lon = results.lon ?? ((bbox.east + bbox.west) / 2);
      const resp = await fetch(`${API_BASE}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region_name: region,
          lat,
          lon,
          stats,
          timestamp,
          prediction_image: results.prediction_image || null,
          explanation_map: results.explanation_map || null,
        }),
      });
      if (!resp.ok) throw new Error(`Server ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      // File name: deepearth_report_<region>_<date>.pdf
      const safeName = region.split(',')[0].trim().toLowerCase().replace(/\s+/g, '_');
      const year = new Date().getFullYear();
      a.href = url;
      a.download = `deepearth_report_${safeName}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Report generation failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="absolute top-4 left-4 w-[300px] max-h-[calc(100vh-120px)] z-20 animate-slide-in">
      <div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col max-h-full">
        {/* Header */}
        <div className="p-4 border-b border-gfw-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-gfw-text">{region || 'Analysis Results'}</h3>
            <p className="text-[10px] text-gfw-muted mt-0.5">
              {new Date(timestamp).toLocaleString()}
            </p>
          </div>
          <button
            id="results-close"
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gfw-muted"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Severity Badge */}
        <div
          className="mx-4 mt-3 py-2.5 px-3 rounded-lg flex items-center gap-3"
          style={{ backgroundColor: severity.bg }}
        >
          <span className="text-xl">{severity.icon}</span>
          <div>
            <div className="text-xs font-bold" style={{ color: severity.color }}>
              {stats.severity} ALERT
            </div>
            <div className="text-[10px] text-gfw-muted">Score: {stats.alert_score}</div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="px-4 py-3 grid grid-cols-2 gap-2">
          <MetricCard label="Forest Loss" value={`${stats.forest_loss_pct}%`} color="#e74c3c" />
          <MetricCard label="Urban Growth" value={`${stats.urban_growth_pct}%`} color="#9b59b6" />
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {/* Top Issues */}
          <h4 className="text-xs font-bold text-gfw-text mb-2 uppercase tracking-wider">
            Detected Issues
          </h4>
          <div className="space-y-2 mb-4">
            {stats.top_issues?.map((issue, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CLASS_COLORS[CLASS_NAMES.indexOf(issue.class_name)] || '#999' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gfw-text truncate">{issue.class_name}</span>
                    <span className="text-xs font-semibold text-gfw-text ml-2">
                      {issue.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(issue.percentage * 5, 100)}%`,
                        backgroundColor: CLASS_COLORS[CLASS_NAMES.indexOf(issue.class_name)] || '#999',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Class Distribution */}
          <h4 className="text-xs font-bold text-gfw-text mb-2 uppercase tracking-wider">
            Full Distribution
          </h4>
          <div className="space-y-1.5">
            {stats.distribution &&
              Object.entries(stats.distribution)
                .filter(([_, val]) => val.percentage > 0.1)
                .sort((a, b) => b[1].percentage - a[1].percentage)
                .map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: CLASS_COLORS[parseInt(key)] || '#999' }}
                    />
                    <span className="flex-1 text-gfw-muted truncate">{val.name}</span>
                    <span className="text-gfw-text font-medium">{val.percentage.toFixed(1)}%</span>
                  </div>
                ))}
          </div>

          {/* Grad-CAM Explanation section */}
          {showExplanation && (
            <div className="mt-4 pt-3 border-t border-gfw-border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-gfw-text uppercase tracking-wider">
                  Grad-CAM Heatmap
                </h4>
                <button
                  onClick={onToggleExplanation}
                  className="text-[10px] text-purple-600 hover:underline"
                >
                  Hide
                </button>
              </div>
              {/* Grad-CAM legend */}
              <div className="flex items-center gap-2 text-[10px] text-gfw-muted">
                <span className="inline-block w-8 h-2 rounded" style={{
                  background: 'linear-gradient(to right, #0000ff, #00ff00, #ffff00, #ff0000)'
                }} />
                <span>Low → Moderate → High attention</span>
              </div>
            </div>
          )}

          {explainError && (
            <p className="text-[10px] text-red-500 mt-2">{explainError}</p>
          )}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-gfw-border flex flex-col gap-2 shrink-0">
          {/* Explain AI button */}
          <button
            id="btn-explain-ai"
            onClick={showExplanation ? onToggleExplanation : handleExplain}
            disabled={explaining}
            className={`w-full py-2 text-xs font-bold rounded tracking-wider uppercase transition-all flex items-center justify-center gap-1.5
              ${showExplanation
                ? 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
              } disabled:opacity-50`}
          >
            {explaining ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                Generating…
              </>
            ) : showExplanation ? (
              <>🔵 Explanation Active</>
            ) : (
              <>🧠 Explain AI</>
            )}
          </button>

          {/* Gmail Alert — only for HIGH / CRITICAL */}
          {(stats.severity === 'HIGH' || stats.severity === 'CRITICAL') && (
            <button
              id="btn-send-alert"
              onClick={handleSendAlert}
              disabled={sendingEmail}
              className={`w-full py-2 text-xs font-bold rounded tracking-wider uppercase transition-all flex items-center justify-center gap-1.5
                ${emailSent
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-red-600 hover:bg-red-700 text-white'
                } disabled:opacity-50`}
            >
              {sendingEmail ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  Sending…
                </>
              ) : emailSent ? (
                <>✅ Email Alert Sent</>
              ) : (
                <>📧 Send Gmail Alert</>
              )}
            </button>
          )}

          <div className="flex gap-2">
            <button
              id="btn-download-report"
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 py-2 bg-forest-500 hover:bg-forest-600 text-white text-xs font-bold rounded tracking-wider uppercase transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {downloading ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Report
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gfw-border text-xs font-semibold text-gfw-muted rounded hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5 text-center">
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-gfw-muted uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
