'use client';

// What: ComparisonPanels — two <img> panels with `touch-action: none`
//       (D5 — gotcha: ON THE PANELS, never on <html>/<body>). Pointer-
//       event handlers compute a shared {scale, origin} transform from
//       the user's pinch + drag gesture and apply it to BOTH panels
//       identically. Opacity-swap bounce (D4 — no src swap, no
//       crossfade, instant cut) cycles between the two photos when
//       `bouncing` is true, with cadence + timestamps recorded so the
//       parent page can compute median / p95 / drift via bounceTimer().
//       FPS counter overlay sampled every 500ms (D5).
// Why:  This is the core spike artifact — the surface whose iOS Safari
//       behavior decides whether sync zoom + bounce ship in
//       photo-comparison-ui or get deferred.
// Does NOT: Persist any state across reloads. Each session starts
//           fresh.

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type Origin,
  type Point,
  type Transform,
  clampOrigin,
  composeTransform,
  pinchToScale,
} from '../_lib/sync-zoom-transform';
import type { Cadence } from './CadenceControls';

const FPS_SAMPLE_MS = 500;

type GestureState = {
  pointers: Map<number, Point>;
  startPointers: Map<number, Point>;
  startTransform: Transform;
};

/** Two-panel sync-zoom + bounce surface. */
export function ComparisonPanels({
  leftSrc,
  rightSrc,
  cadence,
  bouncing,
  onTimestamp,
  bounds,
}: {
  leftSrc: string;
  rightSrc: string;
  cadence: Cadence;
  bouncing: boolean;
  onTimestamp: (t: number) => void;
  bounds: { width: number; height: number };
}) {
  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    origin: { x: 0, y: 0 },
  });
  const [bounceFrame, setBounceFrame] = useState<0 | 1>(0);
  const [fps, setFps] = useState(0);

  const gestureRef = useRef<GestureState | null>(null);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);

  /* ---- Bounce loop: rAF-driven opacity swap at the configured cadence */
  useEffect(() => {
    if (!bouncing) return;
    let rafId = 0;
    let lastSwap =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    /**
     *
     */
    function tick(now: number) {
      if (now - lastSwap >= cadence) {
        setBounceFrame((f) => (f === 0 ? 1 : 0));
        onTimestamp(now);
        lastSwap = now;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [bouncing, cadence, onTimestamp]);

  /* ---- FPS counter: sample frames every FPS_SAMPLE_MS */
  useEffect(() => {
    let rafId = 0;
    let frames = 0;
    let windowStart =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    /**
     *
     */
    function tick(now: number) {
      frames++;
      const dt = now - windowStart;
      if (dt >= FPS_SAMPLE_MS) {
        setFps(Math.round((frames * 1000) / dt));
        frames = 0;
        windowStart = now;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  /* ---- Pointer handlers shared across both panels */
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = { x: e.clientX, y: e.clientY };
      const next: GestureState = gestureRef.current
        ? {
            pointers: new Map(gestureRef.current.pointers),
            startPointers: new Map(gestureRef.current.startPointers),
            startTransform: gestureRef.current.startTransform,
          }
        : {
            pointers: new Map(),
            startPointers: new Map(),
            startTransform: transform,
          };
      next.pointers.set(e.pointerId, pos);
      next.startPointers.set(e.pointerId, pos);
      next.startTransform = transform;
      gestureRef.current = next;
    },
    [transform]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (!g || !g.pointers.has(e.pointerId)) return;
      const pos = { x: e.clientX, y: e.clientY };
      g.pointers.set(e.pointerId, pos);

      const ids = [...g.pointers.keys()];
      if (ids.length >= 2) {
        const [idA, idB] = ids;
        if (idA === undefined || idB === undefined) return;
        const p0a = g.startPointers.get(idA);
        const p0b = g.startPointers.get(idB);
        const p1a = g.pointers.get(idA);
        const p1b = g.pointers.get(idB);
        if (!p0a || !p0b || !p1a || !p1b) return;
        const nextScale = pinchToScale(
          p0a,
          p0b,
          p1a,
          p1b,
          g.startTransform.scale
        );
        const nextOrigin: Origin = clampOrigin(
          g.startTransform.origin,
          nextScale,
          bounds
        );
        setTransform({ scale: nextScale, origin: nextOrigin });
      } else if (ids.length === 1) {
        const idA = ids[0];
        if (idA === undefined) return;
        const p0a = g.startPointers.get(idA);
        const p1a = g.pointers.get(idA);
        if (!p0a || !p1a) return;
        // Single-touch drag → pan only, when zoomed in
        if (g.startTransform.scale > 1) {
          const dx = p1a.x - p0a.x;
          const dy = p1a.y - p0a.y;
          const nextOrigin = clampOrigin(
            {
              x: g.startTransform.origin.x + dx,
              y: g.startTransform.origin.y + dy,
            },
            g.startTransform.scale,
            bounds
          );
          setTransform({ scale: g.startTransform.scale, origin: nextOrigin });
        }
      }
    },
    [bounds]
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    g.pointers.delete(e.pointerId);
    g.startPointers.delete(e.pointerId);
    if (g.pointers.size === 0) gestureRef.current = null;
  }, []);

  const transformStr = composeTransform(transform);
  const panelStyle: CSSProperties = {
    touchAction: 'none',
    overflow: 'hidden',
  };
  const imgStyle = (frame: 0 | 1): CSSProperties => ({
    transform: transformStr,
    transformOrigin: 'center center',
    opacity: bouncing ? (bounceFrame === frame ? 1 : 0) : frame === 0 ? 1 : 1,
    transition: 'none',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  });

  return (
    <div className="relative" data-testid="comparison-panels">
      <div className="grid gap-4 md:grid-cols-2">
        <div
          ref={leftPanelRef}
          style={panelStyle}
          className="relative aspect-[4/3] w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-testid="panel-left"
        >
          <RawImg
            src={leftSrc}
            alt="Left comparison panel"
            style={imgStyle(0)}
          />
          {bouncing && (
            <RawImg
              src={rightSrc}
              alt="Bounce overlay — right photo"
              style={{ ...imgStyle(1), position: 'absolute', inset: 0 }}
              ariaHidden
            />
          )}
        </div>

        <div
          ref={rightPanelRef}
          style={panelStyle}
          className="relative aspect-[4/3] w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-testid="panel-right"
        >
          <RawImg
            src={rightSrc}
            alt="Right comparison panel"
            style={imgStyle(0)}
          />
          {bouncing && (
            <RawImg
              src={leftSrc}
              alt="Bounce overlay — left photo"
              style={{ ...imgStyle(1), position: 'absolute', inset: 0 }}
              ariaHidden
            />
          )}
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-2 right-2 rounded bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-text-primary-inverse)]"
        data-testid="fps-overlay"
        aria-live="off"
      >
        {fps} fps · scale {transform.scale.toFixed(2)}×
      </div>
    </div>
  );
}

/** Plain <img> wrapper. Spike uses native <img> intentionally — dynamic
 *  transform + opacity-swap bounce overlay would defeat next/image's
 *  optimization layer (which lazy-loads and renders into its own DOM
 *  wrapper). Operator-only surface deleted with photo-comparison-ui (D8),
 *  not perf-critical. */
function RawImg({
  src,
  alt,
  style,
  ariaHidden,
}: {
  src: string;
  alt: string;
  style: CSSProperties;
  ariaHidden?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      style={style}
      draggable={false}
      aria-hidden={ariaHidden}
    />
  );
}
