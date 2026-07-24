import React from 'react';
import { Cpu, X, Star } from 'lucide-react';

export function AIGradeModal({ progress, showAIPanel, setShowAIPanel }: { progress: any[], showAIPanel: string, setShowAIPanel: (val: string | null) => void }) {
  const prog = progress.find(p => p.id === showAIPanel);
  if (!prog) return null;
  const isGrading = false;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-600" /> AI Code Evaluation
          </h3>
          <button onClick={() => setShowAIPanel(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6">
          {isGrading ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
                <Cpu className="w-7 h-7 text-blue-500 animate-spin" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Analyzing code from fork…</p>
              <p className="text-xs text-gray-400 max-w-[200px] mx-auto">AI is evaluating code quality, tests, documentation, and best practices</p>
              <div className="flex gap-1 justify-center mt-4">
                {['Code Quality', 'Tests', 'Docs', 'Practices'].map(l => (
                  <span key={l} className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full animate-pulse font-semibold">{l}</span>
                ))}
              </div>
            </div>
          ) : prog.aiScore !== null ? (
            <div className="space-y-4">
              <div className="text-center pb-2">
                <p className="text-xs text-gray-500 mb-2">{prog.studentName}</p>
                <div className="flex items-center justify-center gap-0.5 mb-1">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={`w-7 h-7 ${i <= Math.floor(prog.aiScore!) ? 'text-amber-400 fill-amber-400' : i - 0.5 <= prog.aiScore! ? 'text-amber-300 fill-amber-200' : 'text-gray-200 fill-gray-100'}`} />
                  ))}
                </div>
                <p className="text-3xl font-black text-gray-900">{prog.aiScore!.toFixed(1)}<span className="text-base font-normal text-gray-400">/5</span></p>
                <p className={`text-sm font-bold mt-1 ${prog.aiScore! >= 4.5 ? 'text-emerald-600' : prog.aiScore! >= 3.5 ? 'text-blue-600' : prog.aiScore! >= 2.5 ? 'text-amber-600' : 'text-red-500'}`}>
                  {prog.aiScore! >= 4.5 ? 'Excellent 🏆' : prog.aiScore! >= 3.5 ? 'Very Good' : prog.aiScore! >= 2.5 ? 'Good' : 'Needs Improvement'}
                </p>
              </div>
              <div className="space-y-2.5">
                {prog.aiBreakdown.map((b: any) => {
                  const bs = Number(b.score); const bm = Number(b.max) || 5;
                  return (
                  <div key={b.label} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="text-xs font-semibold text-gray-700 w-32 shrink-0">{b.label}</span>
                    <div className="flex items-center gap-0.5 flex-1">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.floor(bs) ? 'text-amber-400 fill-amber-400' : i - 0.5 <= bs ? 'text-amber-300 fill-amber-200' : 'text-gray-200 fill-gray-100'}`} />
                      ))}
                    </div>
                    <span className="text-xs font-bold text-gray-800 shrink-0">{bs.toFixed(1)}<span className="text-gray-400 font-normal">/{bm}</span></span>
                  </div>
                  );
                })}
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1"><Cpu className="w-3 h-3" /> Evaluated From</p>
                <p className="text-[10px] text-blue-600 font-mono break-all">{prog.forkUrl.replace('https://github.com/', 'github.com/')}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">Score not available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
