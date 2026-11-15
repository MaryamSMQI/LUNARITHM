import React from 'react';
import { ExternalLink, Database } from 'lucide-react';

interface NasaDatasetCard {
  name: string;
  usage: string;
  url: string;
}

const NASA_DATASETS: NasaDatasetCard[] = [
  {
    name: 'LRO LOLA topography (NASA PDS)',
    usage: 'Terrain, slopes and horizons',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm',
  },
  {
    name: 'LRO Diviner (NASA PDS)',
    usage: 'Surface temperature',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/diviner.htm',
  },
  {
    name: 'LRO LEND (NASA PDS)',
    usage: 'Hydrogen and water-ice indicators',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/lend.htm',
  },
  {
    name: 'NASA Moon Trek',
    usage: 'Lunar maps and imagery',
    url: 'https://trek.nasa.gov/moon/',
  },
  {
    name: 'NASA SVS CGI Moon Kit',
    usage: 'The realistic 3D Moon',
    url: 'https://svs.gsfc.nasa.gov/4720',
  },
  {
    name: 'NASA Artemis candidate landing regions',
    usage: 'The nine south-pole regions we evaluate',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
];

export const NasaDataInsideSection: React.FC = () => {
  return (
    <section aria-labelledby="nasa-data-inside-heading" className="lunar-panel rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#c9e8ff]" />
          <h2 id="nasa-data-inside-heading" className="text-base font-semibold text-white">
            NASA data inside
          </h2>
        </div>
        <span className="text-xs text-[#7392B5]">Official reference datasets &amp; lunar south-pole archives</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {NASA_DATASETS.map((item) => (
          <a
            key={item.name}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="lunar-card-interactive group rounded-lg bg-[#0c0c16]/85 border border-[#272d47] hover:border-[#c9e8ff]/60 p-4 flex flex-col justify-between gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff]"
          >
            <div className="space-y-1">
              <div className="text-sm font-semibold text-white group-hover:text-[#c9e8ff] transition-colors">
                {item.name}
              </div>
              <p className="text-xs text-[#7392B5]">{item.usage}</p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#c9e8ff]">
              <span>Open official archive</span>
              <ExternalLink className="w-3 h-3" />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};
