// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({ posthogCapture: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: posthogCapture } }));

import { ContractorAppointmentNudge } from './ContractorAppointmentNudge';

beforeEach(() => posthogCapture.mockReset());
afterEach(() => cleanup());

describe('ContractorAppointmentNudge', () => {
  it('renders the D3 copy with the trade label', () => {
    render(
      <ContractorAppointmentNudge
        contractorType="hvac_tech"
        questionCount={3}
        oldestCardDays={45}
      />
    );
    expect(screen.getByTestId('contractor-appointment-nudge').textContent).toBe(
      'You have 3 open questions for your HVAC contractor.'
    );
  });

  it('singularizes the noun when there is exactly one question', () => {
    render(
      <ContractorAppointmentNudge
        contractorType="electrician"
        questionCount={1}
        oldestCardDays={45}
      />
    );
    expect(screen.getByTestId('contractor-appointment-nudge').textContent).toBe(
      'You have 1 open question for your Electrician contractor.'
    );
  });

  it('fires contractor_appointment_nudge_shown once on mount with the raw tag', () => {
    const { rerender } = render(
      <ContractorAppointmentNudge
        contractorType="plumber"
        questionCount={2}
        oldestCardDays={31}
      />
    );
    rerender(
      <ContractorAppointmentNudge
        contractorType="plumber"
        questionCount={2}
        oldestCardDays={31}
      />
    );
    expect(posthogCapture).toHaveBeenCalledTimes(1);
    expect(posthogCapture).toHaveBeenCalledWith(
      'contractor_appointment_nudge_shown',
      { contractor_type: 'plumber', question_count: 2, oldest_card_days: 31 }
    );
  });
});
