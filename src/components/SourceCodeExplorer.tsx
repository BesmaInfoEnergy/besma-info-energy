import React, { useState } from 'react';
import { SourceFileItem } from '../types';
import { FileCode2, Copy, Check } from 'lucide-react';

interface SourceCodeExplorerProps {
  files: SourceFileItem[];
}

export const SourceCodeExplorer: React.FC<SourceCodeExplorerProps> = ({ files }) => {
  const [selectedPath, setSelectedPath] = useState<string>(
    files[0]?.path || 'backend/ingestion.py'
  );
  const [copied, setCopied] = useState(false);

  const currentFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleCopy = () => {
    if (!currentFile) return;
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Référentiel Code Source Production (Python 3.11 FastAPI, ML, Docker & Tests pytest)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Inspectez et copiez l’intégralité des modules générés dans l’espace de travail (`backend/`, `infrastructure/`, `requirements.txt`, `README.md`)
          </p>
        </div>
        <div className="text-xs font-mono text-emerald-400 tabular-nums">
          Couverture Tests Unitaires : &gt; 85% (pytest) · Température Gemini : 0.2
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Liste des fichiers du projet */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-300">
            Arborescence du Projet Généré
          </div>
          <div className="divide-y divide-slate-800/70">
            {files.map((file) => {
              const active = file.path === currentFile?.path;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 cursor-pointer ${
                    active ? 'bg-slate-800/90 text-sky-400' : 'hover:bg-slate-800/40 text-slate-300'
                  }`}
                >
                  <FileCode2 className="w-4 h-4 mt-0.5 shrink-0 text-sky-400" />
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-medium truncate">{file.path}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {file.category} · {file.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Visualiseur du code source */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          {currentFile && (
            <>
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div>
                  <span className="text-xs font-mono font-semibold text-sky-400">
                    {currentFile.path}
                  </span>
                  <span className="text-slate-600 mx-2">·</span>
                  <span className="text-xs text-slate-400">{currentFile.description}</span>
                </div>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copier le fichier
                    </>
                  )}
                </button>
              </div>
              <pre className="p-5 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[600px] overflow-y-auto bg-slate-950">
                <code>{currentFile.content}</code>
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
