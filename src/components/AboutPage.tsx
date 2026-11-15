import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import lunarLimbImg from '../assets/images/lunar_limb_backdrop_1794599012640.jpg';

interface TeamMember {
  initials: string;
  name: string;
  email: string;
}

const TEAM_MEMBERS: TeamMember[] = [
  {
    initials: 'MK',
    name: 'Maryam S. Kotb',
    email: 'ms0951015@gmail.com',
  },
  {
    initials: 'JI',
    name: 'Jana E. Ibrahim',
    email: 'elsayedjana33@gmail.com',
  },
  {
    initials: 'JS',
    name: 'Jana G. Shaaban',
    email: 'janagamil826@gmail.com',
  },
  {
    initials: 'NO',
    name: 'Nadin B. Ouf',
    email: 'nadenbadr406@gmail.com',
  },
];

export const AboutPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-panel-in py-2">
      <div className="lunar-panel rounded-xl overflow-hidden">
        <div
          className="p-6 sm:p-8 border-b border-[#272d47] space-y-3"
          style={{
            backgroundImage: `linear-gradient(120deg, rgba(12,12,22,0.92) 0%, rgba(19,21,36,0.78) 65%, rgba(12,12,22,0.9) 100%), url(${lunarLimbImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-mono text-[#c9e8ff]">NASA Space Apps Challenge 2026 · Alexandria, Egypt</span>
            <Link
              to="/"
              className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#0c0c16]/85 border border-[#272d47] text-slate-200 hover:border-[#c9e8ff] whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Evaluator
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ textWrap: 'balance' }}>
            About LUNARITHM
          </h1>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-3xl">
            LUNARITHM was built by our team from Alexandria, Egypt, for the NASA Space Apps Challenge 2026. It helps space agencies, space companies and universities choose where to land on the Moon’s south pole — and proves the decision holds.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          <h2 className="text-lg font-semibold text-white">Meet the team</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TEAM_MEMBERS.map((member) => (
              <div
                key={member.email}
                className="lunar-card-interactive rounded-xl bg-[#0c0c16]/80 border border-[#272d47] hover:border-[#c9e8ff]/55 p-4 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-[#1a1d30] border border-[#7392B5]/50 flex items-center justify-center text-sm font-mono font-semibold text-[#c9e8ff] shrink-0">
                  {member.initials}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold text-white truncate">{member.name}</div>
                  <a
                    href={`mailto:${member.email}`}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-[#c9e8ff] hover:text-white transition-colors break-all"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span>{member.email}</span>
                  </a>
                </div>
              </div>
            ))}
          </div>

          <p className="pt-2 border-t border-[#272d47] text-sm text-[#7392B5]">
            Questions, feedback or collaboration? Email any of us.
          </p>
        </div>
      </div>
    </div>
  );
};
