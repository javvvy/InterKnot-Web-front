export const DEFAULT_COVER_ASPECT_RATIO = 643 / 408
export const MIN_COVER_ASPECT_RATIO = 0.8
export const FALLBACK_COVER_ASPECT_RATIO = DEFAULT_COVER_ASPECT_RATIO
export const NORMALIZED_LANDSCAPE_RATIO = 4 / 3
export const NORMALIZED_PORTRAIT_RATIO = 3 / 4
export const NORMALIZED_SQUARE_RATIO = 1

export function normalizeCoverAspectRatio(rawRatio: number): number {
  if (rawRatio >= 1.05) return NORMALIZED_LANDSCAPE_RATIO
  if (rawRatio <= 0.95) return NORMALIZED_PORTRAIT_RATIO
  return NORMALIZED_SQUARE_RATIO
}

export function getCoverAspectRatio(coverWidth?: number, coverHeight?: number): number {
  if (coverWidth && coverHeight && coverWidth > 0 && coverHeight > 0) {
    return Math.max(coverWidth / coverHeight, MIN_COVER_ASPECT_RATIO)
  }
  return FALLBACK_COVER_ASPECT_RATIO
}

export function getNormalizedCoverAspectRatio(coverWidth?: number, coverHeight?: number): number {
  if (coverWidth && coverHeight && coverWidth > 0 && coverHeight > 0) {
    return normalizeCoverAspectRatio(coverWidth / coverHeight)
  }
  return FALLBACK_COVER_ASPECT_RATIO
}

export function estimateTitleLineCount(
  title: string,
  availableWidth: number,
  fontSize: number,
  maxLines = 2
): number {
  if (!title || availableWidth <= 0) return 1
  let width = 0
  let lines = 1
  for (const char of title) {
    const charWidth = /[一-鿿　-〿＀-￯]/.test(char)
      ? fontSize
      : fontSize * 0.55
    width += charWidth
    if (width > availableWidth) {
      lines++
      width = charWidth
      if (lines >= maxLines) return maxLines
    }
  }
  return lines
}
