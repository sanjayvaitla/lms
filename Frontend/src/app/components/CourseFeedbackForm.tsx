import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Star, MessageSquare, Save, Loader2, Info, GraduationCap } from 'lucide-react';

interface CourseFeedbackFormProps {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  color: string;
  onSuccess: () => void;
}

export function CourseFeedbackForm({
  enrollmentId,
  courseId,
  courseTitle,
  color,
  onSuccess
}: CourseFeedbackFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [ratings, setRatings] = useState({
    courseContentQuality: 0,
    conceptClarity: 0,
    practicalExercises: 0,
    courseAssessmentStructure: 0,
    overallCourseSatisfaction: 0,
  });

  const [comments, setComments] = useState({
    additionalComments: '',
    mostUsefulTopic: '',
    additionalTopics: '',
  });

  const parameters = [
    { key: 'courseContentQuality', label: 'Course Content Quality', desc: 'Relevance, depth, and organization of course content.' },
    { key: 'conceptClarity', label: 'Concept Clarity', desc: 'Ease of understanding concepts covered in the course.' },
    { key: 'practicalExercises', label: 'Practical Exercises & Assignments', desc: 'Effectiveness of labs, assignments, and exercises.' },
    { key: 'courseAssessmentStructure', label: 'Course Assessment Structure', desc: 'Quality and relevance of quizzes, assessments, and evaluations.' },
    { key: 'overallCourseSatisfaction', label: 'Overall Course Satisfaction', desc: 'Overall satisfaction with the course.' },
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
      await api.post('/feedback/course', {
        enrollmentId,
        courseId,
        ...ratings,
        ...comments
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit course feedback');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border-2 rounded-2xl p-6 relative overflow-hidden my-6 shadow-2xl" style={{ borderColor: `${color}40` }}>
      <div className="absolute top-0 right-0 w-64 h-64 opacity-10 blur-3xl pointer-events-none rounded-full" style={{ background: color, transform: 'translate(30%, -30%)' }} />
      
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
          <GraduationCap className="w-6 h-6" style={{ color }} />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900">Course Completion Feedback</h3>
          <p className="text-sm text-slate-500 mt-1">
            Congratulations on completing <strong className="text-slate-900">{courseTitle}</strong>! Please share your experience.
          </p>
        </div>
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
        <div className="space-y-3">
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
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all font-bold ${
                        active 
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                          : 'bg-slate-50 text-slate-400 border border-transparent hover:bg-slate-100 hover:text-slate-600'
                      }`}
                    >
                      {star}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-200">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-500" /> Additional Comments
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-slate-600 font-medium mb-1.5 block">Which topic did you find most useful?</span>
              <input
                type="text"
                value={comments.mostUsefulTopic}
                onChange={e => setComments(prev => ({ ...prev, mostUsefulTopic: e.target.value }))}
                placeholder="E.g., React Hooks, SQL Joins..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-[var(--theme-color)] transition-all"
                style={{ '--theme-color': color } as React.CSSProperties}
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-600 font-medium mb-1.5 block">What additional topics would you like?</span>
              <input
                type="text"
                value={comments.additionalTopics}
                onChange={e => setComments(prev => ({ ...prev, additionalTopics: e.target.value }))}
                placeholder="E.g., Docker, GraphQL..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-[var(--theme-color)] transition-all"
                style={{ '--theme-color': color } as React.CSSProperties}
              />
            </label>
          </div>

          <label className="block mt-4">
            <span className="text-sm text-slate-600 font-medium mb-1.5 block">Additional Comment</span>
            <textarea
              value={comments.additionalComments}
              onChange={e => setComments(prev => ({ ...prev, additionalComments: e.target.value }))}
              placeholder="Any other feedback about the course?"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-[var(--theme-color)] transition-all min-h-[80px] resize-y"
              style={{ '--theme-color': color } as React.CSSProperties}
            />
          </label>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-200">
          <button
            onClick={handleSubmit}
            disabled={!isFormValid || loading}
            className="flex items-center gap-2 px-8 py-3 rounded-xl text-base font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
            style={{ 
              background: `linear-gradient(135deg, ${color}, ${color}dd)`,
              boxShadow: `0 4px 20px ${color}50`
            }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Submit Course Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
