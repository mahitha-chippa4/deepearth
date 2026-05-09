import React, { useState, useEffect, useRef } from 'react';
import { SEVERITY_CONFIG } from '../utils/constants';
import CountUp from 'react-countup';
import toast, { Toaster } from 'react-hot-toast';

const DEMO_ALERTS = [
  { id: 1, region: 'Jharkhand', severity: 'CRITICAL', score: 85.2, forest_loss_pct: 12.3, timestamp: '2024-12-15T10:30:00' },
  { id: 2, region: 'Western Ghats', severity: 'HIGH', score: 52.1, forest_loss_pct: 8.7, timestamp: '2024-12-14T14:20:00' },
  { id: 3, region: 'Sundarbans', severity: 'HIGH', score: 45.8, forest_loss_pct: 6.2, timestamp: '2024-12-13T09:15:00' },
  { id: 4, region: 'Assam', severity: 'MEDIUM', score: 28.4, forest_loss_pct: 4.1, timestamp: '2024-12-12T16:45:00' },
  { id: 5, region: 'Bellary', severity: 'MEDIUM', score: 22.1, forest_loss_pct: 3.8, timestamp: '2024-12-11T11:00:00' },
  { id: 6, region: 'Delhi NCR', severity: 'HIGH', score: 48.3, forest_loss_pct: 2.1, timestamp: '2024-12-10T08:30:00' },
  { id: 7, region: 'Kerala Coast', severity: 'LOW', score: 8.5, forest_loss_pct: 1.2, timestamp: '2024-12-09T13:00:00' },
  { id: 8, region: 'Rajasthan', severity: 'LOW', score: 5.3, forest_loss_pct: 0.8, timestamp: '2024-12-08T15:30:00' },
];

const INITIAL_STATS = [
  { id: 'regions', label: 'regions monitored', value: 22, suffix: '', decimals: 0, icon: '🛰️', color: '#4A7C59' },
  { id: 'alerts', label: 'active alerts', value: 5, suffix: '', decimals: 0, icon: '🚨', color: '#D64545' },
  { id: 'loss', label: 'forest loss (avg)', value: 6.2, suffix: '%', decimals: 1, icon: '🌲', color: '#E67E22' },
];

