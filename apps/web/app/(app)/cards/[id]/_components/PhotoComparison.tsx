'use client';

// What: Full-bleed client comparison surface for a card's photographed
//       moments. Side-by-side panels with synchronized pinch-zoom/pan over a
//       single shared {scale, origin} transform. Date pickers, slot selector,
//       bounce mode + missing-slot handling layer on in later tasks.
// Why:  spec § D1/D2 — the differentiated comparison experience (sync zoom,
//       then bounce) lives here, owning all interaction state so the server
//       route only passes signed URLs + metadata.
// Does NOT: Fetch or sign URLs (the route does that). Doesn't set
//           touch-action on html/body — only on the two panels (spec G1) so
//           page scroll outside the panels is unaffected.

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import type { CompareTouchpoint } from '../compare/_lib/group-touchpoints';
import {
  type Origin,
  type Point,
  type Transform,
  clampOrigin,
  composeTransform,
  pinchToScale,
} from '../compare/_lib/sync-zoom-transform';

export type PhotoComparisonProps = {
  cardId: string;
  issueName: string;
  cardState: string;
  /** Sorted by date ascending, length >= 2 (the route gates < 2). */
  touchpoints: CompareTouchpoint[];
};

type GestureState = {
  pointers: Map<number, Point>;
  startPointers: Map<number, Point>;
  startTransform: Transform;
};

/** UTC-ISO -> human-readable short date (e.g. "Wed, May 15"). */
function humanDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Full-bleed photo-comparison surface — see file header. */
export function PhotoComparison({
  cardId,
  issueName,
  touchpoints,
}: PhotoComparisonProps) {
  // Default pair: earliest (A) vs latest (B). touchpoints is sorted asc and
  // has length >= 2, so [0] and [last] are distinct (spec § D3, G8).
  const dateAId = touchpoints[0]!.id;
  const dateBId = touchpoints[touchpoints.length - 1]!.id;
  const slot = 'wide' as const;

  const tpA = touchpoints.find((t) => t.id === dateAId)!;
  const tpB = touchpoints.find((t) => t.id === dateBId)!;
  const urlA = tpA.photos[slot];
  const urlB = tpB.photos[slot];

  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    origin: { x: 0, y: 0 },
  });
  const gestureRef = useRef<GestureState | null>(null);
  const panelBoundsRef = useRef<{ width: number; height: number }>({
    width: 1,
    height: 1,
  });

  const captureBounds = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      panelBoundsRef.current = { width: rect.width, height: rect.height };
    }
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      captureBounds(e);
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = { x: e.clientX, y: e.clientY };
      const next: GestureState = gestureRef.current
        ? {
            pointers: new Map(gestureRef.current.pointers),
            startPointers: new Map(gestureRef.current.startPointers),
            startTransform: transform,
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
    [captureBounds, transform]
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || !g.pointers.has(e.pointerId)) return;
    const bounds = panelBoundsRef.current;
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
      // One-finger drag pans both panels — only meaningful when zoomed in.
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
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    g.pointers.delete(e.pointerId);
    g.startPointers.delete(e.pointerId);
    if (g.pointers.size === 0) gestureRef.current = null;
  }, []);

  const resetZoom = useCallback(() => {
    setTransform({ scale: 1, origin: { x: 0, y: 0 } });
    gestureRef.current = null;
  }, []);

  const transformStr = composeTransform(transform);
  const panelStyle: CSSProperties = {
    touchAction: 'none',
    overflow: 'hidden',
  };
  const imgStyle: CSSProperties = {
    transform: transformStr,
    transformOrigin: 'center center',
    transition: 'none',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  };

  return (
    <div
      data-testid="photo-comparison"
      className="flex min-h-dvh flex-col bg-[var(--color-background)]"
    >
      {/* Back affordance — outside the screenshot frame (top-left). */}
      <div className="px-4 pt-4">
        <Link
          href={`/cards/${cardId}`}
          data-testid="compare-back-link"
          className="text-sm text-[var(--color-text-secondary)] underline-offset-2 hover:underline"
        >
          Back to issue
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-2 py-3">
        {/* 1 — Issue name */}
        <h1
          data-testid="compare-issue-name"
          className="text-center text-sm font-medium text-[var(--color-text-primary-inverse)]"
        >
          {issueName}
        </h1>

        {/* 2 — Photo A / Photo B panels, butted edge-to-edge on mobile. */}
        <div className="grid grid-cols-2 gap-0">
          <div
            style={panelStyle}
            className="relative aspect-[3/4] w-full bg-[var(--color-background-raised)]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={resetZoom}
            data-testid="compare-panel-a"
          >
            {urlA ? (
              <img
                src={urlA}
                alt="Photo A"
                style={imgStyle}
                draggable={false}
                data-testid="compare-img-a"
              />
            ) : null}
          </div>
          <div
            style={panelStyle}
            className="relative aspect-[3/4] w-full bg-[var(--color-background-raised)]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={resetZoom}
            data-testid="compare-panel-b"
          >
            {urlB ? (
              <img
                src={urlB}
                alt="Photo B"
                style={imgStyle}
                draggable={false}
                data-testid="compare-img-b"
              />
            ) : null}
          </div>
        </div>

        {/* 3 — Date A / Date B, below the panels, never overlaid. */}
        <div className="grid grid-cols-2 gap-0 text-center">
          <p
            data-testid="compare-date-a"
            className="text-xs text-[var(--color-text-secondary)]"
          >
            {humanDate(tpA.date)}
          </p>
          <p
            data-testid="compare-date-b"
            className="text-xs text-[var(--color-text-secondary)]"
          >
            {humanDate(tpB.date)}
          </p>
        </div>

        {/* 4 — Home OS wordmark, centered. */}
        <p
          data-testid="compare-wordmark"
          className="text-center text-[12px] text-[var(--color-text-secondary)]"
        >
          Home OS
        </p>

        {/* 5 — Controls (zoom reset for now; pickers/bounce in later tasks). */}
        <div className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-2">
          {transform.scale > 1 && (
            <button
              type="button"
              onClick={resetZoom}
              data-testid="compare-reset-zoom"
              className="min-h-11 rounded-md border border-[var(--color-border-default)] px-3 py-2 text-sm text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-background-raised)]"
            >
              Reset zoom
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
