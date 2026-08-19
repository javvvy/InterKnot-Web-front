export interface SkeletonItem {
  id: string
  coverAspectRatio: number
  authorWidth: number
  titleWidth: number
}

const VARIATIONS: Omit<SkeletonItem, 'id'>[] = [
  { coverAspectRatio: 4 / 3, authorWidth: 0.55, titleWidth: 0.85 },
  { coverAspectRatio: 3 / 4, authorWidth: 0.45, titleWidth: 0.9 },
  { coverAspectRatio: 1, authorWidth: 0.5, titleWidth: 0.8 },
  { coverAspectRatio: 4 / 3, authorWidth: 0.6, titleWidth: 0.75 },
  { coverAspectRatio: 3 / 4, authorWidth: 0.5, titleWidth: 0.95 },
  { coverAspectRatio: 1, authorWidth: 0.55, titleWidth: 0.7 },
  { coverAspectRatio: 4 / 3, authorWidth: 0.48, titleWidth: 0.88 },
]

export function calculateSkeletonCount(width: number, isClient: boolean): number {
  if (!isClient) return 12
  if (width >= 1600) return 15
  if (width >= 1200) return 12
  if (width >= 800) return 9
  return 6
}

export function generateSkeletons(count: number): SkeletonItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `skel-${i}`,
    ...VARIATIONS[i % VARIATIONS.length],
  }))
}

const SKELETON_FIXED_HEIGHT = 82

export function estimateSkeletonHeight(item: SkeletonItem, itemWidth: number): number {
  const coverHeight = itemWidth / item.coverAspectRatio
  return Math.ceil(coverHeight + SKELETON_FIXED_HEIGHT)
}
