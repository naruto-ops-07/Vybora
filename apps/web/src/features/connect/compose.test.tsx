import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Composer } from './Composer';

vi.mock('./ConnectProvider', () => ({ useConnect: () => ({ engine: null }) }));

const MAYA = '11111111-1111-4111-8111-111111111111';
const LEO = '22222222-2222-4222-8222-222222222222';
const members = [
  { id: MAYA, name: 'Maya Chen', username: 'maya', avatarPath: null },
  { id: LEO, name: 'Leo', username: 'leo.k', avatarPath: null },
];
const base = {
  accent: '#0F766E',
  replyTo: null,
  onCancelReply: vi.fn(),
  onFiles: vi.fn(),
  onTyping: vi.fn(),
};
let key = 0;
function setup(over: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn();
  render(
    <Composer {...base} draftKey={`m${++key}`} onSend={onSend} members={members} {...over} />,
    { wrapper: TooltipProvider },
  );
  return { onSend, box: screen.getByRole('textbox', { name: 'Message' }) };
}

describe('mention picker', () => {
  it('opens on @ with the members, filtered as you type', async () => {
    const { box } = setup();
    await userEvent.type(box, 'hi @');
    const list = screen.getByRole('listbox', { name: 'Mention someone' });
    expect(within(list).getAllByRole('option')).toHaveLength(2);
    expect(box).toHaveAttribute('aria-controls', list.id);
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
    await userEvent.type(box, 'le');
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([expect.stringContaining('Leo')]);
  });

  it('moves with the arrow keys and inserts with Enter, sending a token and the id', async () => {
    const { box, onSend } = setup();
    await userEvent.type(box, 'ask @');
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
    await userEvent.keyboard('{ArrowDown}');
    const second = screen.getAllByRole('option')[1]!;
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(box.getAttribute('aria-activedescendant')).toBe(second.id);
    await userEvent.keyboard('{Enter}');
    expect(box).toHaveValue('ask @Leo ');
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.type(box, 'about it{Enter}');
    expect(onSend).toHaveBeenCalledWith(`ask @[${LEO}] about it`, [LEO]);
  });

  it('inserts with Tab, closes with Esc without leaving the composer', async () => {
    const { box } = setup();
    await userEvent.type(box, '@ma');
    await userEvent.keyboard('{Tab}');
    expect(box).toHaveValue('@Maya Chen ');
    expect(box).toHaveFocus();
    await userEvent.type(box, '@');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    await userEvent.keyboard('{Escape}');
    window.removeEventListener('keydown', outer);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
  });

  it('drops a mention whose name was edited away', async () => {
    const { box, onSend } = setup();
    await userEvent.type(box, '@le');
    await userEvent.keyboard('{Enter}');
    await userEvent.type(box, '{Backspace}{Backspace}n is here{Enter}');
    expect(onSend).toHaveBeenCalledWith('@Len is here');
  });

  it('picks with a click', async () => {
    const { box, onSend } = setup();
    await userEvent.type(box, '@');
    await userEvent.click(screen.getByRole('option', { name: /Maya Chen/ }));
    expect(box).toHaveValue('@Maya Chen ');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith(`@[${MAYA}]`, [MAYA]);
  });

  it('has no picker without members (direct chats)', async () => {
    const { box } = setup({ members: undefined });
    await userEvent.type(box, '@');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows mentions in an edit as names and saves them as tokens', async () => {
    const onEdit = vi.fn();
    render(
      <Composer
        {...base}
        draftKey={`m${++key}`}
        onSend={vi.fn()}
        members={members}
        editing={{
          id: 'x',
          text: 'thanks @Leo',
          entries: [{ userId: LEO, name: 'Leo' }],
        }}
        onEdit={onEdit}
        onCancelEdit={vi.fn()}
      />,
      { wrapper: TooltipProvider },
    );
    const box = screen.getByRole('textbox', { name: 'Edit message' });
    expect(box).toHaveValue('thanks @Leo');
    await userEvent.type(box, '!{Enter}');
    expect(onEdit).toHaveBeenCalledWith(`thanks @[${LEO}]!`, [LEO]);
  });
});

describe('attach menu', () => {
  it('offers files, a poll, a contact and a location, all from the keyboard', async () => {
    const onPoll = vi.fn();
    const onContact = vi.fn();
    const onLocation = vi.fn();
    setup({ onPoll, onContact, onLocation });
    const button = screen.getByRole('button', { name: 'Attach' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await userEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Attach' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Photo, video or file',
      'Poll',
      'Contact',
      'Location',
    ]);
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onPoll).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
  });
});
