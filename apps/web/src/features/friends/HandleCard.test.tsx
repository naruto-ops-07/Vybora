import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { HandleCardView } from './HandleCard';

const person = { id: 'u1', username: 'maya', display_name: 'Maya Chen', avatar_path: null };
const link = 'https://vybora.test/friends?add=maya';
const liveRegion = () => document.querySelector('[data-handle-status]')!;

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  // @ts-expect-error test cleanup of an optional API
  delete navigator.share;
});

describe('HandleCard', () => {
  it('shows my name and @username, with labelled Copy and Share', () => {
    renderWithProviders(<HandleCardView person={person} link={link} />);
    expect(screen.getByText('Maya Chen')).toBeInTheDocument();
    expect(screen.getByText('@maya')).toHaveClass('font-mono');
    expect(screen.getByRole('button', { name: 'Copy @maya' })).toHaveTextContent('Copy');
    expect(screen.getByRole('button', { name: 'Share a link to add you' })).toHaveTextContent(
      'Share',
    );
    // The avatar is decoration beside the visible name, not a second "Maya Chen".
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('copies @username, says "Copied" for 2 s and announces it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onShared = vi.fn();
    renderWithProviders(<HandleCardView person={person} link={link} onShared={onShared} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy @maya' }));
    expect(writeText).toHaveBeenCalledWith('@maya');
    expect(onShared).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent('@maya copied');
    await act(async () => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: 'Copy @maya' })).toBeInTheDocument();
    expect(liveRegion()).toBeEmptyDOMElement();
  });

  it('shares the add-me link with the system share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const onShared = vi.fn();
    renderWithProviders(<HandleCardView person={person} link={link} onShared={onShared} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share a link to add you' }));
    expect(share).toHaveBeenCalledWith({
      title: 'VYBORA',
      text: 'Add me on VYBORA: @maya',
      url: link,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(onShared).toHaveBeenCalledTimes(1);
  });

  it('closing the share sheet is not a share', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(abort),
      configurable: true,
    });
    const onShared = vi.fn();
    renderWithProviders(<HandleCardView person={person} link={link} onShared={onShared} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share a link to add you' }));
    expect(onShared).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link where there is no share sheet', async () => {
    const onShared = vi.fn();
    renderWithProviders(<HandleCardView person={person} link={link} onShared={onShared} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share a link to add you' }));
    expect(writeText).toHaveBeenCalledWith(link);
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    expect(liveRegion()).toHaveTextContent('Link to add you copied');
    expect(onShared).toHaveBeenCalledTimes(1);
  });

  it('says so when the clipboard is unavailable, without counting it as shared', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const onShared = vi.fn();
    renderWithProviders(<HandleCardView person={person} link={link} onShared={onShared} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy @maya' }));
    expect(await screen.findByText('Couldn’t copy. Your username is @maya.')).toBeInTheDocument();
    expect(onShared).not.toHaveBeenCalled();
  });

  it('compact: the handle and both actions on one line, no avatar or name', () => {
    renderWithProviders(<HandleCardView person={person} link={link} variant="compact" />);
    expect(screen.getByText('@maya')).toBeInTheDocument();
    expect(screen.queryByText('Maya Chen')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    for (const b of screen.getAllByRole('button')) expect(b).toHaveClass('touch-target');
  });
});
