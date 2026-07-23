"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runForceLayout } from "@/src/lib/forceLayout";
import type { Edge, PositionedNode } from "@/src/types/topology";

const HEIGHT = 640;
const CELL_SIZE = 100;
const NODE_RADIUS = 4;

type SpatialHash = Map<string, PositionedNode[]>;
type Hover = { node: PositionedNode; x: number; y: number } | null;

function createWorker(): Worker | null {
  try {
    return new Worker(
      new URL("../../workers/forceLayout.worker.ts", import.meta.url),
    );
  } catch {
    return null;
  }
}

function cellKey(cx: number, cy: number) {
  return `${cx}:${cy}`;
}

function buildSpatialHash(nodes: PositionedNode[]): SpatialHash {
  const hash: SpatialHash = new Map();
  for (const node of nodes) {
    const cx = Math.floor(node.x / CELL_SIZE);
    const cy = Math.floor(node.y / CELL_SIZE);
    const key = cellKey(cx, cy);
    const bucket = hash.get(key);
    if (bucket) bucket.push(node);
    else hash.set(key, [node]);
  }
  return hash;
}

function latencyColor(latencyMs: number) {
  if (latencyMs < 80) return "rgba(34,197,94,0.5)";
  if (latencyMs < 180) return "rgba(250,204,21,0.5)";
  return "rgba(248,113,113,0.55)";
}

function statusColor(status: PositionedNode["status"]) {
  if (status === "offline") return "#f87171";
  if (status === "syncing") return "#facc15";
  return "#22c55e";
}

