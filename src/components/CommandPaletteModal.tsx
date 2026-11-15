import React, { useEffect, useMemo, useState } from 'react';
import { Command, Compass, MapPin, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { LunarSite } from '../types/lunar';

interface CommandAction {
  id: string;
  category: 'Navigation' | 'Landing Site' | 'Action';
  label: string;
  hint: string;
  run: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: LunarSite[];
  onSelectSite: (siteId: string) => void;
  onNavigate: (tab: 'overview' | 'sky3d' | 'compare' | 'decision' | 'reports', subView?: string) => void;
  onStartDemo: () => void;
  onToggleMotion: () => void;
  onToggleLearnMode: () => void;
  onTogglePresentation: () => void;
  onToggleRankingBasis: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  sites,
  onSelectSite,
  onNavigate,
  onStartDemo,
  onToggleMotion,
  onToggleLearnMode,
  onTogglePresentation,
  onToggleRankingBasis,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const actions: CommandAction[] = useMemo(() => {
    const navs: CommandAction[] = [
      { id: 'nav-over', category: 'Navigation', label: 'Open Overview & Ephemeris Map', hint: 'Site explorer, 3D scene & timelines', run: () => onNavigate('overview') },
      { id: 'nav-sky3d', category: 'Navigation', label: 'Open 3D & Physics Lab', hint: 'Battery SoC, Link Budget, Thermal, Pairs', run: () => onNavigate('sky3d') },
      { id: 'nav-compare', category: 'Navigation', label: 'Open Compare Scenarios', hint: 'Side-by-side 4 sites or launch slips', run: () => onNavigate('compare') },
      { id: 'nav-rank', category: 'Navigation', label: 'Open Decision Ranking (WSM vs TOPSIS)', hint: 'Why This Site? + constraints', run: () => onNavigate('decision', 'ranking') },
      { id: 'nav-flip', category: 'Navigation', label: 'Open Decision Flip & Ternary Map', hint: 'Simplex tipping points + history', run: () => onNavigate('decision', 'flip') },
      { id: 'nav-stab', category: 'Navigation', label: 'Open Stability, Minimax Regret & VoI', hint: 'Monte Carlo + Pareto frontier', run: () => onNavigate('decision', 'stability') },
      { id: 'nav-room', category: 'Navigation', label: 'Open Stakeholder Room, Dispersion & Frontier', hint: 'Ellipse feasibility + team compromise', run: () => onNavigate('decision', 'dispersion_room') },
      { id: 'nav-rep', category: 'Navigation', label: 'Open Data Center, Memo & Self-Test', hint: 'CSV import, rationale memo, 14 tests', run: () => onNavigate('reports') },
    ];

    const sysActions: CommandAction[] = [
      { id: 'act-demo', category: 'Action', label: 'Start / Restart Guided Demo (10 Steps)', hint: 'Interactive judge walkthrough', run: onStartDemo },
      { id: 'act-basis', category: 'Action', label: 'Toggle Ranking Basis (Derived vs Terrain Mask)', hint: 'Switch smooth-sphere+dip vs terrain', run: onToggleRankingBasis },
      { id: 'act-learn', category: 'Action', label: 'Toggle Learn Mode ("Why it matters" lines)', hint: 'Educational inline explanations', run: onToggleLearnMode },
      { id: 'act-motion', category: 'Action', label: 'Toggle Motion (Full / Reduced)', hint: 'Disable/enable background stars & animations', run: onToggleMotion },
      { id: 'act-pres', category: 'Action', label: 'Toggle Presentation Mode', hint: 'Simplified full-width judge view', run: onTogglePresentation },
    ];

    const siteItems: CommandAction[] = sites.map((s) => ({
      id: `site-${s.id}`,
      category: 'Landing Site',
      label: `Inspect ${s.name}`,
      hint: `${s.program} · ${Math.abs(s.latDeg).toFixed(2)}°${s.latDeg < 0 ? 'S' : 'N'}`,
      run: () => {
        onSelectSite(s.id);
        onNavigate('overview');
      },
    }));

    return [...navs, ...sysActions, ...siteItems];
  }, [sites, onSelectSite, onNavigate, onStartDemo, onToggleMotion, onToggleLearnMode, onTogglePresentation, onToggleRankingBasis]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions.slice(0, 12);
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.hint.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [actions, query]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-[#0c0c16]/80 backdrop-blur-sm p-4 no-print"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#131524] border border-[#7392B5]/50 rounded-xl shadow-2xl overflow-hidden animate-toast-in"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#272d47]">
          <Search className="w-4 h-4 text-[#c9e8ff] shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to workspace, landing site, or action (e.g. Malapert, Flip, Dispersion)..."
            className="flex-1 bg-transparent text-sm text-white placeholder-[#7392B5] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 text-[#7392B5] hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto divide-y divide-[#272d47]/50">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#7392B5]">
              No matching pages, sites, or actions.
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.run();
                  onClose();
                }}
                className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[#1a1d30] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.category === 'Navigation' ? (
                    <Compass className="w-3.5 h-3.5 text-[#c9e8ff] shrink-0" />
                  ) : item.category === 'Landing Site' ? (
                    <MapPin className="w-3.5 h-3.5 text-[#b9f0d7] shrink-0" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-[#b8baff] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">{item.label}</div>
                    <div className="text-[11px] text-[#7392B5] truncate">{item.hint}</div>
                  </div>
                </div>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#0c0c16] border border-[#272d47] text-[#7392B5] shrink-0">
                  {item.category}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 bg-[#0c0c16] border-t border-[#272d47] flex items-center justify-between text-[11px] font-mono text-[#7392B5]">
          <span className="flex items-center gap-1.5">
            <Command className="w-3 h-3" /> Ctrl/Cmd + K
          </span>
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3 h-3" /> Esc to close
          </span>
        </div>
      </div>
    </div>
  );
};
