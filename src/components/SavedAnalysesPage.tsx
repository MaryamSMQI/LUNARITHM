import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookmarkPlus,
  Check,
  Copy,
  CopyPlus,
  FolderOpen,
  Layers,
  Pencil,
  Trash2,
} from 'lucide-react';
import { SavedAnalysisRecord, buildShareStateHashUrl } from '../utils/sessionTypes';
import { useAuth } from '../context/AuthContext';

interface SavedAnalysesPageProps {
  analyses: SavedAnalysisRecord[];
  currentSnapshot: Omit<SavedAnalysisRecord, 'id' | 'title' | 'createdAtIso' | 'updatedAtIso'>;
  onAddAnalysis: (title: string) => void;
  onRenameAnalysis: (id: string, nextTitle: string) => void;
  onDuplicateAnalysis: (id: string) => void;
  onDeleteAnalysis: (id: string) => void;
  onOpenAnalysis: (record: SavedAnalysisRecord) => void;
}

export const SavedAnalysesPage: React.FC<SavedAnalysesPageProps> = ({
  analyses,
  currentSnapshot,
  onAddAnalysis,
  onRenameAnalysis,
  onDuplicateAnalysis,
  onDeleteAnalysis,
  onOpenAnalysis,
}) => {
  const navigate = useNavigate();
  const { showToast } = useAuth();

  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultTitle = `${currentSnapshot.winningSiteName} — ${currentSnapshot.landingIsoLocal.slice(0, 10)}`;
    const title = newTitle.trim() || defaultTitle;
    onAddAnalysis(title);
    setNewTitle('');
    showToast(`Added "${title}" to session snapshots (in-memory only).`);
  };

  const handleCommitRename = (id: string) => {
    if (editingTitle.trim()) {
      onRenameAnalysis(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleCopyShareLink = (record: SavedAnalysisRecord) => {
    const url = buildShareStateHashUrl({
      landingIsoLocal: record.landingIsoLocal,
      windowHours: record.windowHours,
      priorities: record.priorities,
      constraints: record.constraints,
    });
    void navigator.clipboard?.writeText(url);
    setCopiedId(record.id);
    showToast('Stateless share URL copied! Anyone with this link can open the exact scenario.');
    setTimeout(() => setCopiedId((prev) => (prev === record.id ? null : prev)), 2200);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-panel-in">
      <div className="lunar-panel rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#b9f0d7]" />
              <h1 className="text-2xl font-bold text-white" style={{ textWrap: 'balance' }}>
                Session Workspace Snapshots
              </h1>
            </div>
            <p className="text-xs text-[#7392B5]">
              Kept strictly in memory for your active visit — no data is saved to a database or browser storage. Use &ldquo;Copy share link&rdquo; to export a stateless URL anytime.
            </p>
          </div>
          <Link
            to="/"
            className="lunar-btn px-3.5 py-2 text-xs font-medium rounded-md bg-[#0c0c16] border border-[#272d47] text-[#c9e8ff] hover:border-[#7392B5] whitespace-nowrap shrink-0"
          >
            Back to Workspace
          </Link>
        </div>

        <form onSubmit={handleSaveCurrent} className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#272d47]">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={`Snapshot title (default: ${currentSnapshot.winningSiteName} — ${currentSnapshot.landingIsoLocal.slice(0, 10)})`}
            aria-label="Snapshot title"
            className="flex-1 min-w-[240px] bg-[#0c0c16] border border-[#272d47] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#7392B5] focus:outline-none focus:ring-2 focus:ring-[#c9e8ff]"
          />
          <button
            type="submit"
            className="lunar-btn inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-[#c9e8ff] text-[#0c0c16] hover:bg-white transition-colors whitespace-nowrap shrink-0"
          >
            <BookmarkPlus className="w-4 h-4" />
            Capture Session Snapshot
          </button>
        </form>
      </div>

      <div className="lunar-panel rounded-xl p-6 space-y-3">
        {analyses.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className="text-sm font-medium text-white">No session snapshots captured yet</div>
            <p className="text-xs text-[#7392B5] max-w-md mx-auto">
              Capture your current epoch, priorities, and winning site in memory to compare or copy a shareable URL during this session.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {analyses.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-lg bg-[#0c0c16] border border-[#272d47] flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-[220px] flex-1">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCommitRename(item.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        aria-label="Rename snapshot"
                        className="bg-[#131524] border border-[#c9e8ff] rounded px-2.5 py-1 text-sm text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCommitRename(item.id)}
                        className="px-2.5 py-1 text-xs rounded bg-[#b9f0d7] text-[#0c0c16] font-semibold"
                      >
                        Apply
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#7392B5]">
                    <span className="text-[#b9f0d7]">{item.winningSiteName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.missionProfileName}</span>
                    <span aria-hidden="true">·</span>
                    <span>Epoch {item.landingIsoLocal.replace('T', ' ')} UTC</span>
                    <span aria-hidden="true">·</span>
                    <span>{Math.round(item.windowHours / 24)}d window</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAnalysis(item);
                      navigate('/');
                    }}
                    className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[#c9e8ff] text-[#0c0c16] hover:bg-white whitespace-nowrap shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicateAnalysis(item.id)}
                    className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-[#131524] border border-[#272d47] text-slate-200 hover:border-[#7392B5] whitespace-nowrap shrink-0"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditingTitle(item.title);
                    }}
                    className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-[#131524] border border-[#272d47] text-slate-200 hover:border-[#7392B5] whitespace-nowrap shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyShareLink(item)}
                    className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-[#131524] border border-[#272d47] text-[#c9e8ff] hover:border-[#c9e8ff]/60 whitespace-nowrap shrink-0"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#b9f0d7]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy share link
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAnalysis(item.id)}
                    className="lunar-btn inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-[#131524] border border-[#272d47] text-[#F25F5C] hover:border-[#F25F5C]/60 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
