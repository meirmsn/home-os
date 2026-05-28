// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WalkthroughPrompt } from './WalkthroughPrompt';

afterEach(() => cleanup());

describe('WalkthroughPrompt', () => {
  it('renders count and prompt text', () => {
    render(<WalkthroughPrompt overdueCount={3} />);
    expect(screen.getByTestId('walkthrough-prompt')).toBeTruthy();
    expect(screen.getByText(/3 items need a check-in/)).toBeTruthy();
  });

  it('uses singular form for 1 item', () => {
    render(<WalkthroughPrompt overdueCount={1} />);
    expect(screen.getByText(/1 item needs a check-in/)).toBeTruthy();
  });

  it('does not render when overdue count is 0', () => {
    render(<WalkthroughPrompt overdueCount={0} />);
    expect(screen.queryByTestId('walkthrough-prompt')).toBeNull();
  });
});
