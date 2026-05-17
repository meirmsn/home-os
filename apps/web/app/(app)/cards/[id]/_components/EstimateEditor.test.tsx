// What: Unit tests for <EstimateEditor />. Covers DIY + Contractor
//       variants, save + reset flows, PATCH request shape, PostHog
//       event firing, and error surfacing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  ContractorExpansion,
  DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const { routerRefresh, posthogCapture } = vi.hoisted(() => ({
  routerRefresh: vi.fn(),
  posthogCapture: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

import { EstimateEditor } from './EstimateEditor';

const diyEstimate = (): DiyExpansion => ({
  skill_level: 'intermediate',
  time_hours_min: 1,
  time_hours_max: 2,
  materials: [{ name: 'kit', cost_min: 10, cost_max: 20 }],
  tools: [{ name: 'wrench', cost_min: 0, cost_max: 25 }],
  total_min: 12,
  total_max: 45,
  gotchas: 'g',
  abort_condition: 'a',
  steps: ['one'],
});

const contractorEstimate = (): ContractorExpansion => ({
  contractor_type: 'plumber',
  cost_range_min: 100,
  cost_range_max: 300,
  questions_for_contractor: ['q'],
  red_flags: [],
  good_completion: 'gc',
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  routerRefresh.mockReset();
  posthogCapture.mockReset();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
});

describe('<EstimateEditor variant="diy" />', () => {
  it('renders just an "Edit estimate" button when closed', () => {
    render(
      <EstimateEditor
        variant="diy"
        cardId={CARD_ID}
        initial={diyEstimate()}
        hasOverride={false}
      />
    );
    expect(screen.getByText('Edit estimate')).toBeTruthy();
    expect(screen.queryByTestId('estimate-editor-diy-form')).toBeNull();
  });

  it('shows the "Reset to app estimate" link when hasOverride=true', () => {
    render(
      <EstimateEditor
        variant="diy"
        cardId={CARD_ID}
        initial={diyEstimate()}
        hasOverride={true}
      />
    );
    expect(screen.getByText('Reset to app estimate')).toBeTruthy();
  });

  it('opens the form on Edit click and pre-fills initial values', () => {
    render(
      <EstimateEditor
        variant="diy"
        cardId={CARD_ID}
        initial={diyEstimate()}
        hasOverride={false}
      />
    );
    fireEvent.click(screen.getByText('Edit estimate'));
    expect(screen.getByTestId('estimate-editor-diy-form')).toBeTruthy();
    const inputs = document.querySelectorAll('input[type=number]');
    expect(inputs[0]).toHaveProperty('value', '1'); // time_hours_min
  });

  it('Save → PATCH with the edited override + fires decide_estimate_edited + refreshes', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ override_present: true }),
    });
    render(
      <EstimateEditor
        variant="diy"
        cardId={CARD_ID}
        initial={diyEstimate()}
        hasOverride={false}
      />
    );
    fireEvent.click(screen.getByText('Edit estimate'));
    const totalMaxInput = document
      .querySelectorAll('input[type=number]')
      .item(3) as HTMLInputElement; // 4th = total_max
    fireEvent.change(totalMaxInput, { target: { value: '99' } });
    fireEvent.click(screen.getByTestId('save-diy'));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/estimate`,
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"total_max":99'),
      })
    );
    expect(posthogCapture).toHaveBeenCalledWith('decide_estimate_edited', {
      card_id: CARD_ID,
      path: 'diy',
    });
  });

  it('Reset → PATCH with estimate=null + fires decide_estimate_reset + refreshes', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ override_present: false }),
    });
    render(
      <EstimateEditor
        variant="diy"
        cardId={CARD_ID}
        initial={diyEstimate()}
        hasOverride={true}
      />
    );
    fireEvent.click(screen.getByTestId('reset-diy'));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/estimate`,
      expect.objectContaining({
        body: expect.stringContaining('"estimate":null'),
      })
    );
    expect(posthogCapture).toHaveBeenCalledWith('decide_estimate_reset', {
      card_id: CARD_ID,
      path: 'diy',
    });
  });

  it('Cancel → closes form without PATCH', () => {
    render(
      <EstimateEditor
        variant="diy"
        cardId={CARD_ID}
        initial={diyEstimate()}
        hasOverride={false}
      />
    );
    fireEvent.click(screen.getByText('Edit estimate'));
    fireEvent.click(screen.getByTestId('cancel-diy'));
    expect(screen.queryByTestId('estimate-editor-diy-form')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces error message on 400 reply', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 400,
      json: async () => ({ error: 'validation_failed', reason: 'bad shape' }),
    });
    render(
      <EstimateEditor
        variant="diy"
        cardId={CARD_ID}
        initial={diyEstimate()}
        hasOverride={false}
      />
    );
    fireEvent.click(screen.getByText('Edit estimate'));
    fireEvent.click(screen.getByTestId('save-diy'));
    await waitFor(() =>
      expect(screen.getByTestId('editor-error-diy').textContent).toBe(
        'bad shape'
      )
    );
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it('surfaces network error on fetch throw', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(
      <EstimateEditor
        variant="diy"
        cardId={CARD_ID}
        initial={diyEstimate()}
        hasOverride={false}
      />
    );
    fireEvent.click(screen.getByText('Edit estimate'));
    fireEvent.click(screen.getByTestId('save-diy'));
    await waitFor(() =>
      expect(screen.getByTestId('editor-error-diy').textContent).toContain(
        'Network error'
      )
    );
  });
});

describe('<EstimateEditor variant="contractor" />', () => {
  it('opens the contractor form on Edit click', () => {
    render(
      <EstimateEditor
        variant="contractor"
        cardId={CARD_ID}
        initial={contractorEstimate()}
        hasOverride={false}
      />
    );
    fireEvent.click(screen.getByText('Edit estimate'));
    expect(screen.getByTestId('estimate-editor-contractor-form')).toBeTruthy();
  });

  it('Save → PATCH with contractor override', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ override_present: true }),
    });
    render(
      <EstimateEditor
        variant="contractor"
        cardId={CARD_ID}
        initial={contractorEstimate()}
        hasOverride={false}
      />
    );
    fireEvent.click(screen.getByText('Edit estimate'));
    const costMaxInput = document
      .querySelectorAll('input[type=number]')
      .item(1) as HTMLInputElement;
    fireEvent.change(costMaxInput, { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('save-contractor'));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/estimate`,
      expect.objectContaining({
        body: expect.stringContaining('"path":"contractor"'),
      })
    );
    expect(posthogCapture).toHaveBeenCalledWith('decide_estimate_edited', {
      card_id: CARD_ID,
      path: 'contractor',
    });
  });
});
