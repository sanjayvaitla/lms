import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Skeleton } from '../components/ui/skeleton';
import { AreaChart, Area, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Course, DashboardStats } from '../../types/api';

async function fetchCourse(id: string): Promise<Course> {
  const { data } = await api.get(`/courses/${id}`);
  return data.data;
}

async function fetchBatches(courseId: string) {
  const { data } = await api.get('/batches', { params: { courseId } });
  return data.data ?? [];
}

export default function CourseAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: course, isLoading: courseLoading } = useQuery({ queryKey: ['course', id], queryFn: () => fetchCourse(id!), enabled: !!id });
  const { data: batches = [], isLoading: batchesLoading } = useQuery({ queryKey: ['batches', id], queryFn: () => fetchBatches(id!), enabled: !!id });

  if (!id) return <div>Course ID missing</div>;
  if (courseLoading || batchesLoading) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Analytics — {course?.title}</h1>
        <p className="text-sm text-gray-500">Overview of course performance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-4 bg-white border rounded-xl">
          <p className="text-xs text-gray-500">Students enrolled</p>
          <p className="text-2xl font-bold">{course?.studentCount ?? 0}</p>
        </div>
        <div className="p-4 bg-white border rounded-xl">
          <p className="text-xs text-gray-500">Active batches</p>
          <p className="text-2xl font-bold">{course?.batchCount ?? batches.length}</p>
        </div>
        <div className="p-4 bg-white border rounded-xl">
          <p className="text-xs text-gray-500">Completion</p>
          <p className="text-2xl font-bold">{course?.completionPct ?? 0}%</p>
        </div>
      </div>

      {/* Simple batches list */}
      <div className="bg-white border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Batches</h3>
        <div className="space-y-2">
          {batches.map((b: any) => (
            <div key={b.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <div>
                <div className="font-medium text-sm">{b.name}</div>
                <div className="text-xs text-gray-500">{b._count?.enrollments ?? 0} students</div>
              </div>
              <div className="text-xs text-gray-500">{new Date(b.startDate).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
