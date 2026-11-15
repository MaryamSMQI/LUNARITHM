import React from 'react';
import { Compass } from 'lucide-react';

interface SpaceLoadingScreenProps {
  label?: string;
}

export const SpaceLoadingScreen: React.FC<SpaceLoadingScreenProps> = ({
  label = 'Loading lunar telemetry & 3D terrain…',
}) => {
  return (
    <div className="lunar-panel rounded-lg p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[260px]">
      <div className="relative w-12 h-12 rounded-full border border-[#7392B5]/40 bg-[#0c0c16]/80 flex items-center justify-center">
        <Compass className="w-5 h-5 text-[#c9e8ff] animate-spin" style={{ animationDuration: '4s' }} />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium text-white">{label}</div>
        <p className="text-xs text-[#7392B5]">Computing south-polar geometry and horizon profiles</p>
      </div>
    </div>
  );
};
