import React from 'react';
import { FileSearch, X } from 'lucide-react';
import { ProvenanceRecord } from '../types/lunar';
import { DataBadge } from './DataBadge';

interface ProvenanceDrawerProps {
  record: ProvenanceRecord | null;
  onClose: () => void;
}

export const ProvenanceDrawer: React.FC<ProvenanceDrawerProps> = ({ record, onClose }) => {
  if (!record) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65">
      <div className="w-full max-w-md bg-[#131524] border-l border-[#272d47] h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#272d47]">
          <div className="flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-[#c9e8ff]" />
            <h2 className="text-sm font-semibold text-white">Scientific Provenance Inspector</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close provenance drawer"
            className="p-1 text-[#7392B5] hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="p-3.5 bg-[#0c0c16] border border-[#272d47] rounded-md space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#7392B5] font-mono">{record.label}</span>
              <DataBadge dataClass={record.dataClass} />
            </div>
            <div className="text-2xl font-mono font-bold text-[#c9e8ff]">
              {record.value}
              {record.unit && <span className="text-xs text-[#7392B5] ml-1.5">{record.unit}</span>}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-mono text-[#7392B5] uppercase">1. Original Source</div>
            <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded text-slate-200 leading-relaxed">
              {record.source}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-mono text-[#7392B5] uppercase">2. Processing Pipeline</div>
            <ol className="p-3 bg-[#0c0c16] border border-[#272d47] rounded space-y-1.5 list-decimal list-inside text-slate-300">
              {record.processingSteps.map((step, idx) => (
                <li key={idx} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {record.formula && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono text-[#7392B5] uppercase">3. Mathematical Formula</div>
              <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded font-mono text-[11px] text-[#b9f0d7] break-words">
                {record.formula}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-[11px] font-mono text-[#7392B5] uppercase">4. Uncertainty & Caveats</div>
            <div className="p-3 bg-[#0c0c16] border border-[#272d47] rounded text-slate-300 leading-relaxed">
              {record.uncertainty ?? 'No quantified instrument uncertainty provided for this baseline; treat synthetic horizon masks as preliminary.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
