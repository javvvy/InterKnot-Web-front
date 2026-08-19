export const DEFAULT_PAGE_SIZE = 20

export function parseStart(endCursor: string): number {
  const n = parseInt(endCursor, 10)
  return isNaN(n) ? 0 : n
}

export interface BackendPaginationMeta {
  start: number
  limit: number
  total?: number
  pageCount?: number
}

export function buildPagination<T>(
  nodes: T[],
  start: number,
  meta?: BackendPaginationMeta
) {
  const limit = meta?.limit ?? DEFAULT_PAGE_SIZE
  const endCursor = String(start + limit)
  let hasNextPage: boolean
  if (meta?.total != null) {
    hasNextPage = start + limit < meta.total
  } else {
    hasNextPage = nodes.length >= DEFAULT_PAGE_SIZE
  }
  return { nodes, endCursor, hasNextPage }
}
