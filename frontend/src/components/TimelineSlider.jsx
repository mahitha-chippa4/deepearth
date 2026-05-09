import React, { useState } from 'react';

const TIMELINE_STEPS = [
  { value: '2019', label: '2019', type: 'historical' },
  { value: '2021', label: '2021', type: 'historical' },
  { value: '2023', label: '2023', type: 'historical' },
  { value: '2024', label: '2024', type: 'historical' },
  { value: 'latest', label: 'Latest', type: 'live' },
];

export default function TimelineSlider({ onYearChange, activeYear, loading, imageryDate }) {
  const [idx, setIdx] = useState(TIMELINE_STEPS.length - 1);

  const currentStep = TIMELINE_STEPS[idx];
  const isLive = currentStep.type === 'live';

  const handleChange = (e) => {
    const newIdx = parseInt(e.target.value, 10);
    setIdx(newIdx);
    const step = TIMELINE_STEPS[newIdx];
    onYearChange?.(step.value);
  };

  const handleDotClick = (i) => {
    setIdx(i);
    onYearChange?.(TIMELINE_STEPS[i].value);
  };

  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <div
        className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg border border-paradise-border px-5 py-3"
        style={{ minWidth: 380 }}
      >
        {/* View Mode Label */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-paradise-muted">
              {isLive ? '🟢 live view' : '📁 historical view'}
            </span>
            {loading && (
              <span className="text-[10px] text-amber-600 animate-pulse font-medium">
                loading…
              </span>
            )}
          </div>

          {/* Year / latest label */}
          <div className="text-right">
            <span className="text-[13px] font-bold text-paradise-dark font-display">
              {isLive ? `Latest (${new Date().getFullYear()})` : currentStep.label}
            </span>
            {imageryDate && isLive && (
              <p className="text-[9px] text-emerald-600 mt-0.5">
                Imagery: {new Date(imageryDate + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>

        {/* Slider Track */}
        <div className="relative px-1">
          {/* Background track */}
          <div className="absolute top-1/2 left-3 right-3 h-[3px] -translate-y-1/2 rounded-full bg-paradise-border" />
          {/* Active fill */}
          <div
            className="absolute top-1/2 left-3 h-[3px] -translate-y-1/2 rounded-full transition-all duration-300"
            style={{
              width: `${(idx / (TIMELINE_STEPS.length - 1)) * (100 - 4)}%`,
              background: isLive
                ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                : 'linear-gradient(90deg, #a7f3d0, #10b981)',
            }}
          />

          {/* Range input */}
          <input
            type="range"
            min={0}
            max={TIMELINE_STEPS.length - 1}
            step={1}
            value={idx}
            onChange={handleChange}
            disabled={loading}
            className="timeline-range w-full relative z-10"
          />
        </div>

        {/* Step dots and labels */}
        <div className="flex justify-between mt-1 px-1">
          {TIMELINE_STEPS.map((step, i) => (
            <button
              key={step.value}
              onClick={() => handleDotClick(i)}
              disabled={loading}
              className="flex flex-col items-center gap-0.5 group"
              title={step.type === 'live' ? 'Most recent satellite data' : `Historical ${step.label}`}
            >
              <span
                className={`
                  w-2.5 h-2.5 rounded-full border-2 transition-all duration-200
                  ${i === idx
                    ? (isLive
                      ? 'bg-emerald-500 border-emerald-500 scale-125 shadow-sm shadow-emerald-200'
                      : 'bg-paradise-green border-paradise-green scale-125 shadow-sm')
                    : i <= idx
                      ? 'bg-paradise-sage border-paradise-sage'
                      : 'bg-white border-paradise-border group-hover:border-paradise-sage'
                  }
                `}
              />
              <span
                className={`text-[9px] transition-colors ${i === idx ? 'text-paradise-dark font-bold' : 'text-paradise-muted'
                  }`}
              >
                {step.type === 'live' ? '● Latest' : step.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
