import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="lunar-panel rounded-xl p-8 max-w-md w-full text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-[#1a1d30] border border-[#7392B5]/40 flex items-center justify-center">
          <Compass className="w-6 h-6 text-[#c9e8ff]" />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-mono text-[#7392B5]">404 · Route Not Found</div>
          <h1 className="text-2xl font-bold text-white" style={{ textWrap: 'balance' }}>
            Page not found
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            That LUNARITHM route does not exist or may have moved. Return to the main south-pole mission evaluator.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            to="/"
            className="lunar-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md bg-[#c9e8ff] text-[#0c0c16] hover:bg-white transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Overview
          </Link>
          <Link
            to="/about"
            className="lunar-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-[#0c0c16] border border-[#272d47] text-[#c9e8ff] hover:border-[#7392B5] transition-colors whitespace-nowrap shrink-0"
          >
            About LUNARITHM
          </Link>
        </div>
      </div>
    </div>
  );
};
