import api from './axios';
import { useQuery } from '@tanstack/react-query';

export interface CourseListItem {
  id: string;
  title: string;
  colorToken?: string;
}

export const courseListQueryKey = ['courses', 'list'] as const;

/** Parse GET /courses — API returns { courses, total, page, totalPages } */
export async function fetchCourseList(limit = 100): Promise<CourseListItem[]> {
  const safeLimit = typeof limit === 'number' && limit > 0 && limit <= 100 ? limit : 100;
  const { data } = await api.get('/courses', { params: { limit: safeLimit } });
  const raw = data.data?.courses ?? (Array.isArray(data.data) ? data.data : []);
  return raw.map((c: { id: string; title: string; colorToken?: string }) => ({
    id: c.id,
    title: c.title,
    colorToken: c.colorToken,
  }));
}

/** Shared React Query hook — one cache for all master pages */
export function useCourseList(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: courseListQueryKey,
    queryFn: () => fetchCourseList(),
    enabled: opts?.enabled ?? true,
  });
}
