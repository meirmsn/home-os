// What: Unit tests for <ChoosePath />. Covers all four commit buttons,
//       greyed-state on planned, "Change decision" re-open, MONITOR
//       cadence picker flow, PostHog event firing (chosen + changed),
//       and error surfacing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

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

import { ChoosePath } from './ChoosePath';

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

describe('<ChoosePath cardState="decide" />', () => {
  it('renders all four active commit buttons', () => {
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath={null}
        proposedCadence={30}
      />
    );
    expect(screen.getByTestId('choose-diy')).toBeTruthy();
    expect(screen.getByTestId('choose-contractor')).toBeTruthy();
    expect(screen.getByTestId('choose-monitor')).toBeTruthy();
    expect(screen.getByTestId('choose-dismiss')).toBeTruthy();
    // No "Change decision" link in decide state.
    expect(screen.queryByTestId('change-decision')).toBeNull();
  });

  it('Choose DIY → POSTs path=diy + fires decide_path_chosen + refreshes', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ state: 'planned', chosen_path: 'diy' }),
    });
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath={null}
        proposedCadence={30}
      />
    );
    fireEvent.click(screen.getByTestId('choose-diy'));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/decide`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"path":"diy"'),
      })
    );
    expect(posthogCapture).toHaveBeenCalledWith('decide_path_chosen', {
      card_id: CARD_ID,
      chosen_path: 'diy',
      monitoring_cadence_days: null,
    });
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('Choose Contractor → POSTs path=contractor + fires event', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ state: 'planned', chosen_path: 'contractor' }),
    });
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath={null}
        proposedCadence={30}
      />
    );
    fireEvent.click(screen.getByTestId('choose-contractor'));
    await new Promise((r) => setTimeout(r, 0));

    expect(posthogCapture).toHaveBeenCalledWith('decide_path_chosen', {
      card_id: CARD_ID,
      chosen_path: 'contractor',
      monitoring_cadence_days: null,
    });
  });

  it('Set to Monitor → mounts cadence picker (no POST yet)', () => {
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath={null}
        proposedCadence={30}
      />
    );
    fireEvent.click(screen.getByTestId('choose-monitor'));
    expect(screen.getByTestId('monitor-cadence-picker')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Set to Monitor + Confirm → POSTs path=monitor with cadence', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ state: 'monitoring', chosen_path: 'monitor' }),
    });
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath={null}
        proposedCadence={45}
      />
    );
    fireEvent.click(screen.getByTestId('choose-monitor'));
    fireEvent.click(screen.getByTestId('cadence-confirm'));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/decide`,
      expect.objectContaining({
        body: expect.stringContaining('"monitoring_cadence_days":45'),
      })
    );
    expect(posthogCapture).toHaveBeenCalledWith('decide_path_chosen', {
      card_id: CARD_ID,
      chosen_path: 'monitor',
      monitoring_cadence_days: 45,
    });
  });

  it('Dismiss → POSTs path=dismiss + fires event', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ state: 'dismissed', chosen_path: null }),
    });
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath={null}
        proposedCadence={null}
      />
    );
    fireEvent.click(screen.getByTestId('choose-dismiss'));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/decide`,
      expect.objectContaining({
        body: expect.stringContaining('"path":"dismiss"'),
      })
    );
    expect(posthogCapture).toHaveBeenCalledWith('decide_path_chosen', {
      card_id: CARD_ID,
      chosen_path: 'dismiss',
      monitoring_cadence_days: null,
    });
  });

  it('surfaces error message on 409 + does not refresh', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 409,
      json: async () => ({ error: 'invalid_state' }),
    });
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath={null}
        proposedCadence={null}
      />
    );
    fireEvent.click(screen.getByTestId('choose-diy'));
    await waitFor(() =>
      expect(screen.getByTestId('choose-path-error').textContent).toBe(
        'invalid_state'
      )
    );

    expect(routerRefresh).not.toHaveBeenCalled();
  });
});

describe('<ChoosePath cardState="planned" />', () => {
  it('greys all four buttons and shows ✓ Chosen on the chosen one', () => {
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="planned"
        prevChosenPath="diy"
        proposedCadence={null}
      />
    );
    const diyBtn = screen.getByTestId('choose-diy') as HTMLButtonElement;
    expect(diyBtn.disabled).toBe(true);
    expect(diyBtn.textContent).toContain('✓ Chosen');
    // Other buttons disabled but no ✓ tag.
    const contractorBtn = screen.getByTestId(
      'choose-contractor'
    ) as HTMLButtonElement;
    expect(contractorBtn.disabled).toBe(true);
    expect(contractorBtn.textContent).not.toContain('✓ Chosen');
  });

  it('shows "Change decision" link below + clicking POSTs path=decide WITHOUT firing decide_path_chosen', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ state: 'decide', chosen_path: null }),
    });
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="planned"
        prevChosenPath="diy"
        proposedCadence={null}
      />
    );
    fireEvent.click(screen.getByTestId('change-decision'));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/decide`,
      expect.objectContaining({
        body: expect.stringContaining('"path":"decide"'),
      })
    );
    // No event on re-open — only on the eventual NEW commit.
    expect(posthogCapture).not.toHaveBeenCalled();
    expect(routerRefresh).toHaveBeenCalled();
  });
});

describe('<ChoosePath /> — decide_path_changed', () => {
  it('fires decide_path_changed when prev != to on a re-commit', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ state: 'planned', chosen_path: 'contractor' }),
    });
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath="diy"
        proposedCadence={null}
      />
    );
    fireEvent.click(screen.getByTestId('choose-contractor'));
    await new Promise((r) => setTimeout(r, 0));

    expect(posthogCapture).toHaveBeenCalledWith('decide_path_chosen', {
      card_id: CARD_ID,
      chosen_path: 'contractor',
      monitoring_cadence_days: null,
    });
    expect(posthogCapture).toHaveBeenCalledWith('decide_path_changed', {
      card_id: CARD_ID,
      from_path: 'diy',
      to_path: 'contractor',
    });
  });

  it('does NOT fire decide_path_changed when prev == to (same path)', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ state: 'planned', chosen_path: 'diy' }),
    });
    render(
      <ChoosePath
        cardId={CARD_ID}
        cardState="decide"
        prevChosenPath="diy"
        proposedCadence={null}
      />
    );
    fireEvent.click(screen.getByTestId('choose-diy'));
    await new Promise((r) => setTimeout(r, 0));

    const calls = posthogCapture.mock.calls.map((c) => c[0]);
    expect(calls).toContain('decide_path_chosen');
    expect(calls).not.toContain('decide_path_changed');
  });
});
