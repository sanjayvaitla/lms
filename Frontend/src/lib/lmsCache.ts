import type { QueryClient } from '@tanstack/react-query';
import { refetchContentMaster } from './contentMasterSessions';

/**
 * Instantly refresh LMS views after mutations so trainers/admins
 * never need a hard browser refresh to see session / content / recording changes.
 */
export async function refreshAfterSessionChange(
  qc: QueryClient,
  opts: { courseId?: string; batchId?: string } = {},
) {
  // Prefix-invalidate first (marks stale). Then force-fetch content-master so
  // Content Master UI updates without waiting on observers.
  const tasks: Promise<unknown>[] = [
    qc.invalidateQueries({ queryKey: ['enrollment-sessions'] }),
    qc.invalidateQueries({ queryKey: ['enrollment-assignments'] }),
    qc.invalidateQueries({ queryKey: ['enrollment-quizzes'] }),
    qc.invalidateQueries({ queryKey: ['enrollment-materials'] }),
    qc.invalidateQueries({ queryKey: ['session-detail'] }),
    qc.invalidateQueries({ queryKey: ['assignments'] }),
    qc.invalidateQueries({ queryKey: ['quizzes-list'] }),
    qc.invalidateQueries({ queryKey: ['quiz-dashboard'] }),
    qc.invalidateQueries({ queryKey: ['assignment-dashboard'] }),
    qc.invalidateQueries({ queryKey: ['course-recordings'] }),
    qc.invalidateQueries({ queryKey: ['all-batches-for-content'] }),
    // FeedbackMaster uses ['batch-sessions', batchId, courseId, ...];
    // BatchMaster uses ['batch-sessions', courseId, batchId] — prefix covers both.
    qc.invalidateQueries({ queryKey: ['batch-sessions'] }),
  ];

  if (opts.courseId) {
    tasks.push(
      qc.invalidateQueries({ queryKey: ['modules', opts.courseId] }),
      qc.invalidateQueries({ queryKey: ['course-modules-asg', opts.courseId] }),
      qc.invalidateQueries({ queryKey: ['course-modules', opts.courseId] }),
      qc.invalidateQueries({ queryKey: ['syllabi', opts.courseId] }),
      qc.refetchQueries({ queryKey: ['course-modules', opts.courseId], type: 'active' }),
    );
  }

  if (opts.batchId) {
    tasks.push(
      qc.invalidateQueries({ queryKey: ['meet-links', opts.batchId] }),
      qc.invalidateQueries({ queryKey: ['batch-recordings', opts.batchId] }),
      qc.invalidateQueries({ queryKey: ['batch-courses', opts.batchId] }),
      qc.refetchQueries({ queryKey: ['meet-links', opts.batchId], type: 'active' }),
      qc.refetchQueries({ queryKey: ['batch-recordings', opts.batchId], type: 'active' }),
      qc.refetchQueries({ queryKey: ['batch-sessions'], type: 'active' }),
    );
  }

  await Promise.all(tasks);

  // Sequenced after invalidation so we don't race two content-master fetches
  if (opts.courseId) {
    await refetchContentMaster(qc, { courseId: opts.courseId, batchId: opts.batchId });
  } else if (opts.batchId) {
    await qc.invalidateQueries({ queryKey: ['content-master-batch', opts.batchId] });
  }
}

/** Broader invalidation after any LMS content mutation */
export async function refreshLmsAfterMutation(
  qc: QueryClient,
  opts: { courseId?: string; batchId?: string } = {},
) {
  await refreshAfterSessionChange(qc, opts);
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['courses'] }),
    qc.invalidateQueries({ queryKey: ['batches'] }),
    qc.invalidateQueries({ queryKey: ['dashboard'] }),
    qc.invalidateQueries({ queryKey: ['student-dashboard'] }),
  ]);
}

/** Generic light invalidation for list pages after create/update/delete. */
export async function refreshLists(
  qc: QueryClient,
  keys: string[][],
) {
  await Promise.all(
    keys.map((queryKey) =>
      Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.refetchQueries({ queryKey, type: 'active' }),
      ]),
    ),
  );
}

/**
 * After a student submits a quiz / assignment / assessment / coding test,
 * mark related caches stale and refetch any currently mounted views.
 * Inactive pages (My Quizzes, Dashboard) refetch on next mount via refetchOnMount.
 */
export async function refreshStudentActivity(
  qc: QueryClient,
  opts: {
    kind?: 'quiz' | 'assignment' | 'assessment' | 'coding' | 'all';
    enrollmentId?: string;
    courseId?: string;
  } = {},
) {
  const kind = opts.kind ?? 'all';
  const keys: string[][] = [['student-dashboard']];

  if (kind === 'quiz' || kind === 'all') {
    keys.push(['enrollment-quizzes'], ['enrollment-sessions'], ['quiz-attempts'], ['quiz-dashboard']);
  }
  if (kind === 'assignment' || kind === 'all') {
    keys.push(
      ['student-assignments'],
      ['enrollment-assignments'],
      ['enrollment-sessions'],
      ['assignment-dashboard'],
      ['assignments'],
    );
  }
  if (kind === 'assessment' || kind === 'all') {
    keys.push(['student-assessments'], ['enrollment-sessions']);
  }
  if (kind === 'coding' || kind === 'all') {
    keys.push(['student-coding-assignments'], ['my-coding-submissions']);
  }

  if (opts.enrollmentId) {
    keys.push(['enrollment-sessions', opts.enrollmentId]);
    if (opts.courseId) {
      keys.push(['enrollment-quizzes', opts.enrollmentId, opts.courseId]);
      keys.push(['enrollment-assignments', opts.enrollmentId, opts.courseId]);
    }
  }

  await refreshLists(qc, keys);
}
