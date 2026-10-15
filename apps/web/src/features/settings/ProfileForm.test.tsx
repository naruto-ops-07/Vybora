import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { ProfileForm } from './ProfileForm';

const initial = { username: 'maya', display_name: 'Maya', bio: '', website: '' };

describe('ProfileForm', () => {
  it('is disabled until something changes, then saves normalized values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<ProfileForm initial={initial} onSubmit={onSubmit} />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Bio'), 'Photographer in Lisbon');
    await userEvent.type(screen.getByLabelText('Website'), 'maya.studio');
    await userEvent.click(save);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        username: 'maya',
        display_name: 'Maya',
        bio: 'Photographer in Lisbon',
        website: 'https://maya.studio',
      }),
    );
  });

  it('shows validation errors and server errors', async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint "profiles_username_key"',
    });
    renderWithProviders(<ProfileForm initial={initial} onSubmit={onSubmit} />);
    const username = screen.getByLabelText('Username');
    await userEvent.clear(username);
    await userEvent.type(username, 'a..b');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Cannot contain consecutive periods')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.clear(username);
    await userEvent.type(username, 'taken');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That username is taken.');
  });
});
