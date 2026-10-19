export interface SseFrame {
  event: string
  data: string
}

function parseFrame(frame: string): SseFrame | null {
  let event = 'message'
  const data: string[] = []

  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }

  return data.length > 0 ? { event, data: data.join('\n') } : null
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel()
        return
      }

      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        const parsed = parseFrame(frame)
        if (parsed) yield parsed
      }

      if (done) break
    }

    const remaining = parseFrame(buffer)
    if (remaining) yield remaining
  } finally {
    reader.releaseLock()
  }
}
