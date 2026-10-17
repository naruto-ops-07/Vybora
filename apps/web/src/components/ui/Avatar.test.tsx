import { fireEvent, render, screen } from '@testing-library/react';
import { personTone } from '@vybora/core';
import { describe, expect, it } from 'vitest';
import { Avatar, GroupAvatar } from './Avatar';

const MAYA = 'a3f1c2d4-0000-4000-8000-000000000001';

describe('Avatar', () => {
  it('without a photo, shows initials on the person’s tone and keeps its name', () => {
    render(<Avatar path={null} userId={MAYA} name="maya" displayName="Maya Chen" size={48} />);
    const img = screen.getByRole('img', { name: 'maya' });
    const tone = personTone(MAYA);
    expect(img).toHaveAttribute('data-tone', tone);
    expect(img).toHaveTextContent('MC');
    const circle = img.firstElementChild as HTMLElement;
    expect(circle.style.background).toBe(`var(--vy-tone-${tone}-fill)`);
    const initials = circle.firstElementChild as HTMLElement;
    expect(initials).toHaveAttribute('aria-hidden', 'true');
    expect(initials.style.color).toBe(`var(--vy-tone-${tone}-ink)`);
    expect(initials.style.fontSize).toBe('17px'); // 48 × 0.36, two letters
  });

  it('falls back to the username for initials and shows one letter when small', () => {
    const { rerender } = render(<Avatar path={null} userId={MAYA} name="maya_chen" />);
    expect(screen.getByRole('img', { name: 'maya_chen' })).toHaveTextContent('MC');
    rerender(<Avatar path={null} userId={MAYA} name="maya_chen" size={20} />);
    expect(screen.getByRole('img', { name: 'maya_chen' })).toHaveTextContent(/^M$/);
  });

  it('shows the photo when there is one, and the tone if it fails to load', () => {
    render(<Avatar path="u/a.jpg" userId={MAYA} name="maya" displayName="Maya" />);
    const img = screen.getByRole('img', { name: 'maya' });
    const photo = img.querySelector('img')!;
    expect(photo).toHaveAttribute('alt', '');
    expect(img).not.toHaveAttribute('data-tone');
    fireEvent.error(photo);
    expect(img.querySelector('img')).toBeNull();
    expect(img).toHaveTextContent('M');
    expect(img).toHaveAttribute('data-tone', personTone(MAYA));
  });

  it('is hidden from assistive tech when decorative', () => {
    const { container } = render(<Avatar path={null} userId={MAYA} name="maya" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('GroupAvatar', () => {
  const people = [
    { id: 'c', username: 'cleo', display_name: 'Cleo' },
    { id: 'a', username: 'ana', display_name: 'Ana Ruiz' },
    { id: 'b', username: 'ben', display_name: null },
  ];

  it('overlaps the first two members by id under one accessible name', () => {
    const { container } = render(<GroupAvatar members={people} size={48} />);
    const group = screen.getByRole('img', { name: 'Group' });
    expect(screen.getAllByRole('img')).toHaveLength(1);
    const faces = group.querySelectorAll('[data-tone]');
    expect([...faces].map((f) => f.textContent)).toEqual(['AR', 'B']);
    expect([...faces].map((f) => f.getAttribute('data-tone'))).toEqual([
      personTone('a'),
      personTone('b'),
    ]);
    // Front one wears a 2 px ring in the surface colour (a border, not a shadow).
    const ring = container.querySelector<HTMLElement>('[data-avatar-front]')!;
    expect(ring.className).toContain('border-2');
    expect(ring.style.borderColor).toBe('var(--avatar-ring, var(--vy-surface))');
    expect(ring.style.boxShadow).toBe('');
  });

  it('shows one member alone and falls back to a glyph with nobody else', () => {
    const { rerender } = render(<GroupAvatar members={[people[0]!]} label="Book club" />);
    expect(screen.getByRole('img', { name: 'Book club' })).toHaveTextContent('C');
    rerender(<GroupAvatar members={[]} />);
    const glyph = screen.getByRole('img', { name: 'Group' });
    expect(glyph.querySelector('[data-tone]')).toBeNull();
    expect(glyph.querySelector('svg')).not.toBeNull();
  });
});
