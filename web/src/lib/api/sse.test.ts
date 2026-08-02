import { describe, expect, it } from 'vitest'
import { parseSseStream } from './sse'

describe('parseSseStream', () => {
  it('可以解析跨数据块的团队 SSE 事件', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: status\ndata: {"phase":"rout'))
        controller.enqueue(
          encoder.encode('ing"}\n\nevent: delta\ndata: {"text":"你好"}\n\n'),
        )
        controller.close()
      },
    })
    const events = []

    for await (const event of parseSseStream(stream)) events.push(event)

    expect(events).toEqual([
      { event: 'status', data: '{"phase":"routing"}' },
      { event: 'delta', data: '{"text":"你好"}' },
    ])
  })
})
