/** Shared list pagination — safe defaults preserve existing clients (array response). */
export const LIST_DEFAULT_LIMIT = 200;
export const LIST_MAX_LIMIT = 500;

export function clampListPagination(page?: number | string, limit?: number | string) {
  const p = Math.max(1, Number(page) || 1);
  const raw = Number(limit) || LIST_DEFAULT_LIMIT;
  const l = Math.min(LIST_MAX_LIMIT, Math.max(1, raw));
  return { page: p, limit: l, offset: (p - 1) * l };
}
