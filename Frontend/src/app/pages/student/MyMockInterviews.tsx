import { useQuery } from '@tanstack/react-query';
import { Video, Calendar, Clock, GraduationCap, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../../lib/axios';
import { Skeleton } from '../../components/ui/skeleton';
import type { MockInterview } from '../../../types/api';
import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';

async function fetchMyInterviews(): Promise<MockInterview[]> {
  const { data } = await api.get('/interviews');
  return data.data ?? [];
}

export default function MyMockInterviews() {
  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ['my-mock-interviews'],
    queryFn: fetchMyInterviews,
  });

  const upcoming = interviews.filter(i => i.status === 'SCHEDULED');
  const past = interviews.filter(i => i.status !== 'SCHEDULED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Mock Interviews</h1>
        <p className="text-gray-500 text-sm mt-1">View your scheduled 1-on-1 mock interviews and past feedback.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : interviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 mb-4">
            <Video className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">No Interviews Scheduled</h2>
          <p className="text-gray-500 text-sm mt-1 text-center max-w-sm">
            You don't have any mock interviews scheduled at the moment. Your trainers will schedule them for you.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" /> Upcoming Interviews
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcoming.map(interview => (
                  <InterviewCard key={interview.id} interview={interview} isStudent />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-500" /> Past Interviews
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {past.map(interview => (
                  <InterviewCard key={interview.id} interview={interview} isStudent />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function InterviewCard({ interview, isStudent }: { interview: MockInterview, isStudent?: boolean }) {
  const isCompleted = interview.status === 'COMPLETED';
  
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Interviewer</p>
            <h3 className="font-bold text-gray-900">{interview.trainer?.name}</h3>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${isCompleted ? 'bg-blue-100 text-blue-700' : interview.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
          {interview.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex flex-col text-gray-600 bg-gray-50 p-2.5 rounded-lg">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Date</span>
          <span className="font-semibold flex items-center gap-1.5 mt-1 text-gray-800">
            <Calendar className="w-4 h-4 text-gray-400"/> {format(new Date(interview.start_time), 'MMM do, yyyy')}
          </span>
        </div>
        <div className="flex flex-col text-gray-600 bg-gray-50 p-2.5 rounded-lg">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Time</span>
          <span className="font-semibold flex items-center gap-1.5 mt-1 text-gray-800">
            <Clock className="w-4 h-4 text-gray-400"/> {format(new Date(interview.start_time), 'h:mm a')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-auto pt-2">
        {interview.status === 'SCHEDULED' ? (
          interview.is_ai_driven ? (
            <Link
              to={`/my-mock-interviews/ai/${interview.id}`}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition flex items-center justify-center gap-2 shadow-sm"
            >
              <Sparkles className="w-4 h-4" /> Start AI Interview
            </Link>
          ) : (
            interview.meeting_link ? (
              <a
                href={interview.meeting_link}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-sm"
              >
                <Video className="w-4 h-4" /> Join Interview
              </a>
            ) : (
              <div className="flex-1 py-2.5 text-sm font-semibold text-slate-500 bg-slate-100 rounded-xl flex items-center justify-center gap-2 border border-slate-200">
                <Video className="w-4 h-4" /> Meeting link not set
              </div>
            )
          )
        ) : interview.status === 'COMPLETED' ? (
          <div className="flex-1 bg-blue-50 rounded-xl p-3 border border-blue-100 flex flex-col items-center text-center">
            {interview.is_ai_driven && !interview.is_published ? (
              <div className="py-2">
                <p className="text-sm font-bold text-blue-700">Interview Completed</p>
                <p className="text-xs text-blue-600 mt-1">Score is pending review by your trainer.</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-1">Final Score</p>
                <div className="text-2xl font-black text-blue-700">{interview.score}<span className="text-sm text-blue-500 font-medium">/100</span></div>
                {interview.feedback && (
                  <p className="text-xs text-blue-800 mt-2 text-center bg-white/60 p-2 rounded-lg w-full line-clamp-3">
                    {interview.feedback}
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