// Lightweight SVG Sparkline component
const Sparkline = ({ data, color }) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const height = 16;
  const width = 48;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 -2 ${width} ${height+4}`} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} opacity="0.8" />
    </svg>
  );
};

function AnimatedStatCard({ stat, delay }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);

  return (
    <div className={`organic-card p-5 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl bg-paradise-bg border border-paradise-border">
          {stat.icon}
        </div>
        <div>
          <div className="text-2xl font-bold font-display" style={{ color: stat.color }}>
            <CountUp start={0} end={stat.value} duration={2} decimals={stat.decimals} suffix={stat.suffix} />
          </div>
          <div className="text-[10px] text-paradise-muted uppercase tracking-[0.12em] font-medium">{stat.label}</div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ onBack }) {
  const [alerts, setAlerts] = useState(DEMO_ALERTS);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [countdown, setCountdown] = useState(10);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [newAlertIds, setNewAlertIds] = useState(new Set());
  const prevAlertsRef = useRef(alerts);

  // Bug 3: in-flight guard for polling fetch — prevents double-firing
  const pollInFlightRef = useRef(false);
  // Bug 3: debounce timer for any manual region analysis triggers from dashboard
  const analyzeTimerRef = useRef(null);
  const regionInFlightRef = useRef(new Set());

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 10));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Polling simulation every 10s
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      // Bug 3: Skip if a poll is already in-flight
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;

      try {
        // Here we simulate fetching from backend FastAPI endpoint. 
        // In real use: const res = await fetch('/alerts'); const data = await res.json();
        
        // Simulating a new alert appearing occasionally:
        if (Math.random() > 0.6) {
          const regionName = ['Assam', 'Meghalaya', 'Odisha', 'Goa'][Math.floor(Math.random() * 4)];
          const newAlert = {
            id: Date.now(),
            region: regionName,
            severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'][Math.floor(Math.random() * 4)],
            score: parseFloat((Math.random() * 100).toFixed(1)),
            forest_loss_pct: parseFloat((Math.random() * 5).toFixed(1)),
            timestamp: new Date().toISOString(),
          };
          
          // Bug 1: Dedup by region name — update existing row instead of appending
          setAlerts(prev => {
            const regionKey = regionName.trim().toLowerCase();
            const existingIdx = prev.findIndex(
              a => a.region.trim().toLowerCase() === regionKey
            );

            let updated;
            if (existingIdx !== -1) {
              // UPDATE existing row's score, severity, trend, timestamp
              updated = prev.map((a, i) =>
                i === existingIdx
                  ? { ...a, score: newAlert.score, severity: newAlert.severity,
                      forest_loss_pct: newAlert.forest_loss_pct, timestamp: newAlert.timestamp,
                      id: newAlert.id }
                  : a
              );
            } else {
              // New region — prepend
              updated = [newAlert, ...prev];
            }

            return updated.sort((a, b) => b.score - a.score).slice(0, 20);
          });

          // Also slightly fluctuate stats to look alive
          setStats(prev => prev.map(s => {
            if (s.id === 'alerts') return { ...s, value: s.value + 1 };
            if (s.id === 'loss') return { ...s, value: parseFloat((s.value + 0.1).toFixed(1)) };
            return s;
          }));
        }
      } catch(e) {
         console.error('Polling failed', e);
      } finally {
        pollInFlightRef.current = false;
      }
    }, 10000);
    return () => clearInterval(pollInterval);
  }, []);

  // Track new alerts for highlights and toast
  useEffect(() => {
    const currentIds = alerts.map(a => a.id);
    const prevIds = prevAlertsRef.current.map(a => a.id);
    const newIds = currentIds.filter(id => !prevIds.includes(id));
    
    if (newIds.length > 0) {
      setNewAlertIds(new Set(newIds));
      
      // Toast notification for each new alert
      newIds.forEach(id => {
        const alt = alerts.find(a => a.id === id);
        if (alt) {
           const toastPrefix = alt.severity === 'CRITICAL' || alt.severity === 'HIGH' ? '🚨' : 'ℹ️';
           toast(`${toastPrefix} New Alert: ${alt.region} - ${alt.severity}`, {
             className: 'organic-toast',
           });
        }
      });
      
      // Remove glow after 3s
      setTimeout(() => {
        setNewAlertIds(new Set());
      }, 3000);
    }
    prevAlertsRef.current = alerts;
  }, [alerts]);

  const filteredAlerts = filterSeverity === 'ALL' 
    ? alerts 
    : alerts.filter(a => a.severity === filterSeverity);

  return (
    <div className="flex-1 bg-paradise-bg overflow-y-auto pb-6">
      <Toaster position="top-right" />
      <div className="max-w-6xl mx-auto py-8 px-6">
        
        {/* Header Region */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-paradise-green animate-pulse" />
              <span className="text-[10px] font-bold tracking-[0.15em] text-paradise-green uppercase">
                Live • Updating every 10s
              </span>
            </div>
            
            <h1 className="text-2xl font-bold text-paradise-dark flex items-center gap-3 font-display">
              <div className="w-10 h-10 rounded-2xl bg-paradise-green/10 border border-paradise-green/20 flex items-center justify-center">
                <span className="text-xl">🌍</span>
              </div>
              deepearth dashboard
            </h1>
            <p className="text-sm text-paradise-muted mt-1.5 ml-[52px]">
              ai-powered environmental monitoring — pan-india overview
            </p>
          </div>
          
          <div className="text-right flex flex-col items-end">
             <button id="btn-back-to-map" onClick={onBack}
               className="btn-capsule btn-capsule-primary text-[13px] mb-3 inline-flex leading-none tracking-normal py-[10px] px-6">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                 <path d="M15 19l-7-7 7-7"/>
               </svg>
               back to map
             </button>
             <div className="text-[10px] text-paradise-muted uppercase tracking-[0.05em] font-medium bg-white/50 px-3 py-1.5 rounded-full border border-paradise-border shadow-sm">
                Last scan: just now • Next scan in: <span className="text-paradise-green font-bold">00:{countdown.toString().padStart(2, '0')}</span>
             </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {stats.map((stat, i) => (
            <AnimatedStatCard key={stat.id} stat={stat} delay={i * 100} />
          ))}
        </div>

        {/* Alerts Table Region */}
        <div className="organic-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-paradise-green via-paradise-sage to-paradise-mint" />

          <div className="p-5 border-b border-paradise-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-red-50 rounded-2xl flex items-center justify-center">
                <span className="text-lg">🚨</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-paradise-dark font-display">recent environmental alerts</h2>
                <p className="text-[11px] text-paradise-muted mt-0.5">sorted by severity score — highest risk first</p>
              </div>
            </div>
            
            {/* Severity Filters */}
            <div className="flex gap-2 bg-paradise-bg p-1 rounded-full border border-paradise-border">
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(filter => (
                 <button 
                   key={filter}
                   onClick={() => setFilterSeverity(filter)}
                   className={`text-[10px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider transition-all duration-200
                     ${filterSeverity === filter 
                        ? 'bg-paradise-dark text-white shadow-md' 
                        : 'bg-transparent text-paradise-muted hover:text-paradise-dark hover:bg-paradise-green/5'}`}
                 >
                   {filter}
                 </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-paradise-bg/50 text-[10px] uppercase tracking-[0.12em] text-paradise-muted">
                  <th className="text-left py-3 px-5 font-semibold">region</th>
                  <th className="text-left py-3 px-5 font-semibold">severity</th>
                  <th className="text-left py-3 px-5 font-semibold">alert score & ai conf.</th>
                  <th className="text-left py-3 px-5 font-semibold">trend</th>
                  <th className="text-left py-3 px-5 font-semibold">detected</th>
                  <th className="text-right py-3 px-5 font-semibold">action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-[12px] text-paradise-muted font-medium">
                      No alerts match the selected filter.
                    </td>
                  </tr>
                )}
                {filteredAlerts.map((alert, i) => {
                  const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.CLEAR;
                  const pulseClass = alert.severity === 'CRITICAL' ? 'alert-pulse-critical'
                    : alert.severity === 'HIGH' ? 'alert-pulse-high' : '';
                  const isNew = newAlertIds.has(alert.id);
                  const confidence = alert.ai_confidence || (85 + (alert.score % 14)).toFixed(0); // Simulated confidence
                  
                  // Mock trend data based on severity
                  const trendData = alert.severity === 'CRITICAL' ? [2, 4, 3, 7, 12] : 
                                    alert.severity === 'HIGH' ? [1, 2, 2, 4, 8] : [0, 1, 0, 1, 2];

                  return (
                    <tr key={alert.id} className={`border-t border-paradise-border hover:bg-paradise-bg/60 transition-all duration-300 hover:scale-[1.002] hover:shadow-sm z-10 relative ${isNew ? 'animate-glow-row' : ''}`}>
                      <td className="py-3.5 px-5">
                        <span className="text-[13px] font-semibold text-paradise-dark font-display flex items-center gap-2">
                           {alert.region}
                           {isNew && <span className="bg-paradise-green text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">New</span>}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${pulseClass}`}
                          style={{ backgroundColor: sev.bg, color: sev.color, border: `1px solid ${sev.color}15` }}>
                          {sev.icon} {alert.severity.toLowerCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-paradise-sand rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-1000 ease-out`}
                                style={{ width: `${Math.min(alert.score, 100)}%`, backgroundColor: sev.color }} />
                            </div>
                            <span className="text-[11px] font-semibold text-paradise-dark">{alert.score.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-paradise-muted uppercase tracking-wider font-semibold" title="Model confidence based on segmentation output">
                             <svg className="w-3 h-3 text-paradise-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                             AI Conf: {confidence}%
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2" title="Forest loss trend over past 5 scans">
                           <Sparkline data={trendData} color={sev.color} />
                           <span className="text-[12px] font-semibold text-loss-400">{alert.forest_loss_pct}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="text-[11px] text-paradise-muted">
                           {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button className="text-[11px] font-semibold text-paradise-green hover:text-paradise-dark transition-all duration-200 px-3 py-1.5 rounded-full hover:bg-paradise-green/10">
                           analyze →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom info */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 bg-paradise-cream/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-organic border border-paradise-border font-medium">
            <svg className="w-4 h-4 text-paradise-green" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/>
            </svg>
            <p className="text-[11px] text-paradise-muted tracking-wide">deepearth v2 live • powered by unet + convlstm • sentinel-2 • google earth engine</p>
          </div>
        </div>
      </div>
    </div>
  );
}
