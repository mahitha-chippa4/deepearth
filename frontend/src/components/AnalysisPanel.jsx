import React, { useState } from 'react';

const PREDICTION_LEGEND = [
  { cls: 0, label: 'No Change', color: '#B8AFA3' },
  { cls: 1, label: 'Temporary Veg Loss', color: '#E8A838' },
  { cls: 2, label: 'Permanent Deforestation', color: '#D64545' },
  { cls: 3, label: 'Forest Degradation', color: '#A63D3D' },
  { cls: 4, label: 'Urban Expansion', color: '#9B59B6' },
  { cls: 5, label: 'Industrial Zone', color: '#7D3C98' },
  { cls: 6, label: 'Mining Activity', color: '#8B7D6B' },
  { cls: 7, label: 'Sand Mining', color: '#D4A017' },
  { cls: 8, label: 'Water Body Shrinkage', color: '#2E86C1' },
  { cls: 9, label: 'Burn Scars', color: '#E67E22' },
  { cls: 10, label: 'Agricultural Expansion', color: '#4A7C59' },
];

export default function AnalysisPanel({
  onToggleLayer,
  layers,
  showPredictionLayer = false,
  hasPrediction = false,
}) {
  const [activeTab, setActiveTab] = useState('analysis');

  return (
    <div className="absolute top-4 left-4 w-[272px] z-20 animate-slide-in">
      <div className="organic-card overflow-hidden">
        {/* ── Tabs ── */}
        <div className="flex border-b border-paradise-border">
          {[
            {
              id: 'legend', label: 'legend', icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                </svg>
              )
            },
            {
              id: 'analysis', label: 'analysis', icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 3v18h18" /><polyline points="18,17 13,7 8,14 3,9" />
                </svg>
              )
            },
          ].map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-[11px] font-semibold tracking-[0.1em] uppercase flex items-center justify-center gap-1.5
                transition-all duration-300
                ${activeTab === tab.id
                  ? 'text-paradise-green border-b-2 border-paradise-green bg-paradise-bg/40'
                  : 'text-paradise-muted hover:text-paradise-dark hover:bg-paradise-bg/20'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="p-4">
          {activeTab === 'analysis' ? (
            <AnalysisContent onToggleLayer={onToggleLayer} layers={layers} />
          ) : (
            <LegendContent
              layers={layers} onToggleLayer={onToggleLayer}
              showPredictionLayer={showPredictionLayer}
              hasPrediction={hasPrediction}
            />
          )}
        </div>
      </div>

      {/* ── Badge ── */}
      <div className="mt-2 bg-paradise-cream/90 backdrop-blur-sm rounded-full px-3.5 py-1.5
                     text-[10px] text-paradise-muted font-medium inline-flex items-center gap-2
                     shadow-organic border border-paradise-border">
        <span className="w-1.5 h-1.5 rounded-full bg-paradise-green animate-pulse-glow" />
        deepearth interactive map
      </div>
    </div>
  );
}

function AnalysisContent({ onToggleLayer, layers }) {
  return (
    <div className="animate-fade-up">
      <h3 className="text-[13px] font-bold text-paradise-dark tracking-wide mb-4 font-display">
        Analyze & Track Forest Change
      </h3>

      <div className="flex gap-3 mb-5">
        {[
          {
            id: 'click', label: 'Click Layer\non Map', icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M15 15l-2 5L9 9l11 4-5 2z" /><path d="M14.828 14.828L21 21" />
              </svg>
            ), active: true
          },
          {
            id: 'draw', label: 'Draw or Upload\nShape', icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
              </svg>
            ), active: false
          },
        ].map(btn => (
          <button key={btn.id} className="flex flex-col items-center gap-2 group flex-1">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300
              ${btn.active
                ? 'bg-paradise-green text-white shadow-organic'
                : 'border-2 border-paradise-border text-paradise-muted group-hover:border-paradise-green group-hover:text-paradise-green'
              }`}
            >
              {btn.icon}
            </div>
            <span className="text-[9px] font-semibold text-paradise-muted tracking-wider text-center uppercase leading-tight whitespace-pre-line">
              {btn.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4">
        <label className="text-[11px] text-paradise-muted mb-1.5 block font-medium">analysis on shape or:</label>
        <div className="relative">
          <select
            id="select-boundaries"
            className="w-full appearance-none border border-paradise-border rounded-full py-2.5 px-4 pr-10
                      text-[13px] text-paradise-dark bg-white focus:outline-none
                      focus:ring-2 focus:ring-paradise-green/20 focus:border-paradise-green
                      cursor-pointer transition-all duration-200"
            defaultValue="political"
          >
            <option value="political">political boundaries</option>
            <option value="custom">custom shape</option>
            <option value="protected">protected areas</option>
          </select>
          <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-paradise-muted pointer-events-none" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      <p className="text-[10.5px] text-paradise-muted leading-relaxed">
        Analysis is also available by default for most data layers under the{' '}
        <a href="#" className="text-paradise-green font-semibold hover:underline">land use</a> and{' '}
        <a href="#" className="text-paradise-green font-semibold hover:underline">biodiversity</a> tabs.
      </p>
    </div>
  );
}

function LegendContent({ layers, onToggleLayer, showPredictionLayer, hasPrediction }) {
  const legendItems = [
    { key: 'forestCover', label: 'Tree Cover (2000)', color: '#4A7C59', desc: 'Hansen/UMD tree cover baseline' },
    { key: 'forestLoss', label: 'Tree Cover Loss', color: '#D64545', desc: 'Year of gross tree cover loss' },
  ];

  return (
    <div className="animate-fade-up">
      <h3 className="text-[13px] font-bold text-paradise-dark tracking-wide mb-3 font-display">
        Map Layers
      </h3>
      <div className="space-y-3">
        {legendItems.map(item => (
          <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={layers[item.key]}
              onChange={() => onToggleLayer(item.key)}
              className="mt-0.5 w-4 h-4 rounded accent-paradise-green"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-lg flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[12px] font-semibold text-paradise-dark">{item.label}</span>
              </div>
              <p className="text-[10px] text-paradise-muted mt-0.5">{item.desc}</p>
            </div>
          </label>
        ))}

        {hasPrediction && (
          <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-paradise-border">
            <input type="checkbox" checked={showPredictionLayer}
              onChange={() => onToggleLayer('prediction')}
              className="mt-0.5 w-4 h-4 rounded accent-purple-600" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-lg flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #D64545, #9B59B6, #2E86C1, #4A7C59)' }} />
                <span className="text-[12px] font-semibold text-paradise-dark">AI Prediction Layer</span>
              </div>
              <p className="text-[10px] text-paradise-muted mt-0.5">AI model environmental classification</p>
            </div>
          </label>
        )}
      </div>

      {hasPrediction && (
        <div className="mt-4 pt-3 border-t border-paradise-border">
          <h4 className="text-[10px] font-bold text-paradise-dark tracking-[0.1em] uppercase mb-2">
            AI Classification Legend
          </h4>
          <div className="grid grid-cols-1 gap-1">
            {PREDICTION_LEGEND.map(item => (
              <div key={item.cls} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-paradise-text">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasPrediction && (
        <div className="mt-4 pt-3 border-t border-paradise-border">
          <p className="text-[10px] text-paradise-muted">
            Click a region on the map and press <strong className="text-paradise-green">ANALYZE</strong> to generate
            an AI prediction overlay showing environmental change classes.
          </p>
        </div>
      )}
    </div>
  );
}
