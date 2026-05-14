'use client';

// What: Capture form (D13). Single screen, mobile-first, stacked fields:
//       New/Update toggle, description textarea, photo input (Path A),
//       system_tag select, room_tag input, submit. Holds the photo File
//       in React state (D11 — no localStorage mirror; § Gotchas memory
//       budget). On submit, POSTs multipart/form-data to /api/card and
//       routes to /home on 201. On 429 swaps Submit for a cap-hit banner
//       and preserves all form state.
// Why:  Only place a homeowner creates a new card (D1). The cap-hit
//       preservation is the user-facing contract — refresh-loses-draft
//       trade-off is documented (D11).
// Does NOT: Persist drafts to localStorage (D11 — multi-MB photo blobs
//           would blow quota; privacy footprint). Does not call
//           /api/triage (D7 — cards land in `capturing`).

import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { posthog } from '@/lib/posthog';

/** Mirror of the system_tag Postgres enum — keep in lockstep with the
 *  route handler's SYSTEM_TAGS. */
const SYSTEM_TAGS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'roof', label: 'Roof' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'safety', label: 'Safety' },
  { value: 'other', label: 'Other' },
] as const;

const DESCRIPTION_MAX = 2000;
const ROOM_TAG_MAX = 80;

type Mode = 'new' | 'update';
type Stage = 'idle' | 'submitting' | 'submitted-with-photo-error';

type ServerError =
  | { kind: 'cap_hit'; resets_on: string }
  | { kind: 'validation'; fields: Record<string, string> }
  | { kind: 'generic' }
  | null;

