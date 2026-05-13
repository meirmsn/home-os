'use client';

// What: /spike/comparison sync-zoom + bounce-mode test surface (D4 +
//       D5 + D6). Renders the ComparisonPanels with two photos and the
//       CadenceControls strip. Owns the bounce-timestamp ring buffer
//       and computes median / p95 / drift via bounceTimer() for the
//       live readout.
// Why:  Operator picks cadence + toggles bounce + observes drift / FPS
//       readouts on real iPhone Safari. Findings dictate whether sync
//       zoom and bounce ship in photo-comparison-ui or get deferred.
// Does NOT: Persist state, queue retries, or fall back gracefully when
//           Storage.list errors — error is caught + logged via Sentry,
//           bundled samples stay visible.

import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CadenceControls, type Cadence } from '../_components/CadenceControls';
import { ComparisonPanels } from '../_components/ComparisonPanels';
import { bounceTimer } from '../_lib/bounce-timer';
import { createClient } from '@/lib/supabase/client';

const SAMPLE_LEFT = '/spike/sample-left.jpg';
const SAMPLE_RIGHT = '/spike/sample-right.jpg';
const TIMESTAMP_WINDOW = 60; // last-60-swap window per spec § Screens

/** /spike/comparison — sync-zoom + bounce test surface. */
export default function SpikeComparisonPage() {
  const [cadence, setCadence] = useState<Cadence>(750);
  const [bouncing, setBouncing] = useState(false);
  const [useOwnPhotos, setUseOwnPhotos] = useState(false);
  const [ownPhotos, setOwnPhotos] = useState<{
    left: string;
    right: string;
  } | null>(null);
  const [ownPhotosError, setOwnPhotosError] = useState<string | null>(null);
  const [timestamps, setTimestamps] = useState<number[]>([]);

  const timestampsRef = useRef<number[]>([]);
  const onTimestamp = useCallback((t: number) => {
    const next = [...timestampsRef.current, t].slice(-TIMESTAMP_WINDOW);
    timestampsRef.current = next;
    setTimestamps(next);
  }, []);

  // Clear timestamps when cadence or bouncing changes — mixing cadence
  // windows would corrupt the drift readout. Reset is done in the
  // wrapper handlers (not a useEffect) per React's "you might not need
  // an effect" guidance — the dep change is event-driven, not synced
  // from an external system.
  const onCadenceChange = useCallback((c: Cadence) => {
    timestampsRef.current = [];
    setTimestamps([]);
    setCadence(c);
  }, []);
  const onBouncingChange = useCallback((b: boolean) => {
    timestampsRef.current = [];
    setTimestamps([]);
    setBouncing(b);
  }, []);

  // Toggle handler also resets the own-photos cache when flipping off,
  // so the effect below doesn't need a synchronous setState branch.
  const onUseOwnPhotosChange = useCallback((v: boolean) => {
    if (!v) {
      setOwnPhotos(null);
      setOwnPhotosError(null);
    }
    setUseOwnPhotos(v);
  }, []);

  // Load operator's two most-recent spike uploads when the toggle
  // flips on. List + signed-URL fetch fire once per toggle.
  useEffect(() => {
    if (!useOwnPhotos) return;
    let cancelled = false;
    /**
     *
     */
    async function loadOwn() {
      try {
        const supabase = createClient();
        const { data: userData, error: userErr } =
          await supabase.auth.getUser();
        if (userErr || !userData.user) {
          setOwnPhotosError('Not signed in');
          return;
        }
        const userId = userData.user.id;
        const { data: list, error: listErr } = await supabase.storage
          .from('card-photos')
          .list(`${userId}/spike`, {
            limit: 2,
            sortBy: { column: 'created_at', order: 'desc' },
          });
        if (listErr) {
          Sentry.captureException(listErr);
          setOwnPhotosError(listErr.message);
          return;
        }
        if (!list || list.length < 2) {
          setOwnPhotosError('Need two spike uploads (visit /spike/camera).');
          return;
        }
        const [first, second] = list;
        if (!first || !second) {
          setOwnPhotosError('Need two spike uploads (visit /spike/camera).');
          return;
        }
        const [{ data: leftSigned }, { data: rightSigned }] = await Promise.all(
          [
            supabase.storage
              .from('card-photos')
              .createSignedUrl(`${userId}/spike/${first.name}`, 60 * 10),
            supabase.storage
              .from('card-photos')
              .createSignedUrl(`${userId}/spike/${second.name}`, 60 * 10),
          ]
        );
        if (cancelled) return;
        if (!leftSigned?.signedUrl || !rightSigned?.signedUrl) {
          setOwnPhotosError('Could not sign URLs for spike uploads.');
          return;
        }
        setOwnPhotos({
          left: leftSigned.signedUrl,
          right: rightSigned.signedUrl,
        });
        setOwnPhotosError(null);
      } catch (e) {
        Sentry.captureException(e);
        if (!cancelled) setOwnPhotosError((e as Error).message);
      }
    }
    void loadOwn();
    return () => {
      cancelled = true;
    };
  }, [useOwnPhotos]);

  const stats = bounceTimer({ cadence, timestamps });

  const leftSrc = useOwnPhotos && ownPhotos ? ownPhotos.left : SAMPLE_LEFT;
  const rightSrc = useOwnPhotos && ownPhotos ? ownPhotos.right : SAMPLE_RIGHT;

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary-inverse)]">
          Spike — comparison
        </h1>
        <p className="text-sm text-[var(--color-text-secondary-inverse)]">
          Pinch on either panel — the other follows. Tap a cadence + Start
          bounce to alternate the two photos via opacity swap (no crossfade,
          instant cut). Record FPS + drift findings in{' '}
          <code>.gstack/pwa-spike-result.md</code>.
        </p>
      </header>

      {ownPhotosError && (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-watch)] bg-[var(--color-background-raised)] px-3 py-2 text-xs text-[var(--color-watch)]"
        >
          Own-photos load: {ownPhotosError}. Showing bundled samples.
        </p>
      )}

      <ComparisonPanels
        leftSrc={leftSrc}
        rightSrc={rightSrc}
        cadence={cadence}
        bouncing={bouncing}
        onTimestamp={onTimestamp}
        bounds={{ width: 400, height: 300 }}
      />

      <CadenceControls
        cadence={cadence}
        onCadenceChange={onCadenceChange}
        bouncing={bouncing}
        onBouncingChange={onBouncingChange}
        useOwnPhotos={useOwnPhotos}
        onUseOwnPhotosChange={onUseOwnPhotosChange}
        ownPhotosAvailable={ownPhotos !== null}
      />

      <dl
        className="grid grid-cols-2 gap-3 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)] p-4 text-xs text-[var(--color-text-secondary-inverse)] md:grid-cols-4"
        data-testid="readouts"
        aria-live="polite"
      >
        <Stat label="Cadence">{cadence} ms</Stat>
        <Stat label="Median">
          {stats.count > 0 ? `${stats.median.toFixed(0)} ms` : '—'}
        </Stat>
        <Stat label="p95">
          {stats.count > 0 ? `${stats.p95.toFixed(0)} ms` : '—'}
        </Stat>
        <Stat label="Drift">
          {stats.count > 0 ? `${stats.drift}/${stats.count}` : '—'}
        </Stat>
      </dl>
    </section>
  );
}

/**
 *
 */
function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[var(--color-text-secondary-inverse)]">{label}</dt>
      <dd className="text-sm font-medium text-[var(--color-text-primary-inverse)]">
        {children}
      </dd>
    </div>
  );
}
