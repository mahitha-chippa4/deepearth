import React from 'react';

/**
 * Floating Draw Toolbar — floats over the map (top-right area).
 * Buttons delegate to draw control methods exposed via drawRef.
 */
export default function DrawToolbar({
  drawRef,          // ref to MapboxDraw instance
  isDrawing,        // bool — polygon draw mode is active
  hasPolygon,       // bool — at least one polygon drawn
  isAnalyzing,      // bool — network request in flight
  onAnalyze,        // () => void — trigger polygon analysis
  onClear,          // () => void — delete all features + reset
  onToggleDraw,     // () => void — activate / deactivate polygon mode
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 60,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Draw / Stop Drawing */}
      <button
        id="btn-draw-polygon"
        onClick={onToggleDraw}
        title={isDrawing ? 'Cancel drawing' : 'Draw a custom area to analyse'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 24,
          border: isDrawing ? '1.5px solid #2e7d32' : '1.5px solid rgba(255,255,255,0.35)',
          background: isDrawing
            ? 'linear-gradient(135deg,#2e7d32,#43a047)'
            : 'rgba(255,255,255,0.92)',
          color: isDrawing ? '#fff' : '#2e7d32',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.07em',
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.2s ease',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Polygon icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polygon points="12 2 22 19 2 19" />
        </svg>
        {isDrawing ? 'Cancel Drawing' : 'Draw Area'}
      </button>

      {/* Analyze Polygon — only visible when a polygon exists */}
      {hasPolygon && !isDrawing && (
        <button
          id="btn-analyze-polygon"
          onClick={onAnalyze}
          disabled={isAnalyzing}
          title="Run AI analysis on drawn region"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 24,
            border: 'none',
            background: isAnalyzing
              ? 'linear-gradient(135deg,#78909c,#90a4ae)'
              : 'linear-gradient(135deg,#1565c0,#1976d2)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.07em',
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 12px rgba(25,118,210,0.4)',
            transition: 'all 0.2s ease',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            opacity: isAnalyzing ? 0.75 : 1,
          }}
        >
          {isAnalyzing ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Analysing…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Analyse Region
            </>
          )}
        </button>
      )}

      {/* Clear — only when polygon drawn */}
      {hasPolygon && (
        <button
          id="btn-clear-polygon"
          onClick={onClear}
          title="Clear drawn polygon"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 24,
            border: '1.5px solid rgba(211,47,47,0.4)',
            background: 'rgba(255,255,255,0.92)',
            color: '#c62828',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.07em',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s ease',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
          </svg>
          Clear Selection
        </button>
      )}

      {/* Hint pill when drawing */}
      {isDrawing && (
        <div style={{
          padding: '6px 12px',
          borderRadius: 24,
          background: 'rgba(0,0,0,0.72)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textAlign: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          Click to add points · Double-click to finish
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
