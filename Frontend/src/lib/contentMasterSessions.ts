import type { QueryClient, UseQueryOptions } from '@tanstack/react-query';
import api from './axios';

export interface CmSessionRow {
  id: string;
  title: string;
  section: string;
  sessionNumber: string | null;
  sortOrder: number;
  status: string;
  courseId: string;
  references: unknown[];
  slm: unknown[];
  ppt: unknown[];
  artifacts: unknown[];
}

export interface CmSectionGroup {
  section: string;
  sessions: CmSessionRow[];
}

function emptySessionFromModule(m: Record<string, unknown>): CmSessionRow {
  return {
    id: m.id as string,
    title: m.title as string,
    section: (m.section as string) ?? 'General',
    sessionNumber: (m.sessionNumber as string) ?? null,
    sortOrder: (m.sortOrder as number) ?? 0,
    status: (m.status as string) ?? 'LOCKED',
    courseId: m.courseId as string,
    references: [],
    slm: [],
    ppt: [],
    artifacts: [],
  };
}

/** Ensure every session has content arrays (API + cache safe) */
export function normalizeContentMasterSections(
  sections: CmSectionGroup[],
  defaultCourseId?: string,
): CmSectionGroup[] {
  return (sections ?? []).map((sec) => ({
    section: sec.section,
    sessions: (sec.sessions ?? []).map((s) => ({
      ...s,
      courseId: s.courseId ?? defaultCourseId ?? '',
      references: Array.isArray(s.references) ? s.references : [],
      slm: Array.isArray(s.slm) ? s.slm : [],
      ppt: Array.isArray(s.ppt) ? s.ppt : [],
      artifacts: Array.isArray(s.artifacts) ? s.artifacts : [],
    })),
  }));
}

