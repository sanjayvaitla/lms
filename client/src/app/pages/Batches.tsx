import { useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Skeleton } from '../components/ui/skeleton';
import type { Batch } from '../../types/api';

async function fetchBatches(courseId?: string): Promise<Batch[]> {
  const params: Record<string, string> = {};
  if (courseId) params.courseId = courseId;
  const { data } = await api.get('/batches', { params });
  return data.data ?? [];
}

export default function BatchesPage() {
  const [search] = useSearchParams();
  const courseId = search.get('courseId') ?? undefined;
  const view = search.get('view') ?? undefined;
  const navigate = useNavigate();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['batches', courseId],
    queryFn: () => fetchBatches(courseId),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Batches</h1>
          {courseId && <p className="text-sm text-gray-500 mt-1">Showing batches for course {courseId}</p>}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      ) : batches.length === 0 ? (
        <div className="text-gray-500">No batches found.</div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <div key={b.id} className="p-3 bg-white border rounded-xl flex items-center justify-between hover:shadow-sm transition-colors">
              <div>
                <div className="text-sm font-medium text-gray-900">{b.name}</div>
                <div className="text-xs text-gray-500">{b.course?.title ?? 'Course'} • {b._count?.enrollments ?? 0} students</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/batches/${b.id}`)}
                  className="text-sm text-cyan-600 bg-cyan-50 px-3 py-1 rounded-lg"
                >
                  View
                </button>
                {view === 'enrollments' && (
                  <button
                    onClick={() => navigate(`/batches/${b.id}`)}
                    className="text-sm text-purple-600 bg-purple-50 px-3 py-1 rounded-lg"
                  >
                    Manage Enrollments
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
