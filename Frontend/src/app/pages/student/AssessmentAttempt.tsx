import { useState, useMemo } from 'react';
import { ChevronLeft, CheckCircle2, Award, ChevronRight, ChevronLeft as ChevLeft, AlertCircle } from 'lucide-react';

interface AssessmentAttemptProps {
  assessment: any;
  initialAnswers?: Record<string, string>;
  onCancel: () => void;
  onSave: (answers: Record<string, string>) => void;
}

export default function AssessmentAttempt({ assessment, initialAnswers = {}, onCancel, onSave }: AssessmentAttemptProps) {
  const questions = assessment.partAQuestions || [];

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [saving, setSaving] = useState(false);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers, questions]);

  function selectAnswer(questionId: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }

  async function handleSubmit() {
    if (saving) return;
    if (answeredCount < questions.length) {
      if (!confirm(`You've only answered ${answeredCount}/${questions.length} questions. Submit Part A anyway?`)) return;
    }
    setSaving(true);
    try {
      await Promise.resolve(onSave(answers));
    } finally {
      setSaving(false);
    }
  }

  const q = questions[currentIdx];
  const myAnswer = answers[q?.id];
  const isLast = currentIdx === questions.length - 1;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button onClick={onCancel} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Exit MCQ
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              <span className="text-slate-900 font-bold">{answeredCount}</span> / {questions.length} answered
            </span>
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">{assessment.title}</h1>
          <p className="text-xs text-slate-500 mt-1">Part A: Multiple Choice Questions</p>
        </div>

        {/* Question progress */}
        <div className="flex gap-1.5">
          {questions.map((qq: any, i: number) => (
            <button
              key={qq.id}
              onClick={() => setCurrentIdx(i)}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                i === currentIdx
                  ? 'bg-blue-600'
                  : answers[qq.id]
                    ? 'bg-blue-400 hover:bg-blue-500'
                    : 'bg-slate-200 hover:bg-slate-300'
              }`}
              title={`Question ${i + 1}${answers[qq.id] ? ' (answered)' : ''}`}
            />
          ))}
        </div>

        {/* Question card */}
        {q && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold flex-shrink-0">
                {currentIdx + 1}
              </div>
              <div className="flex-1">
                <p className="text-base text-slate-900 leading-relaxed">{q.questionText}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Award className="w-3 h-3" /> {q.points ?? 1} pt{q.points !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-2.5">
              {q.options?.map((opt: string, i: number) => {
                const letter = String.fromCharCode(65 + i);
                const isSelected = myAnswer === opt;
                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(q.id, opt)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all flex items-center gap-3 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-400 text-slate-900 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {letter}
                    </div>
                    <span className="text-sm leading-relaxed flex-1">{opt}</span>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
            disabled={currentIdx === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevLeft className="w-4 h-4" /> Previous
          </button>

          {isLast ? (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {saving ? 'Submitting…' : 'Submit Part A'} <CheckCircle2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {answeredCount < questions.length && isLast && (
          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{questions.length - answeredCount} unanswered question{questions.length - answeredCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
