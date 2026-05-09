import React, { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Typewriter hook — reveals text character by character.
 */
function useTypewriter(text, speed = 8) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    if (!text) return;
    idx.current = 0;
    setDisplayed('');
    setDone(false);

    const timer = setInterval(() => {
      idx.current += 1;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) {
        setDone(true);
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return { displayed, done, skip: () => { setDisplayed(text); setDone(true); } };
}

/**
 * Simple markdown-like renderer for the insight text.
 */
function renderInsight(text) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    // Heading
    if (line.startsWith('### ')) {
      return <h4 key={i} className="text-[13px] font-bold text-paradise-dark mt-4 mb-1 font-display">{line.replace('### ', '')}</h4>;
    }
    if (line.startsWith('## ')) {
      return <h3 key={i} className="text-[14px] font-bold text-paradise-dark mb-2 font-display">{line.replace('## ', '')}</h3>;
    }
    // Horizontal rule
    if (line.trim() === '---') {
      return <hr key={i} className="my-3 border-paradise-border" />;
    }
    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      return <p key={i} className="text-[11px] text-paradise-text ml-2 mb-0.5">
        <span className="text-paradise-green font-bold">{line.match(/^\d+/)[0]}.</span>
        {line.replace(/^\d+\.\s*/, ' ')}
      </p>;
    }
    // Bullet
    if (line.startsWith('- ')) {
      const content = line.slice(2);
      // Bold text handling
      const parts = content.split(/\*\*(.*?)\*\*/g);
      return (
        <p key={i} className="text-[11px] text-paradise-text ml-2 mb-1.5 leading-relaxed">
          <span className="text-paradise-green mr-1">▸</span>
          {parts.map((part, j) => j % 2 === 1
            ? <strong key={j} className="text-paradise-dark">{part}</strong>
            : <span key={j}>{part}</span>
          )}
        </p>
      );
    }
    // Italic
    if (line.startsWith('*') && line.endsWith('*')) {
      return <p key={i} className="text-[10px] text-paradise-muted italic mt-1">{line.replace(/^\*|\*$/g, '')}</p>;
    }
    // Normal paragraph with bold support
    if (line.trim()) {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <p key={i} className="text-[11px] text-paradise-text mb-1 leading-relaxed">
          {parts.map((part, j) => j % 2 === 1
            ? <strong key={j} className="text-paradise-dark">{part}</strong>
            : <span key={j}>{part}</span>
          )}
        </p>
      );
    }
    return null;
  });
}

export default function InsightsModal({ isOpen, onClose, regionName, stats }) {
  const [loading, setLoading] = useState(false);
  const [insightText, setInsightText] = useState('');
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const { displayed, done, skip } = useTypewriter(insightText, 6);

  // Auto-scroll as typewriter reveals
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayed]);

  // Fetch insights when opened
  useEffect(() => {
    if (!isOpen || !stats) return;
    setLoading(true);
    setError(null);
    setInsightText('');

    fetch(`${API_BASE}/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region_name: regionName || 'Unknown Region',
        current_stats: stats,
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`Server ${r.status}`);
        return r.json();
      })
      .then(data => {
        setInsightText(data.insight_text || 'No insights available.');
      })
      .catch(err => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [isOpen, stats, regionName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-paradise-border overflow-hidden animate-pop-in">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-paradise-border bg-gradient-to-r from-emerald-50/50 to-purple-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🧠</span>
              <div>
                <h2 className="text-[14px] font-bold text-paradise-dark font-display">
                  AI Insight & Recommendations
                </h2>
                <p className="text-[10px] text-paradise-muted mt-0.5">
                  {regionName || 'Region Analysis'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-paradise-sand/60 flex items-center justify-center text-paradise-muted transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 130px)' }}>
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-paradise-green/30 border-t-paradise-green rounded-full animate-spin" />
              <p className="text-[11px] text-paradise-muted animate-pulse">
                Analyzing trends & generating insights…
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <p className="text-[12px] text-red-600 font-medium">Failed to generate insights</p>
              <p className="text-[10px] text-red-400 mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && displayed && (
            <>
              {renderInsight(displayed)}
              {!done && (
                <button
                  onClick={skip}
                  className="mt-2 text-[10px] text-paradise-muted hover:text-paradise-green transition-colors"
                >
                  Skip animation →
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-paradise-border bg-paradise-sand/20 flex items-center justify-between">
          <p className="text-[9px] text-paradise-muted">
            ✨ Generated from satellite classification data
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-paradise-green text-white text-[11px] font-semibold hover:bg-paradise-green/90 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
