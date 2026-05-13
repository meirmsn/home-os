'use client';

// What: Path A panel — <input type="file" accept="image/*"
//       capture="environment"> styled as a tappable button. On change
//       reads the File via createImageBitmap (fallback: new Image()) for
//       measured dimensions, surfaces the byte size, then uploads to
//       card-photos Storage via spikePath().
// Why:  Path A is the API surface the production capture-flow PR will
//       ship. Spike validates it end-to-end on iOS Safari (D2).
// Does NOT: Transcode HEIC. Resize. Cache the file. Production capture
//           flow owns those.

import * as Sentry from '@sentry/nextjs';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { spikePath } from '../_lib/storage-path';

type Status =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | {
      kind: 'measured';
      width: number;
      height: number;
      bytes: number;
      usedFallback: boolean;
    }
  | { kind: 'uploading'; width: number; height: number; bytes: number }
  | {
      kind: 'uploaded';
      width: number;
      height: number;
      bytes: number;
      path: string;
    }
  | { kind: 'error'; message: string };

/** Path A panel. `ensureUserId` returns the signed-in user id or null. */
export function CameraPathA({
  ensureUserId,
}: {
  ensureUserId: () => Promise<string | null>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  /**
   *
   */
  async function handleFile(file: File) {
    setStatus({ kind: 'reading' });

    let width = 0;
    let height = 0;
    let usedFallback = false;
    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close?.();
      } else {
        usedFallback = true;
        const dims = await dimsViaImageTag(file);
        width = dims.width;
        height = dims.height;
      }
    } catch (e) {
      Sentry.captureException(e);
      setStatus({
        kind: 'error',
        message: `Could not measure dimensions: ${(e as Error).message}`,
      });
      return;
    }

    const bytes = file.size;
    setStatus({ kind: 'measured', width, height, bytes, usedFallback });

    const userId = await ensureUserId();
    if (!userId) {
      setStatus({
        kind: 'error',
        message: 'No signed-in user — cannot upload.',
      });
      return;
    }

    setStatus({ kind: 'uploading', width, height, bytes });

    try {
      const path = spikePath(userId, 'A', new Date());
      const supabase = createClient();
      const { error } = await supabase.storage
        .from('card-photos')
        .upload(path, file, {
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
  }

  /**
   *
   */
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleFile(file);
  }

  return (
    <article
      className="space-y-4 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)] p-5"
      data-testid="camera-path-a"
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-text-primary-inverse)]">
          Path A — <code>&lt;input capture&gt;</code>
        </h2>
        <p className="text-xs text-[var(--color-text-secondary-inverse)]">
          Native camera launcher. Returns a JPEG <code>File</code>.
        </p>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="sr-only"
        aria-label="Capture photo (Path A)"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status.kind === 'reading' || status.kind === 'uploading'}
        className="block min-h-11 w-full rounded-md bg-[var(--color-monitor)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-primary-inverse)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === 'reading' || status.kind === 'uploading'
          ? 'Working…'
          : 'Capture (Path A)'}
      </button>

      <Readout status={status} />
    </article>
  );
}

/**
 *
 */
function Readout({ status }: { status: Status }) {
  if (status.kind === 'idle') {
    return (
      <p className="text-xs text-[var(--color-text-secondary-inverse)]">
        No capture yet.
      </p>
    );
  }
  if (status.kind === 'reading') {
    return (
      <p
        className="text-xs text-[var(--color-text-secondary-inverse)]"
        aria-live="polite"
      >
        Measuring dimensions…
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
        {'usedFallback' in status && status.usedFallback ? (
          <span className="ml-2 text-[var(--color-watch)]">
            (ImageBitmap unsupported; using &lt;img&gt; fallback)
          </span>
        ) : null}
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

/**
 *
 */
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

/**
 *
 */
async function dimsViaImageTag(
  file: File
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('img.onerror'));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
