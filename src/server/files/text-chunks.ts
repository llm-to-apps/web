const defaultChunkSize = 4_000
const defaultChunkOverlap = 400

export type TextChunk = {
  content: string
  endOffset: number
  startOffset: number
}

export function chunkText(
  text: string,
  {
    chunkSize = defaultChunkSize,
    overlap = defaultChunkOverlap
  }: {
    chunkSize?: number
    overlap?: number
  } = {}
): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

  if (!normalized) {
    return []
  }

  const chunks: TextChunk[] = []
  let start = 0

  while (start < normalized.length) {
    const targetEnd = Math.min(start + chunkSize, normalized.length)
    const end = findChunkEnd(normalized, start, targetEnd, chunkSize)
    const content = normalized.slice(start, end).trim()

    if (content) {
      chunks.push({
        content,
        endOffset: end,
        startOffset: start
      })
    }

    if (end >= normalized.length) {
      break
    }

    start = Math.max(0, end - overlap)
  }

  return chunks
}

function findChunkEnd(text: string, start: number, targetEnd: number, chunkSize: number) {
  if (targetEnd >= text.length) {
    return text.length
  }

  const earliestBoundary = start + Math.floor(chunkSize * 0.75)
  const newline = text.lastIndexOf('\n', targetEnd)
  if (newline > earliestBoundary) {
    return newline
  }

  const space = text.lastIndexOf(' ', targetEnd)
  if (space > earliestBoundary) {
    return space
  }

  return targetEnd
}
