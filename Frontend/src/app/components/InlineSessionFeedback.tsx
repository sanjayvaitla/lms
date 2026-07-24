import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Star, MessageSquare, Save, X, Loader2, Info } from 'lucide-react';

interface InlineSessionFeedbackProps {
  enrollmentId: string;
  moduleId: string;
  batchId: string;
  sessionTitle: string;
  onSuccess: () => void;
  onCancel: () => void;
  color: string;
}

export function InlineSessionFeedback({
  enrollmentId,
  moduleId,
  batchId,
  sessionTitle,
  onSuccess,
  onCancel,
  color
}: InlineSessionFeedbackProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [ratings, setRatings] = useState({
    sessionContentRelevance: 0,
    conceptExplanation: 0,
    practicalDemonstration: 0,
    learningMaterialQuality: 0,
    overallSessionSatisfaction: 0,
  });

  const [comments, setComments] = useState({
    valuableTakeaway: '',
    suggestionsImprovement: '',
  });

  const parameters = [
    { key: 'sessionContentRelevance', label: 'Session Content Relevance', desc: 'Relevance of the session/module to learning objectives.' },
    { key: 'conceptExplanation', label: 'Concept Explanation', desc: 'Clarity and effectiveness of topic explanation.' },
    { key: 'practicalDemonstration', label: 'Practical Demonstration Quality', desc: 'Effectiveness of examples, demos, and hands-on activities.' },
    { key: 'learningMaterialQuality', label: 'Learning Material Quality', desc: 'Usefulness of presentation, notes, recordings, and reference material.' },
    { key: 'overallSessionSatisfaction', label: 'Overall Session Satisfaction', desc: 'Overall rating of the session/module.' },
  ];

  const handleRating = (key: string, value: number) => {
    setRatings(prev => ({ ...prev, [key]: value }));
  };

  const isFormValid = Object.values(ratings).every(r => r > 0);

  const handleSubmit = async () => {
    if (!isFormValid) {
      setError('Please provide a rating for all parameters.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      await api.post('/feedback', {
        enrollmentId,
        moduleId,
        ...ratings,
        ...comments
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      <div className="absolute top-0 left-0 w-full h-1" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            Session Feedback
          </h3>
          <div className="text-sm text-slate-500 mt-1">
            <p>Please evaluate <strong className="text-slate-700">{sessionTitle}</strong></p>
            <p className="text-xs text-blue-500/80 mt-0.5">Note: This feedback covers all sessions up to and including this one.</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 space-y-1">
          <p><strong>Rating Scale:</strong></p>
          <p>1 = Poor | 2 = Fair | 3 = Good | 4 = Very Good | 5 = Excellent</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Ratings */}
        <div className="space-y-4">
          {parameters.map(param => (
            <div key={param.key} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-100 hover:bg-slate-50 transition-colors">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{param.label}</p>
                <p className="text-xs text-slate-500 mt-1">{param.desc}</p>
              </div>
              
              <div className="flex items-center gap-1.5 shrink-0">
                {[1, 2, 3, 4, 5].map(star => {
                  const val = ratings[param.key as keyof typeof ratings];
                  const active = val >= star;
                  return (
                    <button
                      key={star}
                      onClick={() => handleRating(param.key, star)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                        active 
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                          : 'bg-slate-50 text-slate-400 border border-transparent hover:bg-slate-100 hover:text-slate-600'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${active ? 'fill-current' : ''}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Text Comments */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-500" /> Additional Comments
          </h4>
          
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-slate-600 font-medium mb-1.5 block">What was the most valuable takeaway from this session?</span>
              <textarea
                value={comments.valuableTakeaway}
                onChange={e => setComments(prev => ({ ...prev, valuableTakeaway: e.target.value }))}
                placeholder="Share your key learnings..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] transition-all min-h-[80px] resize-y"
                style={{ '--theme-color': color } as React.CSSProperties}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-600 font-medium mb-1.5 block">Any suggestions for improvement?</span>
              <textarea
                value={comments.suggestionsImprovement}
                onChange={e => setComments(prev => ({ ...prev, suggestionsImprovement: e.target.value }))}
                placeholder="How can we make this better?"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] transition-all min-h-[80px] resize-y"
                style={{ '--theme-color': color } as React.CSSProperties}
              />
            </label>
          </div>
        </div>

        {/* Action */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isFormValid || loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
            style={{ 
              background: `linear-gradient(135deg, ${color}, ${color}dd)`,
              boxShadow: `0 4px 15px ${color}40`
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
