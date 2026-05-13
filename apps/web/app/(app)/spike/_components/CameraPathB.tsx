'use client';

// What: Path B panel — navigator.mediaDevices.getUserMedia preview +
//       "Capture frame" button that draws the current video frame onto
//       an offscreen canvas and exports JPEG via canvas.toBlob(...,
//       'image/jpeg', 0.95). Surfaces measured dimensions, byte size,
//       and the resulting Storage path after upload (D2).
// Why:  Path B validates whether iOS Safari honors the high-resolution
//       getUserMedia constraint hint. If it falls back below sensor
//       resolution, custom in-app preview is permanently shelved
//       (recorded in .gstack/pwa-spike-result.md).
// Does NOT: Show a permission-denied retry button. Operator reloads to
//           retry. Custom preview UI lives downstream; this just
//           captures one frame.

import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { spikePath } from '../_lib/storage-path';

type Status =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'streaming' }
  | { kind: 'capturing' }
  | { kind: 'uploading'; width: number; height: number; bytes: number }
  | {
      kind: 'uploaded';
      width: number;
      height: number;
      bytes: number;
      path: string;
    }
  | { kind: 'error'; message: string };

/** Path B panel. `ensureUserId` returns the signed-in user id or null. */
export function CameraPathB({
  ensureUserId,
}: {
  ensureUserId: () => Promise<string | null>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    return () => {
      // Best-effort teardown so the camera light goes out when the
      // operator navigates away.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    setStatus({ kind: 'requesting' });
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus({
        kind: 'error',
        message: 'mediaDevices.getUserMedia not available in this browser.',
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 4096 },
          height: { ideal: 3072 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {
          // iOS Safari sometimes throws play() if the user hasn't
          // interacted yet. Stream still plays once the operator taps.
        });
      }
      setStatus({ kind: 'streaming' });
    } catch (e) {
      Sentry.captureException(e);
      setStatus({
        kind: 'error',
        message:
          (e as Error).name === 'NotAllowedError'
            ? 'Camera permission denied. Test Path A or grant the permission in Safari settings.'
            : `getUserMedia failed: ${(e as Error).message}`,
      });
    }
  }, []);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || status.kind !== 'streaming') return;
    setStatus({ kind: 'capturing' });

    // Use the video's intrinsic resolution — videoWidth/Height reflects
    // the actual stream resolution iOS Safari handed us, which IS the
    // measurement the spike is supposed to surface.
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setStatus({
        kind: 'error',
        message: '2D canvas context unavailable',
      });
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      // 0.95 quality per spec § Gotchas (Safari default is 0.92).
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95);
    });
    if (!blob) {
      setStatus({
        kind: 'error',
        message: 'canvas.toBlob returned null',
      });
      return;
    }

    const bytes = blob.size;
    setStatus({ kind: 'uploading', width, height, bytes });

    const userId = await ensureUserId();
    if (!userId) {
      setStatus({
        kind: 'error',
        message: 'No signed-in user — cannot upload.',
      });
      return;
    }

    try {
      const path = spikePath(userId, 'B', new Date());
      const supabase = createClient();
      const { error } = await supabase.storage
        .from('card-photos')
        .upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (error) {
        Sentry.captureException(error);
        setStatus({
          kind: 'error',
          message: `Upload failed: ${error.message}`,
        });
        return;
      }
      setStatus({ kind: 'uploaded', width, height, bytes, path });
    } catch (e) {
      Sentry.captureException(e);
      setStatus({
        kind: 'error',
        message: `Upload threw: ${(e as Error).message}`,
      });
    }
  }, [ensureUserId, status.kind]);

  return (
    <article
      className="space-y-4 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)] p-5"
      data-testid="camera-path-b"
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-text-primary-inverse)]">
          Path B — <code>getUserMedia</code>
        </h2>
        <p className="text-xs text-[var(--color-text-secondary-inverse)]">
          Custom preview + canvas frame export at quality 0.95.
        </p>
      </header>

      <video
        ref={videoRef}
        muted
        playsInline
        className="aspect-[4/3] w-full rounded bg-[var(--color-background)]"
        aria-label="Camera preview (Path B)"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={
            status.kind === 'requesting' ||
            status.kind === 'streaming' ||
            status.kind === 'capturing' ||
            status.kind === 'uploading'
          }
          className="min-h-11 flex-1 rounded-md border border-[var(--color-border-subtle)] px-3 py-2.5 text-sm text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.kind === 'requesting'
            ? 'Requesting permission…'
            : status.kind === 'streaming' ||
                status.kind === 'capturing' ||
                status.kind === 'uploading' ||
                status.kind === 'uploaded'
              ? 'Streaming'
              : 'Start preview'}
        </button>
        <button
          type="button"
          onClick={() => void capture()}
          disabled={status.kind !== 'streaming'}
          className="min-h-11 flex-1 rounded-md bg-[var(--color-monitor)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-primary-inverse)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Capture frame
        </button>
      </div>

      <Readout status={status} />
    </article>
  );
}

/** Render the current Path B status as labeled rows (or error chip). */
function Readout({ status }: { status: Status }) {
  if (status.kind === 'idle') {
    return (
      <p className="text-xs text-[var(--color-text-secondary-inverse)]">
        Tap “Start preview” to begin.
      </p>
    );
  }
  if (status.kind === 'requesting') {
    return (
      <p
        className="text-xs text-[var(--color-text-secondary-inverse)]"
        aria-live="polite"
      >
        Requesting camera permission…
      </p>
    );
  }
  if (status.kind === 'streaming') {
    return (
      <p
        className="text-xs text-[var(--color-text-secondary-inverse)]"
        aria-live="polite"
      >
        Streaming. Tap “Capture frame” to snapshot.
      </p>
    );
  }
  if (status.kind === 'capturing') {
    return (
      <p
        className="text-xs text-[var(--color-text-secondary-inverse)]"
        aria-live="polite"
      >
        Capturing frame…
      </p>
    );
  }
  if (status.kind === 'error') {
    return (
      <p
        role="alert"
        className="rounded border border-[var(--color-act-soon)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-act-soon)]"
      >
        {status.message}
      </p>
    );
  }
  return (
    <dl
      className="space-y-1 text-xs text-[var(--color-text-secondary-inverse)]"
      aria-live="polite"
    >
      <Row label="Dimensions">
        {status.width}×{status.height}px
      </Row>
      <Row label="Bytes">{status.bytes.toLocaleString()} B</Row>
      {status.kind === 'uploading' && <Row label="Upload">In progress…</Row>}
      {status.kind === 'uploaded' && (
        <Row label="Storage path">
          <code>{status.path}</code>
        </Row>
      )}
    </dl>
  );
}

/** One <dt>/<dd> pair laid out in a flex row. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="min-w-24 font-medium text-[var(--color-text-primary-inverse)]">
        {label}:
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
