import React, { useMemo, useState } from 'react';
import { InstantEphemeris, LunarSite, WindowMetrics } from '../types/lunar';

interface HorizonSkyPlotProps {
  site: LunarSite;
  instant: InstantEphemeris;
  metrics: WindowMetrics;
}

export const HorizonSkyPlot: React.FC<HorizonSkyPlotProps> = ({ site, instant, metrics }) => {
  const [mode, setMode] = useState<'horizon' | 'polar'>('horizon');
  const [hoverInfo, setHoverInfo] = useState<{
    az: number;
    mask: number;
    x: number;
    y: number;
  } | null>(null);

  // Determine vertical scale dynamically so equatorial sites (Sun/Earth up to 90°)
  // and polar sites (-8° to +22°) both render crisply
  const maxElevScale = useMemo(() => {
    const maxSample = Math.max(
      18,
      instant.sun.geometricElevationDeg + 6,
      instant.earth.geometricElevationDeg + 6,
      ...site.horizonMaskDeg.map((m) => m + 4)
    );
    if (maxSample > 45) return 90;
    if (maxSample > 25) return 45;
    return 24;
  }, [site, instant]);

  const minElevScale = -8;

  // Horizon SVG coordinate helpers
  const W = 760;
  const H = 300;
  const PAD_L = 46;
  const PAD_R = 20;
  const PAD_T = 22;
  const PAD_B = 34;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const azToX = (az: number) => PAD_L + (((az % 360) + 360) % 360) * (plotW / 360);
  const elToY = (el: number) => {
    const clamped = Math.max(minElevScale, Math.min(maxElevScale, el));
    const norm = (clamped - minElevScale) / (maxElevScale - minElevScale);
    return PAD_T + plotH * (1 - norm);
  };

  // Terrain polygon path
  const terrainPath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 72; i++) {
      const idx = i % 72;
      const az = i * 5;
      const el = Math.max(instant.sun.horizonDipDeg, site.horizonMaskDeg[idx]);
      pts.push(`${azToX(az).toFixed(1)},${elToY(el).toFixed(1)}`);
    }
    pts.push(`${azToX(360).toFixed(1)},${(PAD_T + plotH).toFixed(1)}`);
    pts.push(`${azToX(0).toFixed(1)},${(PAD_T + plotH).toFixed(1)}`);
    return `M ${pts.join(' L ')} Z`;
  }, [site.horizonMaskDeg, instant.sun.horizonDipDeg, maxElevScale]);

  const terrainStrokePath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 72; i++) {
      const idx = i % 72;
      const az = i * 5;
      const el = Math.max(instant.sun.horizonDipDeg, site.horizonMaskDeg[idx]);
      pts.push(`${azToX(az).toFixed(1)},${elToY(el).toFixed(1)}`);
    }
    return `M ${pts.join(' L ')}`;
  }, [site.horizonMaskDeg, instant.sun.horizonDipDeg, maxElevScale]);

  // Split polyline segments whenever azimuth wraps past 0/360
  const buildWrappedPaths = (points: { az: number; el: number }[]): string[] => {
    const paths: string[] = [];
    let current: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i > 0 && Math.abs(p.az - points[i - 1].az) > 150) {
        if (current.length > 1) paths.push(`M ${current.join(' L ')}`);
        current = [];
      }
      current.push(`${azToX(p.az).toFixed(1)},${elToY(p.el).toFixed(1)}`);
    }
    if (current.length > 1) paths.push(`M ${current.join(' L ')}`);
    return paths;
  };

  const sunTrackPaths = useMemo(() => {
    const pts = metrics.samples.map((s) => {
      const mask = site.horizonMaskDeg[Math.floor((((s.sunAzimuthDeg % 360) + 360) % 360) / 5) % 72];
      const effHor = Math.max(instant.sun.horizonDipDeg, mask);
      return { az: s.sunAzimuthDeg, el: s.sunElevationAboveTerrainDeg + effHor };
    });
    return buildWrappedPaths(pts);
  }, [metrics.samples, site.horizonMaskDeg, instant.sun.horizonDipDeg, maxElevScale]);

  const earthTrackPaths = useMemo(() => {
    const pts = metrics.samples.map((s) => {
      const mask = site.horizonMaskDeg[Math.floor((((s.earthAzimuthDeg % 360) + 360) % 360) / 5) % 72];
      const effHor = Math.max(instant.earth.horizonDipDeg, mask);
      return { az: s.earthAzimuthDeg, el: s.earthElevationAboveTerrainDeg + effHor };
    });
    return buildWrappedPaths(pts);
  }, [metrics.samples, site.horizonMaskDeg, instant.earth.horizonDipDeg, maxElevScale]);

  const yTicks = maxElevScale === 90 ? [0, 30, 60, 90] : maxElevScale === 45 ? [0, 15, 30, 45] : [-5, 0, 5, 10, 15, 20];
  const azLabels = [
    { az: 0, label: '0° N' },
    { az: 90, label: '90° E' },
    { az: 180, label: '180° S' },
    { az: 270, label: '270° W' },
    { az: 360, label: '360° N' },
  ];

  // Polar view helpers
  const polarR = 118;
  const polarCx = 200;
  const polarCy = 148;
  const elevToRadius = (el: number) => {
    const clamped = Math.max(-5, Math.min(90, el));
    return polarR * (1 - (clamped + 5) / 95);
  };

  const polarTerrainPath = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i < 72; i++) {
      const azRad = ((i * 5 - 90) * Math.PI) / 180;
      const el = Math.max(instant.sun.horizonDipDeg, site.horizonMaskDeg[i]);
      const r = elevToRadius(el);
      pts.push(`${(polarCx + r * Math.cos(azRad)).toFixed(1)},${(polarCy + r * Math.sin(azRad)).toFixed(1)}`);
    }
    return `M ${pts.join(' L ')} Z`;
  }, [site.horizonMaskDeg, instant.sun.horizonDipDeg]);

  const toPolarXY = (azDeg: number, elDeg: number) => {
    const azRad = ((azDeg - 90) * Math.PI) / 180;
    const r = elevToRadius(elDeg);
    return {
      x: polarCx + r * Math.cos(azRad),
      y: polarCy + r * Math.sin(azRad),
    };
  };

  return (
    <div className="lunar-panel rounded-lg p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Local Sky-Dome & Airless Horizon Profile
          </h3>
          <p className="text-xs text-[#7392B5]">
            Horizon dip: {instant.sun.horizonDipDeg.toFixed(2)}° (−√(2h/R), R=1737.4 km) · Terrain: {site.horizonDataClass}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0c0c16] border border-[#272d47] rounded-md">
          <button
            type="button"
            onClick={() => setMode('horizon')}
            className={`lunar-btn px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
              mode === 'horizon' ? 'bg-[#1a1d30] text-[#c9e8ff]' : 'text-[#7392B5] hover:text-white'
            }`}
          >
            Azimuth Horizon
          </button>
          <button
            type="button"
            onClick={() => setMode('polar')}
            className={`lunar-btn px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
              mode === 'polar' ? 'bg-[#1a1d30] text-[#c9e8ff]' : 'text-[#7392B5] hover:text-white'
            }`}
          >
            Polar Sky Dome
          </button>
        </div>
      </div>

      {mode === 'horizon' ? (
        <div className="relative w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            aria-label="Local Horizon Azimuth vs Elevation Profile"
            className="w-full h-auto block select-none cursor-crosshair"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * W;
              if (relX < PAD_L || relX > W - PAD_R) {
                setHoverInfo(null);
                return;
              }
              const az = ((relX - PAD_L) / plotW) * 360;
              const idx = Math.floor(az / 5) % 72;
              const mask = Math.max(instant.sun.horizonDipDeg, site.horizonMaskDeg[idx]);
              setHoverInfo({ az, mask, x: relX, y: elToY(mask) });
            }}
            onMouseLeave={() => setHoverInfo(null)}
          >
            <defs>
              <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#070A11" />
                <stop offset="100%" stopColor="#0E1726" />
              </linearGradient>
              <linearGradient id="regolithFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#262F3F" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#10151F" stopOpacity="1" />
              </linearGradient>
            </defs>

            <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="url(#skyGradient)" stroke="#1E293B" />

            {/* Y Axis Title */}
            <text
              x={12}
              y={PAD_T + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 12 ${PAD_T + plotH / 2})`}
              className="fill-[#7392B5] text-[9px] font-mono"
            >
              Elevation (deg)
            </text>

            {/* Horizontal elevation grid */}
            {yTicks.map((tick) => {
              const y = elToY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PAD_L}
                    y1={y}
                    x2={W - PAD_R}
                    y2={y}
                    stroke={tick === 0 ? '#334155' : '#161F2E'}
                    strokeDasharray={tick === 0 ? '4 4' : undefined}
                  />
                  <text
                    x={PAD_L - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {tick}°
                  </text>
                </g>
              );
            })}

            {/* Vertical azimuth grid */}
            {azLabels.map((item) => {
              const x = azToX(item.az);
              return (
                <g key={item.az}>
                  <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#161F2E" />
                  <text
                    x={x}
                    y={H - 10}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {item.label}
                  </text>
                </g>
              );
            })}

            {/* Geometric airless horizon dip reference */}
            <line
              x1={PAD_L}
              y1={elToY(instant.sun.horizonDipDeg)}
              x2={W - PAD_R}
              y2={elToY(instant.sun.horizonDipDeg)}
              stroke="#475569"
              strokeWidth="1"
              strokeDasharray="2 3"
            />

            {/* Sun 29.5-day trajectory */}
            {sunTrackPaths.map((d, i) => (
              <path
                key={`sun-t-${i}`}
                d={d}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.4"
                strokeOpacity="0.45"
              />
            ))}

            {/* Earth libration Lissajous trajectory */}
            {earthTrackPaths.map((d, i) => (
              <path
                key={`earth-t-${i}`}
                d={d}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="1.4"
                strokeOpacity="0.5"
              />
            ))}

            {/* Terrain Ridge Mask */}
            <path d={terrainPath} fill="url(#regolithFill)" />
            <path d={terrainStrokePath} fill="none" stroke="#64748B" strokeWidth="1.5" />

            {/* Terrain feature callouts */}
            {site.terrainFeatures.slice(0, 2).map((feat) => {
              const x = azToX(feat.azimuthDeg);
              const y = elToY(feat.peakElevationDeg) - 8;
              return (
                <text
                  key={feat.name}
                  x={Math.max(PAD_L + 45, Math.min(W - PAD_R - 45, x))}
                  y={Math.max(PAD_T + 14, y)}
                  textAnchor="middle"
                  className="fill-slate-400 text-[9px] font-mono"
                >
                  {feat.name}
                </text>
              );
            })}

            {/* Current Earth marker */}
            {(() => {
              const ex = azToX(instant.earth.azimuthDeg);
              const ey = elToY(instant.earth.geometricElevationDeg);
              return (
                <g>
                  <circle
                    cx={ex}
                    cy={ey}
                    r={8}
                    fill={instant.earth.isVisible ? '#06B6D4' : '#334155'}
                    fillOpacity="0.2"
                  />
                  <circle
                    cx={ex}
                    cy={ey}
                    r={5}
                    fill={instant.earth.isVisible ? '#06B6D4' : '#0F172A'}
                    stroke="#22D3EE"
                    strokeWidth="1.8"
                  />
                  <text
                    x={Math.min(W - 70, ex + 10)}
                    y={Math.max(PAD_T + 14, ey - 8)}
                    className="fill-cyan-300 text-[10px] font-mono font-medium"
                  >
                    EARTH {instant.earth.geometricElevationDeg.toFixed(1)}°
                  </text>
                </g>
              );
            })()}

            {/* Current Sun marker */}
            {(() => {
              const sx = azToX(instant.sun.azimuthDeg);
              const sy = elToY(instant.sun.geometricElevationDeg);
              return (
                <g>
                  <circle
                    cx={sx}
                    cy={sy}
                    r={10}
                    fill={instant.sun.isVisible ? '#F59E0B' : '#334155'}
                    fillOpacity="0.22"
                  />
                  <circle
                    cx={sx}
                    cy={sy}
                    r={6}
                    fill={instant.sun.isVisible ? '#FBBF24' : '#1E293B'}
                    stroke="#F59E0B"
                    strokeWidth="1.8"
                  />
                  <text
                    x={Math.min(W - 70, sx + 12)}
                    y={Math.max(PAD_T + 14, sy + 4)}
                    className="fill-amber-300 text-[10px] font-mono font-medium"
                  >
                    SUN {instant.sun.geometricElevationDeg.toFixed(1)}°
                  </text>
                </g>
              );
            })()}

            {/* Hover crosshair */}
            {hoverInfo && (
              <g>
                <line
                  x1={hoverInfo.x}
                  y1={PAD_T}
                  x2={hoverInfo.x}
                  y2={PAD_T + plotH}
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <circle cx={hoverInfo.x} cy={hoverInfo.y} r={3} fill="#E2E8F0" />
                <rect
                  x={Math.min(W - 155, hoverInfo.x + 8)}
                  y={PAD_T + 8}
                  width={142}
                  height={34}
                  rx={4}
                  fill="#07090E"
                  fillOpacity="0.92"
                  stroke="#334155"
                />
                <text
                  x={Math.min(W - 147, hoverInfo.x + 15)}
                  y={PAD_T + 22}
                  className="fill-slate-200 text-[10px] font-mono"
                >
                  AZ {hoverInfo.az.toFixed(0)}° · RIDGE {hoverInfo.mask.toFixed(1)}°
                </text>
                <text
                  x={Math.min(W - 147, hoverInfo.x + 15)}
                  y={PAD_T + 35}
                  className="fill-slate-400 text-[9px] font-mono"
                >
                  Clearance threshold
                </text>
              </g>
            )}
          </svg>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <svg viewBox="0 0 400 296" className="w-full max-w-[380px] mx-auto block">
            {/* Sky rings (0°, 30°, 60° elevation) */}
            {[0, 30, 60].map((el) => (
              <circle
                key={el}
                cx={polarCx}
                cy={polarCy}
                r={elevToRadius(el)}
                fill="none"
                stroke={el === 0 ? '#334155' : '#1E293B'}
                strokeDasharray={el === 0 ? undefined : '3 3'}
              />
            ))}
            {/* Compass axes */}
            <line x1={polarCx} y1={polarCy - polarR} x2={polarCx} y2={polarCy + polarR} stroke="#1E293B" />
            <line x1={polarCx - polarR} y1={polarCy} x2={polarCx + polarR} y2={polarCy} stroke="#1E293B" />
            <text x={polarCx} y={polarCy - polarR - 8} textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
              0° N (Earth Dir)
            </text>
            <text x={polarCx + polarR + 14} y={polarCy + 3} textAnchor="start" className="fill-slate-400 text-[10px] font-mono">
              E
            </text>
            <text x={polarCx} y={polarCy + polarR + 14} textAnchor="middle" className="fill-slate-400 text-[10px] font-mono">
              180° S
            </text>
            <text x={polarCx - polarR - 14} y={polarCy + 3} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
              W
            </text>

            {/* Terrain horizon outline */}
            <path d={polarTerrainPath} fill="#1E293B" fillOpacity="0.28" stroke="#64748B" strokeWidth="1.4" />

            {/* Sun & Earth current positions */}
            {(() => {
              const sPt = toPolarXY(instant.sun.azimuthDeg, instant.sun.geometricElevationDeg);
              const ePt = toPolarXY(instant.earth.azimuthDeg, instant.earth.geometricElevationDeg);
              return (
                <>
                  <circle
                    cx={ePt.x}
                    cy={ePt.y}
                    r={5.5}
                    fill={instant.earth.isVisible ? '#06B6D4' : '#1E293B'}
                    stroke="#22D3EE"
                    strokeWidth="1.6"
                  />
                  <circle
                    cx={sPt.x}
                    cy={sPt.y}
                    r={6.5}
                    fill={instant.sun.isVisible ? '#FBBF24' : '#1E293B'}
                    stroke="#F59E0B"
                    strokeWidth="1.6"
                  />
                </>
              );
            })()}
          </svg>

          <div className="space-y-3 text-xs text-slate-300 pr-2">
            <div className="p-3 bg-[#07090E] border border-slate-800 rounded-md space-y-2">
              <div className="font-semibold text-slate-100">Polar Sky-Dome Geometry</div>
              <p className="text-slate-400 leading-relaxed">
                Center represents the local zenith (+90°). The outer boundary marks the airless horizon.
                At polar sites, the Sun sweeps a full 360° circle just above or below the crater rim silhouette.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className="p-2.5 bg-[#07090E] border border-slate-800 rounded">
                <div className="text-slate-400 text-[11px]">Sun Clearance</div>
                <div className={instant.sun.isVisible ? 'text-amber-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {instant.sun.apparentAboveTerrainDeg >= 0 ? '+' : ''}
                  {instant.sun.apparentAboveTerrainDeg.toFixed(2)}°
                </div>
              </div>
              <div className="p-2.5 bg-[#07090E] border border-slate-800 rounded">
                <div className="text-slate-400 text-[11px]">Earth Clearance</div>
                <div className={instant.earth.isVisible ? 'text-cyan-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {instant.earth.apparentAboveTerrainDeg >= 0 ? '+' : ''}
                  {instant.earth.apparentAboveTerrainDeg.toFixed(2)}°
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-slate-800/70 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            Sun Position & 29.5d Path
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            Earth Position & Libration Loop
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-slate-500 inline-block" />
            Local Ridge Silhouette
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-400">
          Zero atmospheric refraction applied
        </span>
      </div>
    </div>
  );
};
