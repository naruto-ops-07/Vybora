import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttachmentPreview } from './compose/AttachmentPreview';
import { ContactPicker } from './compose/ContactPicker';
import { LocationShare } from './compose/LocationShare';
import { PollDialog } from './compose/PollDialog';

const PNG = [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
const MOV = [0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0, 0, 0, 0];
const file = (name: string, type: string, head: number[]) =>
  new File([new Uint8Array([...head, ...new Array(64).fill(0)])], name, { type });

afterEach(() => vi.unstubAllGlobals());

describe('poll dialog', () => {
  const open = (onSend = vi.fn()) => {
    render(<PollDialog open onClose={vi.fn()} onSend={onSend} />);
    return onSend;
  };

  it('starts with two empty options and sends question, options and multi', async () => {
    const onSend = open();
    expect(screen.getAllByRole('textbox', { name: /^Option \d/ })).toHaveLength(2);
    await userEvent.type(screen.getByRole('textbox', { name: 'Question' }), 'Where to?');
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 1' }), 'Beach');
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 2' }), 'Hills');
    await userEvent.click(screen.getByRole('switch', { name: 'Let people pick more than one' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send poll' }));
    expect(onSend).toHaveBeenCalledWith({
      question: 'Where to?',
      options: ['Beach', 'Hills'],
      multi: true,
    });
  });

  it('adds and removes options, up to twelve', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getAllByRole('textbox', { name: /^Option \d/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Remove option 3' }));
    expect(screen.getAllByRole('textbox', { name: /^Option \d/ })).toHaveLength(2);
    // The last two can't be removed: a poll needs two.
    expect(screen.queryByRole('button', { name: /Remove option/ })).toBeNull();
    for (let i = 0; i < 10; i++)
      await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getAllByRole('textbox', { name: /^Option \d/ })).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Add option' })).toBeNull();
  });

  it('explains what is missing instead of sending', async () => {
    const onSend = open();
    const send = screen.getByRole('button', { name: 'Send poll' });
    await userEvent.click(send);
    expect(await screen.findByText('Add a question.')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Question' }), 'Where to?');
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 1' }), 'Beach');
    await userEvent.click(send);
    expect(await screen.findByText('Add at least two options.')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Option 2' }), 'beach');
    await userEvent.click(send);
    expect(await screen.findByText('Two options are the same.')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('contact picker', () => {
  const friends = [
    { userId: 'u1', username: 'maya', displayName: 'Maya Chen', avatarPath: null, since: null },
    { userId: 'u2', username: 'leo.k', displayName: null, avatarPath: null, since: null },
  ];

  it('searches friends and sends the server profile', async () => {
    const onSend = vi.fn();
    render(
      <ContactPicker open onClose={vi.fn()} friends={friends} loading={false} onSend={onSend} />,
    );
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'leo');
    expect(screen.getAllByRole('button', { name: /Share/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Share leo.k' }));
    expect(onSend).toHaveBeenCalledWith({ userId: 'u2', username: 'leo.k', displayName: '' });
  });

  it('points at Friends when there are none', () => {
    render(<ContactPicker open onClose={vi.fn()} friends={[]} loading={false} onSend={vi.fn()} />);
    expect(screen.getByText('No friends yet')).toBeInTheDocument();
  });
});

describe('location share', () => {
  const geo = (impl: Partial<Geolocation>) =>
    vi.stubGlobal('navigator', { ...navigator, geolocation: impl as Geolocation });

  it('asks nothing until the button is pressed, then previews and sends', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 51.5073509, longitude: -0.1277583 } } as GeolocationPosition),
    );
    geo({ getCurrentPosition });
    const onSend = vi.fn();
    render(<LocationShare open onClose={vi.fn()} onSend={onSend} />);
    expect(
      screen.getByText('Sends your current location once. It isn’t tracked.'),
    ).toBeInTheDocument();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Share my location' }));
    expect(await screen.findByText('51.50735, -0.12776')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Label (optional)' }), 'Home');
    await userEvent.click(screen.getByRole('button', { name: 'Send location' }));
    expect(onSend).toHaveBeenCalledWith({ lat: 51.5073509, lng: -0.1277583, label: 'Home' });
  });

  it('explains a refusal and offers to try again', async () => {
    let fail!: PositionErrorCallback;
    geo({ getCurrentPosition: vi.fn((_ok, err) => (fail = err!)) });
    render(<LocationShare open onClose={vi.fn()} onSend={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share my location' }));
    fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(
      await screen.findByText('Your browser blocked location access. Allow it, then try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('says so when the browser has no location at all', () => {
    geo({});
    render(<LocationShare open onClose={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByText('This browser can’t share a location.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share my location' })).toBeNull();
  });
});

describe('attachment preview', () => {
  it('offers view once for a photo, and sends with the flag', async () => {
    const onSend = vi.fn();
    render(
      <AttachmentPreview
        files={[file('a.png', 'image/png', PNG)]}
        onClose={vi.fn()}
        onSend={onSend}
      />,
    );
    const toggle = await screen.findByRole('switch', { name: 'View once' });
    expect(toggle).toBeEnabled();
    await userEvent.click(toggle);
    expect(
      screen.getByText('Opens once on their device. Screenshots can’t be blocked.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send 1 file' }));
    expect(onSend).toHaveBeenCalledWith(expect.arrayContaining([expect.any(File)]), true);
  });

  it('disables view once for a format the viewer can’t show, with the reason', async () => {
    render(
      <AttachmentPreview
        files={[file('a.mov', 'video/quicktime', MOV)]}
        onClose={vi.fn()}
        onSend={vi.fn()}
      />,
    );
    const toggle = await screen.findByRole('switch', { name: 'View once' });
    await waitFor(() => expect(toggle).toBeDisabled());
    expect(screen.getByText('View once needs a JPEG, PNG, GIF, WebP, MP4 or WebM.')).toBeVisible();
  });

  it('has no view-once toggle for documents', async () => {
    render(
      <AttachmentPreview
        files={[file('a.pdf', 'application/pdf', [0x25, 0x50, 0x44, 0x46])]}
        onClose={vi.fn()}
        onSend={vi.fn()}
      />,
    );
    expect(await screen.findByText('a.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('lists several files and sends them together', async () => {
    const onSend = vi.fn();
    render(
      <AttachmentPreview
        files={[file('a.png', 'image/png', PNG), file('b.png', 'image/png', PNG)]}
        onClose={vi.fn()}
        onSend={onSend}
      />,
    );
    const list = await screen.findByRole('list', { name: 'Files to send' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 files' }));
    expect(onSend).toHaveBeenCalledWith(expect.any(Array), false);
    expect(onSend.mock.calls[0]![0]).toHaveLength(2);
  });
});
