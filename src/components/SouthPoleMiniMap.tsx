import React from 'react';
import { InstantEphemeris, LunarSite } from '../types/lunar';

interface SouthPoleMiniMapProps {
  sites: LunarSite[];
  selectedSiteId: string;
  onSelectSite: (siteId: string) => void;
  instant: InstantEphemeris;
}

const MAJOR_CRATERS = [
  { name: 'Shackleton', lat: -89.9, lon: 0, rKm: 10.5 },
  { name: 'Shoemaker', lat: -88.1, lon: 44.9, rKm: 25.5 },
  { name: 'Faustini', lat: -87.3, lon: 77.0, rKm: 19.5 },
  { name: 'Haworth', lat: -87.4, lon: -5.2, rKm: 25.7 },
  { name: 'de Gerlache', lat: -88.5, lon: -87.1, rKm: 16.2 },
  { name: 'Nobile', lat: -85.2, lon: 53.5, rKm: 36.0 },
  { name: 'Cabeus', lat: -84.9, lon: -35.5, rKm: 49.0 },
];

export const SouthPoleMiniMap: React.FC<SouthPoleMiniMapProps> = ({
  sites,
  selectedSiteId,
  onSelectSite,
  instant,
}) => {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 104; // 10 degrees colatitude (80°S to 90°S)

  const projectPolar = (latDeg: number, lonDeg: number) => {
    const colat = Math.min(10.5, Math.max(0, 90 + latDeg));
    const r = (colat / 10) * maxR;
    const rad = (lonDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.sin(rad),
      y: cy - r * Math.cos(rad),
    };
  };

  // Scale km to SVG px: 1 deg latitude on Moon ~ 30.32 km; 10 deg = 303.2 km -> maxR px
  const kmToPx = maxR / 303.2;

  const polarSites = sites.filter((s) => s.latDeg <= -74);
  const nonPolarSites = sites.filter((s) => s.latDeg > -74);

  // Subsolar vector arrow across South Pole
  const subSunRad = (instant.subsolarLonDeg * Math.PI) / 180;
  const sunArrowX = cx + 114 * Math.sin(subSunRad);
  const sunArrowY = cy - 114 * Math.cos(subSunRad);

  return (
    <div className="bg-[#131524] border border-[#272d47] rounded-lg p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-white">South Pole Map (80°S–90°S)</h3>
          <p className="text-[11px] text-[#7392B5]">Shaded craters mark PSR ice traps</p>
        </div>
        <span className="font-mono text-[10px] text-[#c9e8ff]">0° Lon ↑ Earth</span>
      </div>

      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[250px] mx-auto block select-none">
        <circle cx={cx} cy={cy} r={maxR} fill="#0c0c16" stroke="#272d47" />
        {/* 85°S & 88°S rings */}
        {[2, 5].map((colat) => (
          <circle
            key={colat}
            cx={cx}
            cy={cy}
            r={(colat / 10) * maxR}
            fill="none"
            stroke="#161F2E"
            strokeDasharray="2 3"
          />
        ))}
        <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke="#161F2E" />
        <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke="#161F2E" />

        {/* Major South Pole craters */}
        {MAJOR_CRATERS.map((c) => {
          const p = projectPolar(c.lat, c.lon);
          const rPx = Math.max(4, c.rKm * kmToPx);
          return (
            <g key={c.name}>
              <circle
                cx={p.x}
                cy={p.y}
                r={rPx}
                fill="#0F172A"
                fillOpacity="0.85"
                stroke="#334155"
                strokeWidth="0.8"
              />
              <text
                x={p.x}
                y={p.y + rPx + 7}
                textAnchor="middle"
                className="fill-slate-500 text-[7.5px] font-mono"
              >
                {c.name}
              </text>
            </g>
          );
        })}

        {/* Sun illumination direction marker */}
        <line
          x1={sunArrowX}
          y1={sunArrowY}
          x2={cx + 88 * Math.sin(subSunRad)}
          y2={cy - 88 * Math.cos(subSunRad)}
          stroke="#F59E0B"
          strokeWidth="2"
        />
        <circle cx={sunArrowX} cy={sunArrowY} r={4} fill="#FBBF24" />

        {/* Landing sites */}
        {polarSites.map((s) => {
          const p = projectPolar(s.latDeg, s.lonDeg);
          const isSelected = s.id === selectedSiteId;
          return (
            <g
              key={s.id}
              onClick={() => onSelectSite(s.id)}
              className="cursor-pointer"
            >
              {isSelected && <circle cx={p.x} cy={p.y} r={8} fill="#06B6D4" fillOpacity="0.25" />}
              <circle
                cx={p.x}
                cy={p.y}
                r={isSelected ? 4.5 : 3}
                fill={isSelected ? '#22D3EE' : s.isCustom ? '#10B981' : '#F59E0B'}
                stroke="#07090E"
                strokeWidth="1"
              />
              <title>{s.name}</title>
            </g>
          );
        })}

        <text x={cx} y={14} textAnchor="middle" className="fill-cyan-400 text-[8.5px] font-mono">
          0° (Earth)
        </text>
        <text x={size - 10} y={cy + 3} textAnchor="end" className="fill-slate-500 text-[8.5px] font-mono">
          90°E
        </text>
        <text x={10} y={cy + 3} textAnchor="start" className="fill-slate-500 text-[8.5px] font-mono">
          90°W
        </text>
      </svg>

      {nonPolarSites.length > 0 && (
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5 items-center text-[11px]">
          <span className="text-slate-500">Mid-Lat / Equator:</span>
          {nonPolarSites.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSite(s.id)}
              className={`px-2 py-0.5 rounded border font-mono text-[10px] transition-colors ${
                s.id === selectedSiteId
                  ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                  : 'bg-[#07090E] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.name.split('—')[0].trim()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