/** Build sections from GET /courses/:id/modules (Curriculum Master source of truth) */
export function groupModulesToSections(modules: Record<string, unknown>[]): CmSectionGroup[] {
  const map = new Map<string, CmSessionRow[]>();
  for (const m of modules) {
    const key = (m.section as string) ?? 'General';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(emptySessionFromModule(m));
  }
  return Array.from(map.entries())
    .map(([section, sessions]) => ({
      section,
      sessions: sessions.sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => {
      const ao = a.sessions[0]?.sortOrder ?? 0;
      const bo = b.sessions[0]?.sortOrder ?? 0;
      return ao - bo;
    });
}

function mergeContentArrays<T extends { id?: string }>(rich?: T[], base?: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of base ?? []) {
    if (item.id) byId.set(item.id, item);
  }
  for (const item of rich ?? []) {
    if (item.id) byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

/** Merge uploaded content (SLM/refs) from content-master API onto module list */
export function mergeContentSections(base: CmSectionGroup[], rich: CmSectionGroup[]): CmSectionGroup[] {
  const richById = new Map<string, CmSessionRow>();
  for (const sec of rich) {
    for (const s of sec.sessions ?? []) richById.set(s.id, s);
  }

  const used = new Set<string>();
  const merged: CmSectionGroup[] = base.map((sec) => ({
    section: sec.section,
    sessions: sec.sessions.map((s) => {
      const r = richById.get(s.id);
      if (r) used.add(s.id);
      return r
        ? {
            ...s,
            ...r,
            courseId: s.courseId ?? r.courseId,
            references: mergeContentArrays(r.references as { id?: string }[], s.references as { id?: string }[]),
            slm: mergeContentArrays(r.slm as { id?: string }[], s.slm as { id?: string }[]),
            ppt: mergeContentArrays(r.ppt as { id?: string }[], s.ppt as { id?: string }[]),
            artifacts: mergeContentArrays(r.artifacts as { id?: string }[], s.artifacts as { id?: string }[]),
          }
        : s;
    }),
  }));

  for (const sec of rich) {
    for (const s of sec.sessions ?? []) {
      if (used.has(s.id)) continue;
      let target = merged.find((m) => m.section === sec.section);
      if (!target) {
        target = { section: sec.section, sessions: [] };
        merged.push(target);
      }
      target.sessions.push(s);
      used.add(s.id);
    }
  }

  return merged.filter((s) => s.sessions.length > 0);
}

export function countCmSessions(sections: CmSectionGroup[]): number {
  return sections.reduce((n, s) => n + (s.sessions?.length ?? 0), 0);
}

export async function fetchCourseModules(courseId: string): Promise<Record<string, unknown>[]> {
  const { data } = await api.get(`/courses/${courseId}/modules`);
  return data.data ?? [];
}

export const courseModulesQueryKey = (courseId: string) => ['course-modules', courseId] as const;

export const contentMasterCourseKey = (courseId: string) =>
  ['content-master-course', courseId] as const;

export interface ContentMasterCourseData {
  course: { id: string; title: string; colorToken?: string };
  sections: CmSectionGroup[];
}

/** Single canonical fetch for Content/Recordings masters */
export async function fetchContentMasterCourse(
  courseId: string,
): Promise<ContentMasterCourseData> {
  const { data } = await api.get(`/student/content-master/courses/${courseId}/sessions`, {
    params: { _: Date.now() },
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  const raw = data.data as ContentMasterCourseData;
  return {
    ...raw,
    sections: normalizeContentMasterSections(raw.sections, raw.course?.id ?? courseId),
  };
}

export const contentMasterBatchKey = (batchId: string) =>
  ['content-master-batch', batchId] as const;

export async function fetchContentMasterBatch(batchId: string) {
  const { data } = await api.get(`/student/content-master/batches/${batchId}/sessions`, {
    params: { _: Date.now() },
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  const raw = data.data as { batch: Record<string, unknown>; sections: CmSectionGroup[] };
  return {
    ...raw,
    sections: normalizeContentMasterSections(raw.sections),
  };
}

/** Shared query options — always refetch when opening Content Master */
export function contentMasterCourseQueryOptions(
  courseId: string,
): UseQueryOptions<ContentMasterCourseData> {
  return {
    queryKey: contentMasterCourseKey(courseId),
    queryFn: () => fetchContentMasterCourse(courseId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  };
}

export function contentMasterBatchQueryOptions(batchId: string) {
  return {
    queryKey: contentMasterBatchKey(batchId),
    queryFn: () => fetchContentMasterBatch(batchId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
  };
}

export type ContentTabField = 'references' | 'slm' | 'ppt' | 'artifacts';

export interface ContentItemRow {
  id: string;
  title: string;
  type: string;
  url?: string | null;
  filePath?: string | null;
  fileUrl?: string | null;
  file_path?: string | null;
  file_url?: string | null;
  description?: string | null;
  createdAt?: string;
  created_at?: string;
}

export function normalizeContentItem(row: ContentItemRow) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    url: row.url ?? null,
    filePath: row.filePath ?? row.file_path ?? null,
    fileUrl: row.fileUrl ?? row.file_url ?? null,
    description: row.description ?? null,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
  };
}

export function patchContentMasterSessionItem(
  qc: QueryClient,
  opts: {
    courseId: string;
    batchId?: string;
    moduleId: string;
    field: ContentTabField;
    item: ContentItemRow;
  },
) {
  const normalized = normalizeContentItem(opts.item);

  const patchSections = (sections: CmSectionGroup[]) =>
    sections.map((sec) => ({
      ...sec,
      sessions: sec.sessions.map((s) => {
        if (s.id !== opts.moduleId) return s;
        const existing = (s[opts.field] as ContentItemRow[] | undefined) ?? [];
        if (existing.some((x) => x.id === normalized.id)) return s;
        return { ...s, [opts.field]: [...existing, normalized] };
      }),
    }));

  qc.setQueryData(contentMasterCourseKey(opts.courseId), (old: ContentMasterCourseData | undefined) => {
    if (!old?.sections) return old;
    return { ...old, sections: patchSections(old.sections) };
  });

  if (opts.batchId) {
    qc.setQueryData(
      contentMasterBatchKey(opts.batchId),
      (old: { batch: Record<string, unknown>; sections: CmSectionGroup[] } | undefined) => {
        if (!old?.sections) return old;
        return { ...old, sections: patchSections(old.sections) };
      },
    );
  }
}

export function removeContentMasterSessionItem(
  qc: QueryClient,
  opts: {
    courseId: string;
    batchId?: string;
    moduleId: string;
    field: ContentTabField;
    itemId: string;
  },
) {
  const filterSections = (sections: CmSectionGroup[]) =>
    sections.map((sec) => ({
      ...sec,
      sessions: sec.sessions.map((s) => {
        if (s.id !== opts.moduleId) return s;
        const arr = (s[opts.field] as { id: string }[] | undefined) ?? [];
        return { ...s, [opts.field]: arr.filter((x) => x.id !== opts.itemId) };
      }),
    }));

  qc.setQueryData(contentMasterCourseKey(opts.courseId), (old: ContentMasterCourseData | undefined) => {
    if (!old?.sections) return old;
    return { ...old, sections: filterSections(old.sections) };
  });

  if (opts.batchId) {
    qc.setQueryData(
      contentMasterBatchKey(opts.batchId),
      (old: { batch: Record<string, unknown>; sections: CmSectionGroup[] } | undefined) => {
        if (!old?.sections) return old;
        return { ...old, sections: filterSections(old.sections) };
      },
    );
  }
}

/** Force-refresh content-master caches from server (after upload/delete) */
export async function refetchContentMaster(
  qc: QueryClient,
  opts: { courseId: string; batchId?: string },
) {
  await qc.fetchQuery({
    queryKey: contentMasterCourseKey(opts.courseId),
    queryFn: () => fetchContentMasterCourse(opts.courseId),
    staleTime: 0,
  });
  if (opts.batchId) {
    const batchId = opts.batchId;
    await qc.fetchQuery({
      queryKey: contentMasterBatchKey(batchId),
      queryFn: () => fetchContentMasterBatch(batchId),
      staleTime: 0,
    });
  } else {
    // Course-first upload: every batch view of this course is stale
    await qc.invalidateQueries({ queryKey: ['content-master-batch'] });
  }
}
