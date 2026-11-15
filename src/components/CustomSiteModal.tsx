import React, { useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { createCustomLunarSite } from '../data/lunarSites';
import { LunarSite } from '../types/lunar';

interface CustomSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSite: (site: LunarSite) => void;
}

export const CustomSiteModal: React.FC<CustomSiteModalProps> = ({ isOpen, onClose, onAddSite }) => {
  const [name, setName] = useState('Custom South Pole Target');
  const [latDeg, setLatDeg] = useState(-86.5);
  const [lonDeg, setLonDeg] = useState(18.0);
  const [elevationM, setElevationM] = useState(2100);
  const [slopeDeg, setSlopeDeg] = useState(6.5);
  const [slopeMissing, setSlopeMissing] = useState(false);
  const [reliefRoughnessDeg, setReliefRoughnessDeg] = useState(1.2);

  if (!isOpen) return null;

  // Stereographic south pole picker (78°S..90°S mapped onto 220x220 SVG)
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 92; // corresponds to 78°S

  const latLonToXY = (lat: number, lon: number) => {
    const colat = Math.min(12, Math.max(0, 90 + lat)); // 0 at pole, 12 at -78°
    const r = (colat / 12) * maxR;
    const rad = (lon * Math.PI) / 180;
    // 0° lon (Earth direction) is UP (-Y), 90°E is RIGHT (+X)
    return {
      x: cx + r * Math.sin(rad),
      y: cy - r * Math.cos(rad),
    };
  };

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * size - cx;
    const y = ((e.clientY - rect.top) / rect.height) * size - cy;
    const r = Math.min(maxR, Math.hypot(x, y));
    const colat = (r / maxR) * 12;
    const newLat = Number((-90 + colat).toFixed(2));
    const newLon = Number(((Math.atan2(x, -y) * 180) / Math.PI).toFixed(2));
    setLatDeg(newLat);
    setLonDeg(newLon);
  };

  const marker = latLonToXY(latDeg, lonDeg);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clampedLat = Math.max(-90, Math.min(90, latDeg));
    const clampedLon = Math.max(-180, Math.min(180, lonDeg));
    const newSite = createCustomLunarSite({
      name,
      latDeg: clampedLat,
      lonDeg: clampedLon,
      elevationM,
      slopeDeg: slopeMissing ? null : slopeDeg,
      reliefRoughnessDeg,
    });
    onAddSite(newSite);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-xl bg-[#131524] border border-[#272d47] rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#272d47]">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#c9e8ff]" />
            <h2 className="text-sm font-semibold text-white">Add Custom Lunar Coordinate</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 text-[#7392B5] hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            {/* Clickable South Pole Picker */}
            <div className="sm:col-span-5 flex flex-col items-center">
              <svg
                viewBox={`0 0 ${size} ${size}`}
                onClick={handleMapClick}
                className="w-48 h-48 bg-[#0c0c16] border border-[#272d47] rounded-full cursor-crosshair select-none"
              >
                {[3, 6, 9, 12].map((colat) => (
                  <circle
                    key={colat}
                    cx={cx}
                    cy={cy}
                    r={(colat / 12) * maxR}
                    fill="none"
                    stroke="#272d47"
                    strokeDasharray={colat === 12 ? undefined : '2 3'}
                  />
                ))}
                <line x1={cx} y1={10} x2={cx} y2={size - 10} stroke="#272d47" />
                <line x1={10} y1={cy} x2={size - 10} y2={cy} stroke="#272d47" />
                <text x={cx} y={16} textAnchor="middle" className="fill-[#c9e8ff] text-[8px] font-mono">
                  0° (Earth Dir)
                </text>
                <text x={size - 8} y={cy + 3} textAnchor="end" className="fill-[#7392B5] text-[8px] font-mono">
                  90°E
                </text>
                <text x={8} y={cy + 3} textAnchor="start" className="fill-[#7392B5] text-[8px] font-mono">
                  90°W
                </text>
                <text x={cx + 3} y={cy - 3} className="fill-[#7392B5] text-[8px] font-mono">
                  90°S
                </text>

                {latDeg <= -78 && (
                  <g>
                    <circle cx={marker.x} cy={marker.y} r={6} fill="#b9f0d7" fillOpacity="0.25" />
                    <circle cx={marker.x} cy={marker.y} r={3.5} fill="#b9f0d7" stroke="#0c0c16" strokeWidth="1" />
                  </g>
                )}
              </svg>
              <span className="text-[11px] text-[#7392B5] mt-1.5">Click South Pole grid (78°S–90°S)</span>
            </div>

            {/* Coordinate Inputs */}
            <div className="sm:col-span-7 space-y-3">
              <div>
                <label className="block text-xs text-slate-200 mb-1">Site Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 text-xs bg-[#0c0c16] border border-[#272d47] rounded text-slate-100 focus:outline-none focus:border-[#c9e8ff]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs text-slate-200 mb-1">Latitude (°)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={-90}
                    max={90}
                    value={latDeg}
                    onChange={(e) => setLatDeg(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0c0c16] border border-[#272d47] rounded text-slate-100 focus:outline-none focus:border-[#c9e8ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-200 mb-1">Longitude (°)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={-180}
                    max={180}
                    value={lonDeg}
                    onChange={(e) => setLonDeg(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0c0c16] border border-[#272d47] rounded text-slate-100 focus:outline-none focus:border-[#c9e8ff]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs text-slate-200 mb-1">Elevation (m)</label>
                  <input
                    type="number"
                    step="50"
                    min={-8000}
                    max={8000}
                    value={elevationM}
                    onChange={(e) => setElevationM(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0c0c16] border border-[#272d47] rounded text-slate-100 focus:outline-none focus:border-[#c9e8ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-200 mb-1">Local Slope (°)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={25}
                    disabled={slopeMissing}
                    value={slopeDeg}
                    onChange={(e) => setSlopeDeg(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0c0c16] border border-[#272d47] rounded text-slate-100 focus:outline-none focus:border-[#c9e8ff] disabled:opacity-40"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-[11px] text-[#7392B5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={slopeMissing}
                  onChange={(e) => setSlopeMissing(e.target.checked)}
                  className="accent-[#b8baff]"
                />
                <span>Mark slope as MISSING (tests Insufficient Data constraint policy)</span>
              </label>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-200">Surrounding Rim Relief (Synthetic)</span>
                  <span className="font-mono text-[#b8baff]">{reliefRoughnessDeg.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={6.0}
                  step={0.2}
                  value={reliefRoughnessDeg}
                  onChange={(e) => setReliefRoughnessDeg(Number(e.target.value))}
                  className="lunar-slider w-full"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#272d47]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-[#7392B5] bg-[#0c0c16] border border-[#272d47] rounded hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold text-[#0c0c16] bg-[#c9e8ff] rounded hover:brightness-110 transition-all"
            >
              Evaluate Coordinate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
