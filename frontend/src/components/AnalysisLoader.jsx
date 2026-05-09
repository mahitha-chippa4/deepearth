import React, { useState, useEffect, useRef } from 'react';

/**
 * AnalysisLoader — Floating glassmorphism overlay shown on the map
 * while the AI analysis pipeline is running.
 *
 * Features:
 *  • Spinner animation
 *  • Rotating step-based progress messages (every 2s)
 *  • Smooth fake progress bar (10% → 90%, jumps to 100% on complete)
 *  • Timeout warning after 15s
 *  • "AI Processing Live" badge
 *  • Fade-in / fade-out transitions
 */

const PROGRESS_STEPS = [
  { message: 'Fetching satellite imagery…', icon: '🛰️' },
  { message: 'Computing NDVI, NDWI indices…', icon: '📊' },
  { message: 'Running AI segmentation model…', icon: '🧠' },
  { message: 'Generating predictions…', icon: '⚡' },
  { message: 'Finalizing results…', icon: '✨' },
];

export default function AnalysisLoader({ regionName, isVisible, isComplete }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(10);
  const [showTimeout, setShowTimeout] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const startTimeRef = useRef(Date.now());
  const progressRef = useRef(null);

  // Reset on new analysis
  useEffect(() => {
    if (isVisible && !isComplete) {
      setStepIdx(0);
      setProgress(10);
      setShowTimeout(false);
      setFadeOut(false);
      startTimeRef.current = Date.now();
    }
  }, [isVisible, isComplete]);

  // Rotate messages every 2s
  useEffect(() => {
    if (!isVisible || isComplete) return;
    const interval = setInterval(() => {
      setStepIdx(prev => (prev + 1) % PROGRESS_STEPS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isVisible, isComplete]);

  // Fake progress bar: 10% → 90% over ~20s (ease-out curve)
  useEffect(() => {
    if (!isVisible || isComplete) return;
    progressRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        // Slower as we approach 90%
        const increment = Math.max(0.3, (90 - prev) * 0.04);
        return Math.min(90, prev + increment);
      });
    }, 300);
    return () => clearInterval(progressRef.current);
  }, [isVisible, isComplete]);

  // Jump to 100% on complete, then fade out
  useEffect(() => {
    if (isComplete && isVisible) {
      setProgress(100);
      setStepIdx(PROGRESS_STEPS.length - 1);
      // Fade out after a brief "100%" display
      const timer = setTimeout(() => setFadeOut(true), 600);
      return () => clearTimeout(timer);
    }
  }, [isComplete, isVisible]);

  // Timeout warning after 15s
  useEffect(() => {
    if (!isVisible || isComplete) return;
    const timer = setTimeout(() => setShowTimeout(true), 15000);
    return () => clearTimeout(timer);
  }, [isVisible, isComplete]);

  if (!isVisible) return null;

  const step = PROGRESS_STEPS[stepIdx];

  return (
    <div
      className={`absolute inset-0 z-30 flex items-center justify-center pointer-events-none
        ${fadeOut ? 'animate-loader-fade-out' : 'animate-loader-fade-in'}`}
    >
      {/* Soft backdrop */}
      <div className="absolute inset-0 bg-black/8 backdrop-blur-[2px]" />

      {/* Glassmorphism card */}
      <div className="relative pointer-events-auto w-[340px] overflow-hidden rounded-[24px]
                      bg-white/85 backdrop-blur-xl border border-paradise-border/60
                      shadow-[0_12px_48px_rgba(45,90,61,0.12)]">

        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-paradise-green via-paradise-sage to-paradise-mint" />

        <div className="p-6">
          {/* AI Processing Live badge */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                            bg-paradise-green/8 border border-paradise-green/15">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-paradise-green opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-paradise-green" />
              </span>
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-paradise-green">
                AI Processing Live
              </span>
            </div>
          </div>

          {/* Spinner + main message */}
          <div className="flex flex-col items-center text-center mb-5">
            {/* Orbital spinner */}
            <div className="relative w-14 h-14 mb-4">
              {/* Outer ring */}
              <svg className="absolute inset-0 animate-spin-slow" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="25" stroke="#D4E4CB" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M28 3 A25 25 0 0 1 53 28" stroke="#4A7C59" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              {/* Inner icon */}
              <div className="absolute inset-0 flex items-center justify-center text-xl animate-pulse-slow">
                {step.icon}
              </div>
            </div>

            {/* Region name */}
            <h3 className="text-[15px] font-bold text-paradise-dark font-display mb-1">
              Analyzing {regionName || 'Region'}
            </h3>

            {/* Rotating step message */}
            <p key={stepIdx} className="text-[12px] text-paradise-muted font-medium animate-step-msg">
              {step.message}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] text-paradise-muted font-medium uppercase tracking-wider">
                Progress
              </span>
              <span className="text-[10px] font-bold text-paradise-green tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full h-2 bg-paradise-sand/60 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                style={{
                  width: `${progress}%`,
                  background: progress >= 100
                    ? '#4A7C59'
                    : 'linear-gradient(90deg, #8B9E7C, #4A7C59)',
                }}
              >
                {/* Shimmer effect */}
                {progress < 100 && (
                  <div className="absolute inset-0 animate-shimmer"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                      backgroundSize: '200% 100%',
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-1.5 mb-1">
            {PROGRESS_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-500
                  ${i <= stepIdx ? 'w-4 bg-paradise-green' : 'w-1.5 bg-paradise-sand'}`}
              />
            ))}
          </div>

          {/* Timeout warning */}
          {showTimeout && (
            <div className="mt-4 px-3 py-2.5 rounded-2xl bg-amber-50/80 border border-amber-200/50 animate-fade-up">
              <p className="text-[11px] text-amber-700 text-center font-medium leading-relaxed">
                ⏳ Still processing… this may take a few seconds for large regions
              </p>
            </div>
          )}

          {/* Completion state */}
          {progress >= 100 && (
            <div className="mt-3 flex items-center justify-center gap-2 animate-fade-up">
              <svg className="w-4 h-4 text-paradise-green" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[12px] font-bold text-paradise-green">Analysis complete!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
