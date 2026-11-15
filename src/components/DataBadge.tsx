import React from 'react';
import { DataClass, ProvenanceRecord } from '../types/lunar';

interface DataBadgeProps {
  dataClass: DataClass;
  provenance?: ProvenanceRecord;
  onInspect?: (record: ProvenanceRecord) => void;
}

const CLASS_STYLES: Record<DataClass, { text: string; bg: string; label: string }> = {
  MEASURED: { text: 'text-[#b9f0d7]', bg: 'border-[#b9f0d7]/35 bg-[#b9f0d7]/10', label: 'MEASURED' },
  DERIVED: { text: 'text-[#c9e8ff]', bg: 'border-[#c9e8ff]/35 bg-[#c9e8ff]/10', label: 'DERIVED' },
  LITERATURE: { text: 'text-[#7392B5]', bg: 'border-[#7392B5]/40 bg-[#7392B5]/15', label: 'LITERATURE' },
  ESTIMATED: { text: 'text-[#F5B83D]', bg: 'border-[#F5B83D]/35 bg-[#F5B83D]/10', label: 'ESTIMATED' },
  SYNTHETIC: { text: 'text-[#b8baff]', bg: 'border-[#b8baff]/35 bg-[#b8baff]/10', label: 'SYNTHETIC' },
  MISSING: { text: 'text-[#F25F5C]', bg: 'border-[#F25F5C]/35 bg-[#F25F5C]/10', label: 'MISSING' },
};

export const DataBadge: React.FC<DataBadgeProps> = ({ dataClass, provenance, onInspect }) => {
  const style = CLASS_STYLES[dataClass];

  if (provenance && onInspect) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onInspect(provenance);
        }}
        title="Inspect calculation provenance"
        className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-medium tracking-wide rounded border ${style.bg} ${style.text} hover:brightness-125 transition-all whitespace-nowrap shrink-0`}
      >
        {style.label}
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-medium tracking-wide rounded border ${style.bg} ${style.text} whitespace-nowrap shrink-0`}
    >
      {style.label}
    </span>
  );
};
