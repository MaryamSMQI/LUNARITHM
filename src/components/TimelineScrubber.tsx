import React from 'react';
import { FastForward, Pause, Play, RotateCcw } from 'lucide-react';
import { WindowMetrics } from '../types/lunar';

interface TimelineScrubberProps {
  metrics: WindowMetrics;
  offsetHours: number;
  onChangeOffsetHours: (hours: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playSpeedHoursPerSec: number;
  onChangeSpeed: (speed: number) => void;
  baseTimestampMs: number;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  metrics,
  offsetHours,
  onChangeOffsetHours,
  isPlaying,
  onTogglePlay,
  playSpeedHoursPerSec,
  onChangeSpeed,
  baseTimestampMs,
}) => {
  const W = 820;
  const H = 148;
  const PAD_L = 44;
  const PAD_R = 16;
  const PAD_T = 14;
  const PAD_B = 26;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const samples = metrics.samples;
  const maxH = metrics.durationHours;

  // Dynamic elevation bounds
  const allElevs = samples.flatMap((s) => [s.sunElevationAboveTerrainDeg, s.earthElevationAboveTerrainDeg]);
  const maxEl = Math.max(12, Math.ceil(Math.max(...allElevs) / 5) * 5);
  const minEl = Math.min(-10, Math.floor(Math.min(...allElevs) / 5) * 5);

  const xOf = (h: number) => PAD_L + (h / maxH) * plotW;
  const yOf = (el: number) => {
    const norm = (el - minEl) / Math.max(1, maxEl - minEl);
    return PAD_T + plotH * (1 - Math.max(0, Math.min(1, norm)));
  };

  const sunLine = samples
    .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${xOf(s.offsetHours).toFixed(1)},${yOf(s.sunElevationAboveTerrainDeg).toFixed(1)}`)
    .join(' ');
  const earthLine = samples
    .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${xOf(s.offsetHours).toFixed(1)},${yOf(s.earthElevationAboveTerrainDeg).toFixed(1)}`)
    .join(' ');

  const currentX = xOf(offsetHours);
  const currentSample =
    samples.reduce((best, s) =>
      Math.abs(s.offsetHours - offsetHours) < Math.abs(best.offsetHours - offsetHours) ? s : best
    , samples[0]);

  const currentUtc = new Date(baseTimestampMs + offsetHours * 3600 * 1000);
  const dayTicks = [0, 7, 14, 21, 29].filter((d) => d * 24 <= maxH);

  return (
    <div className="lunar-panel rounded-lg p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Lunar Day Illumination & Direct-to-Earth Windows
          </h3>
          <p className="text-xs text-[#7392B5] font-mono">
            T+{offsetHours.toFixed(1)}h ({(offsetHours / 24).toFixed(1)}d) · {currentUtc.toISOString().slice(0, 16).replace('T', ' ')} UTC
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[#c9e8ff] text-[#0c0c16] hover:brightness-110 transition-all whitespace-nowrap shrink-0"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause' : 'Animate Lunar Day'}
          </button>

          <div className="flex items-center gap-1 p-0.5 bg-[#0c0c16] border border-[#272d47] rounded">
            {[4, 12, 24].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onChangeSpeed(spd)}
                className={`px-2 py-1 text-[11px] font-mono rounded whitespace-nowrap shrink-0 transition-colors ${
                  playSpeedHoursPerSec === spd
                    ? 'bg-[#1a1d30] text-[#c9e8ff]'
                    : 'text-[#7392B5] hover:text-white'
                }`}
              >
                {spd}h/s
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onChangeOffsetHours(0)}
            title="Reset to landing epoch"
            className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-200 bg-[#0c0c16] border border-[#272d47] rounded hover:border-[#7392B5] transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            T+0
          </button>

          <button
            type="button"
            onClick={() => {
              const peak = samples.reduce((a, b) =>
                b.sunElevationAboveTerrainDeg > a.sunElevationAboveTerrainDeg ? b : a
              );
              onChangeOffsetHours(peak.offsetHours);
            }}
            className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#F5B83D] bg-[#0c0c16] border border-[#272d47] rounded hover:border-[#F5B83D]/50 transition-colors whitespace-nowrap shrink-0"
          >
            <FastForward className="w-3.5 h-3.5" />
            Peak Sun
          </button>
        </div>
      </div>

      {/* Availability Gantt strips */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="w-24 text-slate-400 shrink-0">SOLAR POWER</span>
          <div className="flex-1 h-2.5 bg-[#07090E] rounded-sm overflow-hidden flex border border-slate-800/80">
            {samples.map((s, i) => (
              <div
                key={i}
                style={{ width: `${100 / samples.length}%` }}
                className={s.sunVisible ? 'bg-amber-400/85' : 'bg-slate-900'}
              />
            ))}
          </div>
          <span className="w-14 text-right text-amber-300 shrink-0">
            {metrics.sunlightPercent.toFixed(1)}%
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="w-24 text-slate-400 shrink-0">EARTH DTE</span>
          <div className="flex-1 h-2.5 bg-[#07090E] rounded-sm overflow-hidden flex border border-slate-800/80">
            {samples.map((s, i) => (
              <div
                key={i}
                style={{ width: `${100 / samples.length}%` }}
                className={s.earthVisible ? 'bg-cyan-400/85' : 'bg-slate-900'}
              />
            ))}
          </div>
          <span className="w-14 text-right text-cyan-300 shrink-0">
            {metrics.earthVisibilityPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Elevation curves + clickable scrub area */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          aria-label="Mission Timeline Sun and Earth Elevation Curves"
          className="w-full h-auto block cursor-ew-resize select-none"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * W;
            const clamped = Math.max(PAD_L, Math.min(W - PAD_R, relX));
            const h = ((clamped - PAD_L) / plotW) * maxH;
            onChangeOffsetHours(Math.round(h));
          }}
        >
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="#07090E" stroke="#1E293B" />

          {/* Shaded "below terrain horizon" occlusion band (< 0°) */}
          <rect
            x={PAD_L}
            y={yOf(0)}
            width={plotW}
            height={Math.max(0, PAD_T + plotH - yOf(0))}
            fill="#1e293b"
            fillOpacity="0.32"
          />
          <text
            x={W - PAD_R - 6}
            y={Math.min(PAD_T + plotH - 4, yOf(0) + 12)}
            textAnchor="end"
            className="fill-[#7392B5] text-[8.5px] font-mono"
          >
            Below terrain horizon (&lt; 0°)
          </text>

          {/* Zero terrain clearance line */}
          <line
            x1={PAD_L}
            y1={yOf(0)}
            x2={W - PAD_R}
            y2={yOf(0)}
            stroke="#475569"
            strokeDasharray="4 4"
          />
          <text x={PAD_L - 6} y={yOf(0) + 3} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
            0°
          </text>
          <text x={PAD_L - 6} y={PAD_T + 10} textAnchor="end" className="fill-slate-500 text-[10px] font-mono">
            +{maxEl}°
          </text>
          <text x={PAD_L - 6} y={PAD_T + plotH - 2} textAnchor="end" className="fill-slate-500 text-[10px] font-mono">
            {minEl}°
          </text>
          <text
            x={10}
            y={PAD_T + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 10 ${PAD_T + plotH / 2})`}
            className="fill-[#7392B5] text-[8.5px] font-mono"
          >
            Elev (deg)
          </text>

          {/* Day ticks */}
          {dayTicks.map((day) => {
            const x = xOf(day * 24);
            return (
              <g key={day}>
                <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#141B29" />
                <text x={x} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[10px] font-mono">
                  Day {day}
                </text>
              </g>
            );
          })}

          <path d={earthLine} fill="none" stroke="#06B6D4" strokeWidth="1.6" />
          <path d={sunLine} fill="none" stroke="#F59E0B" strokeWidth="1.8" />

          {/* Playhead */}
          <line x1={currentX} y1={PAD_T} x2={currentX} y2={PAD_T + plotH} stroke="#F8FAFC" strokeWidth="1.4" />
          {currentSample && (
            <>
              <circle
                cx={currentX}
                cy={yOf(currentSample.sunElevationAboveTerrainDeg)}
                r={4}
                fill="#FBBF24"
                stroke="#07090E"
                strokeWidth="1.5"
              />
              <circle
                cx={currentX}
                cy={yOf(currentSample.earthElevationAboveTerrainDeg)}
                r={4}
                fill="#22D3EE"
                stroke="#07090E"
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>

        {/* Precision range scrubber */}
        <input
          type="range"
          min={0}
          max={maxH}
          step={1}
          value={offsetHours}
          onChange={(e) => onChangeOffsetHours(Number(e.target.value))}
          aria-label="Scrub mission timeline hours"
          className="lunar-slider w-full mt-1"
        />
      </div>
    </div>
  );
};