/** Human-friendly date label, e.g. "Mon, Jan 6". */
function humanDate(iso: string): string {
  // iso = YYYY-MM-DD; build at UTC noon so the local-rendered weekday
  // matches the server's Monday-UTC anchor across timezones close to UTC.
  const date = new Date(`${iso}T12:00:00Z`);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** The capture form — see file header. */
export function CaptureForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('new');
  const [description, setDescription] = useState('');
  const [systemTag, setSystemTag] = useState<string>('');
  const [roomTag, setRoomTag] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [serverError, setServerError] = useState<ServerError>(null);

  // Fire capture_started once per session-mount via a ref guard so a
  // re-render-induced re-run never re-fires (D9).
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    posthog.capture('capture_started', {});
  }, []);

  // Release any object URLs we minted for the preview thumbnail.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const onPhotoChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      if (!file) {
        setPhoto(null);
        setPhotoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }
      setPhoto(file);
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    },
    []
  );

  const trimmedDesc = description.trim();
  const trimmedRoom = roomTag.trim();
  const isValid =
    trimmedDesc.length > 0 &&
    trimmedDesc.length <= DESCRIPTION_MAX &&
    !!systemTag &&
    trimmedRoom.length > 0 &&
    trimmedRoom.length <= ROOM_TAG_MAX;

  /**
   *
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === 'submitting' || !isValid) return;
    setStage('submitting');
    setServerError(null);

    const touchpointId = crypto.randomUUID();
    const fd = new FormData();
    fd.append('description', trimmedDesc);
    fd.append('system_tag', systemTag);
    fd.append('room_tag', trimmedRoom);
    fd.append('touchpoint_id', touchpointId);
    if (photo) fd.append('photo', photo);

    let response: Response;
    try {
      response = await fetch('/api/card', { method: 'POST', body: fd });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { surface: 'CaptureForm', stage: 'fetch' },
      });
      setServerError({ kind: 'generic' });
      setStage('idle');
      return;
    }

    if (response.status === 201) {
      const json = (await response.json()) as { photo_uploaded: boolean };
      posthog.capture('capture_completed', {
        has_photo: !!photo,
        system_tag: systemTag,
        room_tag_length: trimmedRoom.length,
        is_update: false,
      });
      // If the photo upload partially failed but the card persisted, the
      // route returns 201 with photo_uploaded:false. We still route the
      // user away — eng-review § Rescue #1 — but capture the warning.
      if (photo && !json.photo_uploaded) {
        Sentry.captureException(
          new Error('Photo upload failed but card persisted'),
          { tags: { surface: 'CaptureForm', stage: 'photo_partial' } }
        );
      }
      router.push('/home');
      router.refresh();
      return;
    }

    if (response.status === 429) {
      const json = (await response.json()) as { resets_on: string };
      posthog.capture('capture_cap_hit', { resets_on: json.resets_on });
      setServerError({ kind: 'cap_hit', resets_on: json.resets_on });
      setStage('idle');
      return;
    }

    if (response.status === 400) {
      const json = (await response.json()) as {
        fields?: Record<string, string>;
      };
      setServerError({ kind: 'validation', fields: json.fields ?? {} });
      setStage('idle');
      return;
    }

    Sentry.captureException(
      new Error(`Unexpected POST /api/card status ${response.status}`),
      { tags: { surface: 'CaptureForm', stage: 'unexpected_status' } }
    );
    setServerError({ kind: 'generic' });
    setStage('idle');
  }

  if (mode === 'update') {
    return (
      <section
        aria-label="Capture mode"
        className="space-y-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
      >
        <ModeToggle mode={mode} onChange={setMode} />
        <p className="text-sm text-[var(--color-text-secondary-inverse)]">
          Updating existing cards ships in the next release — for now, please
          create a new card.
        </p>
      </section>
    );
  }

  const capHit = serverError?.kind === 'cap_hit' ? serverError : null;
  const validationFields =
    serverError?.kind === 'validation' ? serverError.fields : null;

  return (
    <form
      className="space-y-5"
      onSubmit={handleSubmit}
      aria-label="Capture an issue"
    >
      <ModeToggle mode={mode} onChange={setMode} />

      {serverError?.kind === 'generic' && (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-border-danger)] bg-[var(--color-surface-danger)] px-3 py-2 text-sm text-[var(--color-text-danger)]"
        >
          Couldn&rsquo;t save — try again in a moment.
        </p>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-[var(--color-text-primary-inverse)]">
          What&rsquo;s going on?
        </span>
        <textarea
          name="description"
          required
          maxLength={DESCRIPTION_MAX}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={stage === 'submitting'}
          className="block w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-surface-input)] px-3 py-2.5 text-sm text-[var(--color-text-primary-inverse)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          placeholder="Describe the issue in a sentence or two…"
        />
        {description.length > 1500 && (
          <span className="block text-xs text-[var(--color-text-secondary-inverse)]">
            {description.length}/{DESCRIPTION_MAX}
          </span>
        )}
        {validationFields?.description && (
          <span
            role="alert"
            className="block text-xs text-[var(--color-text-danger)]"
          >
            {validationFields.description}
          </span>
        )}
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-[var(--color-text-primary-inverse)]">
          Photo{' '}
          <span className="text-[var(--color-text-secondary-inverse)]">
            (optional)
          </span>
        </span>
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          onChange={onPhotoChange}
          disabled={stage === 'submitting'}
          className="block w-full text-sm text-[var(--color-text-primary-inverse)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-surface-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-text-on-primary)] hover:file:bg-[var(--color-surface-primary-hover)]"
        />
        {photo && photoUrl && (
          <div className="flex items-center gap-3 pt-2">
            <img
              src={photoUrl}
              alt="Selected"
              className="h-16 w-16 rounded-md object-cover"
            />
            <span className="text-xs text-[var(--color-text-secondary-inverse)]">
              {Math.round(photo.size / 1024)} KB
            </span>
          </div>
        )}
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-[var(--color-text-primary-inverse)]">
          System
        </span>
        <select
          name="system_tag"
          required
          value={systemTag}
          onChange={(e) => setSystemTag(e.target.value)}
          disabled={stage === 'submitting'}
          className="block w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-surface-input)] px-3 py-2.5 text-sm text-[var(--color-text-primary-inverse)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
        >
          <option value="" disabled>
            Pick a system…
          </option>
          {SYSTEM_TAGS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {validationFields?.system_tag && (
          <span
            role="alert"
            className="block text-xs text-[var(--color-text-danger)]"
          >
            {validationFields.system_tag}
          </span>
        )}
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-[var(--color-text-primary-inverse)]">
          Room
        </span>
        <input
          type="text"
          name="room_tag"
          required
          maxLength={ROOM_TAG_MAX}
          value={roomTag}
          onChange={(e) => setRoomTag(e.target.value)}
          disabled={stage === 'submitting'}
          className="block w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-surface-input)] px-3 py-2.5 text-sm text-[var(--color-text-primary-inverse)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          placeholder="Kitchen, Garage, Master bath…"
        />
        {validationFields?.room_tag && (
          <span
            role="alert"
            className="block text-xs text-[var(--color-text-danger)]"
          >
            {validationFields.room_tag}
          </span>
        )}
      </label>

      {capHit ? (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-border-warning)] bg-[var(--color-surface-warning)] px-3 py-3 text-sm text-[var(--color-text-warning)]"
        >
          You&rsquo;ve logged 20 issues this week — cap resets{' '}
          <strong>{humanDate(capHit.resets_on)}</strong>. Your description and
          photo are saved here.
        </div>
      ) : (
        <button
          type="submit"
          disabled={!isValid || stage === 'submitting'}
          aria-disabled={!isValid || stage === 'submitting'}
          className="block min-h-11 w-full rounded-md bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stage === 'submitting' ? 'Saving…' : 'Save card'}
        </button>
      )}
    </form>
  );
}

/** Two-button inline toggle: "New issue" / "Update existing" (D4). */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Capture mode"
      className="inline-flex rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-input)] p-0.5 text-xs font-medium"
    >
      <button
        type="button"
        aria-pressed={mode === 'new'}
        onClick={() => onChange('new')}
        className={`min-h-9 rounded px-3 py-1.5 ${mode === 'new' ? 'bg-[var(--color-surface-primary)] text-[var(--color-text-on-primary)]' : 'text-[var(--color-text-secondary-inverse)]'}`}
      >
        New issue
      </button>
      <button
        type="button"
        aria-pressed={mode === 'update'}
        onClick={() => onChange('update')}
        className={`min-h-9 rounded px-3 py-1.5 ${mode === 'update' ? 'bg-[var(--color-surface-primary)] text-[var(--color-text-on-primary)]' : 'text-[var(--color-text-secondary-inverse)]'}`}
      >
        Update existing
      </button>
    </div>
  );
}