class TopologyCanvas {
  private edgePathCache = new Map<string, Path2D>();
  private topologyKey = "";

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    nodes: PositionedNode[],
    edges: Edge[],
    hover: PositionedNode | null,
  ) {
    ctx.clearRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);
    this.drawEdges(ctx, nodes, edges);
    this.drawNodes(ctx, width, height, nodes);
    if (hover) this.drawSelection(ctx, hover);
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) {
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEdges(
    ctx: CanvasRenderingContext2D,
    nodes: PositionedNode[],
    edges: Edge[],
  ) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const key = `${nodes.length}:${edges.length}`;
    if (key !== this.topologyKey) {
      this.edgePathCache.clear();
      this.topologyKey = key;
    }

    ctx.save();
    ctx.lineWidth = 0.8;
    for (const edge of edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      let path = this.edgePathCache.get(edge.id);
      if (!path) {
        path = new Path2D();
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2 - 18;
        path.moveTo(source.x, source.y);
        path.quadraticCurveTo(midX, midY, target.x, target.y);
        this.edgePathCache.set(edge.id, path);
      }
      ctx.strokeStyle = latencyColor(edge.latencyMs);
      ctx.stroke(path);

      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      ctx.fillStyle = latencyColor(edge.latencyMs);
      ctx.beginPath();
      ctx.moveTo(target.x, target.y);
      ctx.lineTo(
        target.x - 8 * Math.cos(angle - 0.35),
        target.y - 8 * Math.sin(angle - 0.35),
      );
      ctx.lineTo(
        target.x - 8 * Math.cos(angle + 0.35),
        target.y - 8 * Math.sin(angle + 0.35),
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawNodes(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    nodes: PositionedNode[],
  ) {
    const cx = width / 2;
    const cy = height / 2;
    const maxDistance = Math.hypot(cx, cy);
    ctx.save();
    for (const node of nodes) {
      const distanceRatio = Math.hypot(node.x - cx, node.y - cy) / maxDistance;
      const full = distanceRatio <= 0.25;
      const radius = distanceRatio > 0.5 ? 2 : NODE_RADIUS;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = statusColor(node.status);
      ctx.fill();
      if (full) {
        ctx.strokeStyle = "rgba(226,232,240,0.75)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "rgba(226,232,240,0.9)";
        ctx.fillText(node.label, node.x + 7, node.y - 7);
      }
    }
    ctx.restore();
  }

  private drawSelection(ctx: CanvasRenderingContext2D, node: PositionedNode) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

export function NodeTopologyMap({
  nodes,
  edges,
}: {
  nodes: PositionedNode[];
  edges: Edge[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef(new TopologyCanvas());
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number | null>(null);
  const nodesRef = useRef<PositionedNode[]>(nodes);
  const spatialRef = useRef<SpatialHash>(buildSpatialHash(nodes));
  const [size, setSize] = useState({ width: 0, height: HEIGHT });
  const [hover, setHover] = useState<Hover>(null);
  const gpuMode = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      "gpu" in navigator &&
      nodes.length > 5000,
    [nodes.length],
  );

  const topologyKey = useMemo(
    () => `${nodes.length}:${edges.length}`,
    [nodes.length, edges.length],
  );

  // `gpuMode` is derived from `navigator` capability and `nodes.length`.
  // Computed via `useMemo` above to avoid calling setState inside an effect.

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: HEIGHT });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width === 0) return;
    const initial = nodes.map((node) => ({
      ...node,
      x: node.x + size.width / 2,
      y: node.y + size.height / 2,
    }));
    nodesRef.current = initial;
    spatialRef.current = buildSpatialHash(initial);
    const worker = createWorker();
    workerRef.current = worker;
    if (worker) {
      worker.onmessage = (
        event: MessageEvent<{
          type: "TICK";
          payload: { nodes: PositionedNode[] };
        }>,
      ) => {
        nodesRef.current = event.data.payload.nodes;
        spatialRef.current = buildSpatialHash(event.data.payload.nodes);
      };
      worker.postMessage({
        type: "INIT",
        payload: {
          nodes: initial,
          edges,
          width: size.width,
          height: size.height,
        },
      });
    }
    return () => {
      worker?.postMessage({ type: "STOP" });
      worker?.terminate();
    };
  }, [topologyKey, nodes, edges, size.width, size.height]);

  useEffect(() => {
    workerRef.current?.postMessage({ type: "RESIZE", payload: size });
  }, [size]);

  useEffect(() => {
    const tick = () => {
      if (!workerRef.current) {
        runForceLayout(nodesRef.current, edges, {
          width: size.width,
          height: size.height,
        });
        spatialRef.current = buildSpatialHash(nodesRef.current);
      }
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && size.width > 0) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(size.width * dpr);
        canvas.height = Math.round(size.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rendererRef.current.render(
          ctx,
          size.width,
          size.height,
          nodesRef.current,
          edges,
          hover?.node ?? null,
        );
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [edges, hover, size]);

  const hitTest = useCallback((x: number, y: number) => {
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    let best: PositionedNode | null = null;
    let bestDistance = 14 * 14;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        for (const node of spatialRef.current.get(cellKey(cx + ox, cy + oy)) ??
          []) {
          const d = (node.x - x) ** 2 + (node.y - y) ** 2;
          if (d < bestDistance) {
            bestDistance = d;
            best = node;
          }
        }
      }
    }
    return best;
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {nodes.length.toLocaleString()} validators ·{" "}
          {edges.length.toLocaleString()} consensus channels
        </span>
        <span>
          {gpuMode
            ? "WebGPU-capable point-sprite path available"
            : "Canvas + worker physics"}{" "}
          · spatial hash {CELL_SIZE}px cells
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: HEIGHT }}
      >
        <canvas
          ref={canvasRef}
          aria-label="High-density validator topology canvas"
          className="h-full w-full rounded-xl bg-slate-950/80"
          style={{ width: "100%", height: HEIGHT }}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const node = hitTest(
              event.clientX - rect.left,
              event.clientY - rect.top,
            );
            setHover(
              node
                ? {
                    node,
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                  }
                : null,
            );
          }}
          onMouseLeave={() => setHover(null)}
        />
        {hover && (
          <div
            className="pointer-events-none absolute rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            <div className="font-semibold">{hover.node.label}</div>
            <div className="text-slate-400">
              {hover.node.status} · {hover.node.latencyMs ?? 0}ms
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
