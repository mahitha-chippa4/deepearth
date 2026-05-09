import React, { useState, useEffect, useRef } from 'react';
import { CLASS_NAMES, CLASS_COLORS, SEVERITY_CONFIG } from '../utils/constants';
import InsightsModal from './InsightsModal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/* ── Animated Value Hook ── */
function useAnimatedValue(target, duration = 800) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const t = parseFloat(target) || 0;
    let start = null;
    const animate = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(+(eased * t).toFixed(1));
      if (p < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration]);
  return val;
}

export default function AnalysisResults({
  results, onClose, onExplain, showExplanation, onToggleExplanation,
}) {
  const { stats, region, timestamp, bbox } = results;
  const severity = SEVERITY_CONFIG[stats?.severity] || SEVERITY_CONFIG.CLEAR;
  const [explaining, setExplaining] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [explainError, setExplainError] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [gradcamOpacity, setGradcamOpacity] = useState(0.7);
  const [showInsights, setShowInsights] = useState(false);

  const animForestLoss = useAnimatedValue(stats?.forest_loss_pct);
  const animUrbanGrowth = useAnimatedValue(stats?.urban_growth_pct);
  const animAlertScore = useAnimatedValue(stats?.alert_score);

  const pulseClass = stats?.severity === 'CRITICAL' ? 'alert-pulse-critical'
    : stats?.severity === 'HIGH' ? 'alert-pulse-high' : '';

  /* ── Send Gmail Alert ── */
  const handleSendAlert = async () => {
    if (sendingEmail || emailSent) return;
    setSendingEmail(true);
    try {
      const lat = results.lat ?? ((bbox.north + bbox.south) / 2);
      const lon = results.lon ?? ((bbox.east + bbox.west) / 2);
      const resp = await fetch(`${API_BASE}/send-alert-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region_name: region, latitude: lat, longitude: lon,
          alert_level: stats.severity, risk_score: stats.alert_score,
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
    } finally { setSendingEmail(false); }
  };

  /* ── Explain AI ── */
  const handleExplain = async () => {
    if (explaining) return;
    setExplaining(true); setExplainError(null);
    try {
      // lat/lon may be nested under .coordinates (polygon-analysis response)
      const lat = results.lat
        ?? results.coordinates?.lat
        ?? ((bbox.north + bbox.south) / 2);
      const lon = results.lon
        ?? results.coordinates?.lon
        ?? ((bbox.east + bbox.west) / 2);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000); // 90s timeout
      const resp = await fetch(`${API_BASE}/explain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, bbox_size: 0.3, region_name: region }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail?.detail || `Server ${resp.status}`);
      }
      const data = await resp.json();
      if (data.explanation_map) {
        onExplain?.(`data:image/png;base64,${data.explanation_map}`);
      } else throw new Error('No heatmap returned');
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Timed out — GEE is slow, try again.' : err.message;
      console.error('Explain AI failed:', err);
      setExplainError(msg);
    } finally { setExplaining(false); }
  };

  /* ── Download Report ── */
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const lat = results.lat ?? ((bbox.north + bbox.south) / 2);
      const lon = results.lon ?? ((bbox.east + bbox.west) / 2);
      const resp = await fetch(`${API_BASE}/generate-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region_name: region, lat, lon, stats, timestamp,
          prediction_image: results.prediction_image || null,
          explanation_map: results.explanation_map || null,
        }),
      });
      if (!resp.ok) throw new Error(`Server ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = region.split(',')[0].trim().toLowerCase().replace(/\s+/g, '_');
      a.href = url;
      a.download = `deepearth_report_${safeName}_${new Date().getFullYear()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Report generation failed. Please try again.');
    } finally { setDownloading(false); }
  };

  return (
    <>
    <div className="absolute top-4 left-4 w-[310px] max-h-[calc(100vh-120px)] z-20 animate-slide-in">
      <div className="organic-card overflow-hidden flex flex-col max-h-full">
        {/* Top accent */}
        <div className="h-1 bg-gradient-to-r from-paradise-green via-paradise-sage to-paradise-mint shrink-0" />

        {/* Header */}
        <div className="p-4 border-b border-paradise-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[14px] font-bold text-paradise-dark font-display">{region || 'Analysis Results'}</h3>
            <p className="text-[10px] text-paradise-muted mt-0.5">{new Date(timestamp).toLocaleString()}</p>
          </div>
          <button id="results-close" onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-paradise-sand/60 flex items-center justify-center text-paradise-muted transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Latest Satellite Data Timestamp */}
        {(() => {
          const imgDate = results.data_source?.imagery_date;
          if (!imgDate || imgDate === 'Data unavailable') {
            return (
              <div className="px-4 py-1.5 border-b border-paradise-border bg-amber-50/50 shrink-0">
                <p className="text-[10px] text-amber-600 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Imagery date unavailable
                </p>
              </div>
            );
          }
          const d = new Date(imgDate + 'T00:00:00');
          const formatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          const daysAgo = Math.floor((Date.now() - d.getTime()) / 86400000);
          const relative = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
          return (
            <div className="px-4 py-1.5 border-b border-paradise-border bg-emerald-50/40 shrink-0"
              title="Satellite imagery updates every 5–15 days depending on cloud cover and orbital revisit cycle."
            >
              <p className="text-[10px] text-emerald-700 flex items-center gap-1.5 font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Latest Data: {formatted}
                <span className="text-emerald-500/70 font-normal ml-auto">({relative})</span>
              </p>
            </div>
          );
        })()}

        {/* Severity Badge */}
        <div className={`mx-4 mt-3 py-3 px-4 rounded-2xl flex items-center gap-3 ${pulseClass}`}
          style={{ backgroundColor: severity.bg, border: `1px solid ${severity.color}15` }}>
          <span className="text-xl">{severity.icon}</span>
          <div className="flex-1">
            <div className="text-[11px] font-bold tracking-[0.1em] uppercase" style={{ color: severity.color }}>
              {stats.severity} alert
            </div>
            <div className="text-[10px] text-paradise-muted">score: <strong>{animAlertScore}</strong></div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="px-4 py-3 grid grid-cols-2 gap-2.5">
          <MetricCard label="forest loss" value={`${animForestLoss}%`} color="#D64545" />
          <MetricCard label="urban growth" value={`${animUrbanGrowth}%`} color="#9B59B6" />
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          <h4 className="text-[11px] font-bold text-paradise-dark mb-2 uppercase tracking-[0.1em] font-display">
            detected issues
          </h4>
          <div className="space-y-2.5 mb-4">
            {(() => {
              const maxPct = Math.max(...(stats.top_issues?.map(i => i.percentage) ?? [1]), 1);
              return stats.top_issues?.map((issue, i) => {
                const barWidth = `${((issue.percentage / maxPct) * 100).toFixed(2)}%`;
                const barColor = CLASS_COLORS[CLASS_NAMES.indexOf(issue.class_name)] || '#999';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, backgroundColor: barColor, display: 'inline-block' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="text-[11px] text-paradise-text truncate">{issue.class_name}</span>
                        <span className="text-[11px] font-semibold text-paradise-dark" style={{ marginLeft: 8 }}>{issue.percentage.toFixed(1)}%</span>
                      </div>
                      <div style={{ width: '100%', height: 6, backgroundColor: '#e8e4dc', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: barWidth,
                          backgroundColor: barColor,
                          borderRadius: 999,
                          transition: 'width 0.7s ease-out',
                        }} />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          <h4 className="text-[11px] font-bold text-paradise-dark mb-2 uppercase tracking-[0.1em] font-display">
            full distribution
          </h4>
          <div className="space-y-1.5">
            {stats.distribution &&
              Object.entries(stats.distribution)
                .filter(([_, val]) => val.percentage > 0.1)
                .sort((a, b) => b[1].percentage - a[1].percentage)
                .map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 text-[10.5px]">
                    <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ backgroundColor: CLASS_COLORS[parseInt(key)] || '#999' }} />
                    <span className="flex-1 text-paradise-muted truncate">{val.name}</span>
                    <span className="text-paradise-dark font-medium">{val.percentage.toFixed(1)}%</span>
                  </div>
                ))}
          </div>

          {/* Grad-CAM Explanation */}
          {showExplanation && (
            <div className="mt-4 pt-3 border-t border-paradise-border animate-fade-up">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-bold text-paradise-dark uppercase tracking-[0.1em]">🧠 grad-cam heatmap</h4>
                <button onClick={onToggleExplanation}
                  className="text-[10px] text-purple-600 hover:text-purple-800 hover:underline font-medium transition-colors">hide</button>
              </div>
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-paradise-muted font-medium">heatmap opacity</span>
                  <span className="text-[10px] text-paradise-green font-bold">{Math.round(gradcamOpacity * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value={gradcamOpacity}
                  onChange={(e) => setGradcamOpacity(parseFloat(e.target.value))}
                  className="nature-slider" />
              </div>
              <div className="bg-paradise-bg border border-paradise-border rounded-2xl p-3 mb-2">
                <p className="text-[10px] text-paradise-text leading-relaxed">
                  <strong className="text-paradise-green">why did the ai predict changes?</strong><br/>
                  The heatmap highlights regions where the model detected the strongest signals. Warmer colors indicate higher neural network attention.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-paradise-muted">
                <span className="inline-block w-10 h-2.5 rounded-full" style={{ background: 'linear-gradient(to right, #0000ff, #00ff00, #ffff00, #ff0000)' }} />
                <span>low → moderate → high attention</span>
              </div>
            </div>
          )}
          {explainError && <p className="text-[10px] text-red-500 mt-2 bg-red-50 rounded-xl px-2 py-1">{explainError}</p>}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-paradise-border flex flex-col gap-2 shrink-0 bg-paradise-cream/30">
          <button id="btn-explain-ai" onClick={showExplanation ? onToggleExplanation : handleExplain}
            disabled={explaining}
            className={`w-full py-2.5 text-[11px] font-bold rounded-full tracking-[0.08em] uppercase transition-all duration-300 flex items-center justify-center gap-1.5
              ${showExplanation
                ? 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                : 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-organic hover:shadow-organic-md hover:-translate-y-0.5'
              } disabled:opacity-50`}>
            {explaining ? <>⏳ generating…</> : showExplanation ? <>🔵 explanation active</> : <>🧠 explain ai</>}
          </button>

          <button id="btn-insights" onClick={() => setShowInsights(true)}
            className="w-full py-2.5 text-[11px] font-bold rounded-full tracking-[0.08em] uppercase transition-all duration-300 flex items-center justify-center gap-1.5
              bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-organic hover:shadow-organic-md hover:-translate-y-0.5">
            🔮 show prediction & reforms
          </button>

          {(stats.severity === 'HIGH' || stats.severity === 'CRITICAL') && (
            <button id="btn-send-alert" onClick={handleSendAlert} disabled={sendingEmail}
              className={`w-full py-2.5 text-[11px] font-bold rounded-full tracking-[0.08em] uppercase transition-all duration-300 flex items-center justify-center gap-1.5
                ${emailSent
                  ? 'bg-paradise-mint/30 text-paradise-green border border-paradise-green/20'
                  : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-organic hover:shadow-organic-md hover:-translate-y-0.5'
                } disabled:opacity-50`}>
              {sendingEmail ? <>⏳ sending…</> : emailSent ? <>✅ email alert sent</> : <>📧 send gmail alert</>}
            </button>
          )}

          <div className="flex gap-2">
            <button id="btn-download-report" onClick={handleDownload} disabled={downloading}
              className="flex-1 py-2.5 btn-capsule-primary text-[11px] font-bold rounded-full tracking-[0.08em] uppercase
                disabled:opacity-50 flex items-center justify-center gap-1.5 hover:-translate-y-0.5 transition-all">
              {downloading ? <>⏳ generating…</> : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  download report
                </>
              )}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 border border-paradise-border text-[11px] font-semibold text-paradise-muted rounded-full
                hover:bg-paradise-sand/40 hover:border-paradise-stone transition-all duration-200">close</button>
          </div>
        </div>
      </div>
    </div>
    <InsightsModal
      isOpen={showInsights}
      onClose={() => setShowInsights(false)}
      regionName={region}
      stats={stats}
    />
    </>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="bg-paradise-bg rounded-2xl p-3 text-center border border-paradise-border/50 transition-all duration-300 hover:shadow-organic">
      <div className="text-lg font-bold font-display" style={{ color }}>{value}</div>
      <div className="text-[9px] text-paradise-muted uppercase tracking-[0.1em] mt-0.5 font-medium">{label}</div>
    </div>
  );
}
