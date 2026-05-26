// @vitest-environment happy-dom
// What: Unit tests for <BeforeAfterPhotos />. Covers all four
//       photo-present/absent states per spec § D7.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BeforeAfterPhotos, type PhotoSlot } from './BeforeAfterPhotos';

afterEach(() => cleanup());

const before: PhotoSlot = {
  url: 'https://signed.example/before.jpg',
  date: '2026-05-10T00:00:00Z',
};

const after: PhotoSlot = {
  url: 'https://signed.example/after.jpg',
  date: '2026-05-26T00:00:00Z',
};

describe('<BeforeAfterPhotos />', () => {
  it('renders both photos when both present', () => {
    render(<BeforeAfterPhotos before={before} after={after} />);
    expect(screen.getByAltText('Before photo')).toBeTruthy();
    expect(screen.getByAltText('After photo')).toBeTruthy();
    expect(screen.queryByTestId('before-placeholder')).toBeNull();
    expect(screen.queryByTestId('after-placeholder')).toBeNull();
  });

  it('shows captions with dates when photos present', () => {
    render(<BeforeAfterPhotos before={before} after={after} />);
    const beforeSlot = screen.getByTestId('before-slot');
    const afterSlot = screen.getByTestId('after-slot');
    expect(beforeSlot.textContent).toContain('Before');
    expect(afterSlot.textContent).toContain('After');
  });

  it('renders before photo + after placeholder when only before present', () => {
    render(<BeforeAfterPhotos before={before} after={null} />);
    expect(screen.getByAltText('Before photo')).toBeTruthy();
    expect(screen.getByTestId('after-placeholder').textContent).toBe(
      'No finished photo'
    );
  });

  it('renders before placeholder + after photo when only after present', () => {
    render(<BeforeAfterPhotos before={null} after={after} />);
    expect(screen.getByTestId('before-placeholder').textContent).toBe(
      'No capture photo'
    );
    expect(screen.getByAltText('After photo')).toBeTruthy();
  });

  it('renders both placeholders when neither present', () => {
    render(<BeforeAfterPhotos before={null} after={null} />);
    expect(screen.getByTestId('before-placeholder').textContent).toBe(
      'No capture photo'
    );
    expect(screen.getByTestId('after-placeholder').textContent).toBe(
      'No finished photo'
    );
  });

  it('has responsive grid classes', () => {
    render(<BeforeAfterPhotos before={before} after={after} />);
    const container = screen.getByTestId('before-after-photos');
    expect(container.className).toContain('grid-cols-1');
    expect(container.className).toContain('md:grid-cols-2');
  });
});
