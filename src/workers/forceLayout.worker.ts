import type { Edge, PositionedNode } from '@/src/types/topology'
import { runForceLayout } from '@/src/lib/forceLayout'

type InitMessage = {
  type: 'INIT'
  payload: { nodes: PositionedNode[]; edges: Edge[]; width: number; height: number }
}
type ResizeMessage = { type: 'RESIZE'; payload: { width: number; height: number } }
type StopMessage = { type: 'STOP' }

type WorkerMessage = InitMessage | ResizeMessage | StopMessage

let nodes: PositionedNode[] = []
let edges: Edge[] = []
let width = 1200
let height = 640
let frame = 0
let timer: ReturnType<typeof setInterval> | null = null

function postSnapshot() {
  postMessage({ type: 'TICK', payload: { nodes, edges } })
}

function start() {
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    runForceLayout(nodes, edges, { width, height, iterations: 1 })
    frame += 1
    // 60 physics updates/sec; transfer render positions at 30 FPS.
    if (frame % 2 === 0) postSnapshot()
  }, 1000 / 60)
}

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data
  if (msg.type === 'INIT') {
    nodes = msg.payload.nodes
    edges = msg.payload.edges
    width = msg.payload.width
    height = msg.payload.height
    postSnapshot()
    start()
  } else if (msg.type === 'RESIZE') {
    width = msg.payload.width
    height = msg.payload.height
  } else if (msg.type === 'STOP' && timer) {
    clearInterval(timer)
    timer = null
  }
})
