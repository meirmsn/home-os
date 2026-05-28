'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import posthog from 'posthog-js';
// Used by: WalkthroughMode.tsx (dashboard) — cross-route-group import
import { CheckInForm } from '@/app/(app)/cards/[id]/_components/CheckInForm';
import type { CheckInPhoto } from '@/app/(app)/cards/[id]/_components/CheckInTimeline';

export type WalkthroughCard = {
  id: string;
  title: string | null;
  severity: string | null;
  system_tag: string | null;
  photoUrl: string | null;
  referencePhotos: CheckInPhoto[];
  cadenceDays: number;
};

export type WalkthroughModeProps = {
  overdueCards: WalkthroughCard[];
  onExit: () => void;
};

/**
 *
 */
export function WalkthroughMode({
  overdueCards,
  onExit,
}: WalkthroughModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [showPostCheckin, setShowPostCheckin] = useState(false);
  const startedRef = useRef(false);

  const total = overdueCards.length;
  const completed = currentIndex >= total;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    posthog.capture('walkthrough_started', {
      overdue_count: total,
    });
  }, [total]);

  useEffect(() => {
    if (completed && total > 0) {
      posthog.capture('walkthrough_completed', {
        cards_checked: checkedCount,
        cards_skipped: skippedCount,
      });
    }
  }, [completed, total, checkedCount, skippedCount]);

  const handleCheckinDone = useCallback(() => {
    setCheckedCount((c) => c + 1);
    setShowPostCheckin(true);
  }, []);

  const handleKeepMonitoring = useCallback(() => {
    setShowPostCheckin(false);
    setCurrentIndex((i) => i + 1);
  }, []);

  const handleSkip = useCallback(() => {
    setSkippedCount((c) => c + 1);
    setShowPostCheckin(false);
    setCurrentIndex((i) => i + 1);
  }, []);

  if (completed) {
    return (
      <div data-testid="walkthrough-complete" className="py-12 text-center">
        <p className="text-lg font-semibold text-[var(--color-text-primary-inverse)] mb-4">
          All caught up!
        </p>
        <button
          type="button"
          data-testid="walkthrough-return"
          onClick={onExit}
          className="text-sm text-[var(--color-text-primary-inverse)] underline underline-offset-2"
        >
          Return to dashboard
        </button>
      </div>
    );
  }

  const card = overdueCards[currentIndex]!;

  return (
    <div data-testid="walkthrough-mode" className="space-y-4">
      <div className="flex items-center justify-between">
        <span
          data-testid="walkthrough-progress"
          className="text-xs text-[var(--color-text-secondary-inverse)]"
        >
          Card {currentIndex + 1} of {total}
        </span>
        <button
          type="button"
          data-testid="walkthrough-exit"
          onClick={onExit}
          className="text-xs text-[var(--color-text-secondary-inverse)] underline underline-offset-2"
        >
          Exit walkthrough
        </button>
      </div>

      <div className="rounded-lg bg-[var(--color-surface-raised)] p-5 space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary-inverse)]">
            {card.title || 'Untitled card'}
          </h3>
          <div className="flex gap-2 text-xs text-[var(--color-text-secondary-inverse)]">
            {card.severity && <span>{card.severity}</span>}
            {card.system_tag && <span>{card.system_tag}</span>}
          </div>
        </div>

        {card.photoUrl && (
          <img
            src={card.photoUrl}
            alt=""
            className="w-full aspect-video object-cover rounded-md"
            data-testid="walkthrough-card-photo"
          />
        )}

        {!showPostCheckin ? (
          <div className="space-y-3">
            <CheckInForm
              cardId={card.id}
              isOverdue={true}
              referencePhotos={card.referencePhotos}
              onCheckinSuccess={handleCheckinDone}
            />
            <button
              type="button"
              data-testid="walkthrough-skip"
              onClick={handleSkip}
              className="w-full text-center text-xs text-[var(--color-text-secondary-inverse)] underline underline-offset-2"
            >
              Skip this card
            </button>
          </div>
        ) : (
          <div data-testid="walkthrough-post-checkin" className="flex gap-3">
            <button
              type="button"
              data-testid="walkthrough-keep-monitoring"
              onClick={handleKeepMonitoring}
              className="flex-1 rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-sm text-[var(--color-text-primary-inverse)]"
            >
              Keep monitoring
            </button>
            <Link
              href={`/cards/${card.id}`}
              data-testid="walkthrough-change-path"
              className="flex-1 rounded-md border border-[var(--color-border-subtle)] px-4 py-2 text-sm text-center text-[var(--color-text-primary-inverse)]"
            >
              Change path
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
