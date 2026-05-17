// What: Unit tests for <MonitorCadencePicker />.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MonitorCadencePicker } from './MonitorCadencePicker';

afterEach(() => {
  cleanup();
});

describe('<MonitorCadencePicker />', () => {
  it('renders the initial cadence in the input', () => {
    render(
      <MonitorCadencePicker
        initialCadence={30}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isCommitting={false}
      />
    );
    const input = screen.getByTestId('cadence-input') as HTMLInputElement;
    expect(input.value).toBe('30');
  });

  it('clamps an out-of-range initial cadence to the min (7)', () => {
    render(
      <MonitorCadencePicker
        initialCadence={2}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isCommitting={false}
      />
    );
    const input = screen.getByTestId('cadence-input') as HTMLInputElement;
    expect(input.value).toBe('7');
  });

  it('clamps the input on change to [7, 365]', () => {
    render(
      <MonitorCadencePicker
        initialCadence={30}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isCommitting={false}
      />
    );
    const input = screen.getByTestId('cadence-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '500' } });
    expect(input.value).toBe('365');
    fireEvent.change(input, { target: { value: '1' } });
    expect(input.value).toBe('7');
  });

  it('Confirm → calls onConfirm with the current cadence', () => {
    const onConfirm = vi.fn();
    render(
      <MonitorCadencePicker
        initialCadence={30}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isCommitting={false}
      />
    );
    const input = screen.getByTestId('cadence-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.click(screen.getByTestId('cadence-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(60);
  });

  it('Cancel → calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <MonitorCadencePicker
        initialCadence={30}
        onConfirm={vi.fn()}
        onCancel={onCancel}
        isCommitting={false}
      />
    );
    fireEvent.click(screen.getByTestId('cadence-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables Confirm + shows "Saving…" while committing', () => {
    render(
      <MonitorCadencePicker
        initialCadence={30}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isCommitting={true}
      />
    );
    const confirm = screen.getByTestId('cadence-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe('Saving…');
  });
});
