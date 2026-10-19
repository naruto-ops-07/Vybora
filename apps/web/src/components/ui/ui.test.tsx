import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { highContrastThemes, LOOKS, looks } from '@vybora/config';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  NoChatsIllustration,
  NoFriendsIllustration,
  NothingFoundIllustration,
  WelcomeIllustration,
} from '@/components/illustrations';
import { readEnv } from '@/lib/env';
import { renderWithProviders } from '@/test/utils';
import { Button, ButtonLink } from './Button';
import { ConfirmDialog, Dialog } from './Dialog';
import { Input, Toggle } from './Field';
import { LogoMark } from './Logo';
import { menuContentClass, menuItemClass } from './Menu';
import { Segmented } from './Segmented';
import { EmptyState, ErrorState } from './States';
import { ToastCard } from './Toast';
import { tooltipContentClass } from './Tooltip';

describe('state components', () => {
  it('EmptyState renders title, body and action', () => {
    renderWithProviders(
      <EmptyState title="Nothing yet" body="Follow people" action={<button>Go</button>} />,
    );
    expect(screen.getByRole('heading', { name: 'Nothing yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('EmptyState: decorative art, a heading at the right level, two actions, extras below', () => {
    const { container } = renderWithProviders(
      <EmptyState
        illustration={<NoChatsIllustration />}
        title="No chats yet"
        body="Add a friend by their username, then say hi."
        headingLevel={2}
        action={<button type="button">Add a friend</button>}
        secondaryAction={<button type="button">New message</button>}
      >
        <p>Your handle</p>
      </EmptyState>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'No chats yet' });
    expect(heading).toHaveClass('type-wide');
    const art = container.querySelector('svg[data-illustration="no-chats"]')!;
    expect(art).toHaveAttribute('aria-hidden', 'true');
    expect(art).toHaveAttribute('focusable', 'false');
    expect(screen.queryByRole('img')).toBeNull();
    const [primary, secondary] = screen.getAllByRole('button');
    expect(primary).toHaveTextContent('Add a friend');
    expect(secondary).toHaveTextContent('New message');
    expect(screen.getByText('Your handle')).toBeInTheDocument();
  });

  it('illustrations draw in theme colours only: no gradients, filters or fixed hexes', () => {
    const { container } = renderWithProviders(
      <>
        <WelcomeIllustration />
        <NoChatsIllustration />
        <NoFriendsIllustration />
        <NothingFoundIllustration />
      </>,
    );
    const svgs = container.querySelectorAll('svg[data-illustration]');
    expect(svgs).toHaveLength(4);
    const markup = container.innerHTML;
    expect(markup).not.toMatch(/Gradient|filter|feDropShadow|#[0-9a-f]{3,6}\b/i);
    // Every stroke, line work or on a fill, is 1.5 px on screen at any size.
    const strokes = container.querySelectorAll('[stroke]');
    expect(strokes.length).toBeGreaterThan(0);
    for (const el of strokes) {
      expect(el.getAttribute('stroke-width')).toBe('1.5');
      expect(el.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
  });

  it('ButtonLink marks itself so high contrast leaves it un-underlined', () => {
    renderWithProviders(<ButtonLink to="/friends">Add a friend</ButtonLink>);
    expect(screen.getByRole('link', { name: 'Add a friend' })).toHaveAttribute('data-button');
  });

  it('ErrorState shows a friendly message and retries', async () => {
    const retry = vi.fn();
    renderWithProviders(<ErrorState error={new TypeError('Failed to fetch')} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('Toggle is a labelled switch that reports its state', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Toggle checked={false} onChange={onChange} label="Read receipts" />);
    const sw = screen.getByRole('switch', { name: 'Read receipts' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('ConfirmDialog', () => {
  it('is an accessible modal that closes on Escape', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete post?"
        confirmLabel="Delete"
        danger
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Delete post?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('readEnv', () => {
  it('reports missing configuration clearly', () => {
    const r = readEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toContain('VITE_SUPABASE_URL');
  });
  it('accepts valid configuration', () => {
    const r = readEnv({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'x'.repeat(40),
    });
    expect(r.ok).toBe(true);
  });
});

/*
 * The primitives' look lives in styles/primitives.css (plain CSS, imported into the
 * components layer). jsdom cascades it but resolves no var() and ignores specificity, so
 * the file keeps every high-contrast override after the rule it overrides, and these
 * tests read the declared values (`var(--vy-shadow-3)`), not the resolved colours.
 */
const web = process.cwd();
const primitivesCss = readFileSync(resolve(web, 'src/styles/primitives.css'), 'utf8');
const primitiveRules = primitivesCss.replace(/\/\*[\s\S]*?\*\//g, '');
/** The declarations of the primitives' rule whose selector list is exactly `selector`. */
const ruleBody = (selector: string) => {
  const at = primitiveRules.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return primitiveRules.slice(at, primitiveRules.indexOf('}', at));
};
const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;

describe('primitives in the new looks', () => {
  let sheet: HTMLStyleElement;
  const html = document.documentElement;
  beforeAll(() => {
    sheet = document.createElement('style');
    sheet.textContent = primitivesCss;
    document.head.append(sheet);
  });
  afterAll(() => sheet.remove());
  afterEach(() => {
    delete html.dataset.look;
    delete html.dataset.theme;
    delete html.dataset.contrast;
  });
  const velvetDark = () => {
    html.dataset.look = 'velvet';
    html.dataset.theme = 'dark';
  };

  it('parses in full: no nesting, @layer or @apply for jsdom to drop', () => {
    expect(primitiveRules).not.toMatch(/@layer|@apply|@utility|&/);
    expect(sheet.sheet!.cssRules.length).toBeGreaterThan(20);
  });

  it('primary button: the look gradient in Velvet dark, flat under high contrast', () => {
    velvetDark();
    renderWithProviders(<Button>Send request</Button>);
    const button = screen.getByRole('button', { name: 'Send request' });
    const style = getComputedStyle(button);
    expect(style.backgroundImage).toContain('linear-gradient');
    expect(style.backgroundImage).toContain('var(--vy-btn-from)');
    expect(style.getPropertyValue('--vy-btn-from')).toBe('var(--vy-primary-from)');
    expect(style.color).toBe('var(--vy-on-primary)');
    expect(style.boxShadow).toContain('var(--vy-shadow-1)');
    // Velvet's 1 px inner top highlight (a no-op shadow in the other looks).
    expect(style.boxShadow).toContain('var(--vy-primary-highlight)');
    html.dataset.contrast = 'high';
    const flat = getComputedStyle(button);
    expect(flat.backgroundImage).toBe('none');
    expect(flat.boxShadow).toBe('none');
    expect(flat.backgroundColor).toBe('var(--vy-accent)');
  });

  it('every button variant shows the accent’s 2 px outline, offset, on keyboard focus', async () => {
    velvetDark();
    renderWithProviders(
      <>
        {VARIANTS.map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
      </>,
    );
    for (const v of VARIANTS) {
      await userEvent.tab();
      const button = screen.getByRole('button', { name: v });
      expect(button).toHaveFocus();
      // user-event reads computed styles while choosing the next tab stop, and jsdom
      // caches them until the DOM changes (focus is not a change): touch it to recompute.
      button.dataset.focusProbe = '';
      const style = getComputedStyle(button);
      expect(style.outlineStyle, v).toBe('solid');
      expect(style.outlineWidth, v).toBe('2px');
      expect(style.outlineColor, v).toBe('var(--vy-accent)');
      expect(style.outlineOffset, v).toBe('2px');
    }
  });

  it('danger: the page colour on the danger fill, ≥ 4.5:1 in every look, mode and high contrast', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x! + 0.05) / (y! + 0.05);
    };
    const modes = ['light', 'dark'] as const;
    const sets = [
      ...LOOKS.flatMap((l) => modes.map((m) => [`${l} ${m}`, looks[l].modes[m]] as const)),
      ...modes.map((m) => [`high contrast ${m}`, highContrastThemes[m]] as const),
    ];
    for (const [name, t] of sets) expect(ratio(t.bg, t.danger), name).toBeGreaterThanOrEqual(4.5);
    velvetDark();
    renderWithProviders(<Button variant="danger">Delete</Button>);
    const style = getComputedStyle(screen.getByRole('button', { name: 'Delete' }));
    expect(style.color).toBe('var(--vy-bg)');
    expect(style.backgroundColor).toBe('var(--vy-danger)');
  });

  it('a caller’s bg-* utility replaces the primary gradient (the override contract)', () => {
    velvetDark();
    renderWithProviders(
      <>
        <Button className="bg-[#2DD4BF] text-[#04201D] hover:bg-[#5EEAD4]">Get started</Button>
        <Button className="hover:bg-[#5EEAD4]">Hover only</Button>
      </>,
    );
    const overridden = getComputedStyle(screen.getByRole('button', { name: 'Get started' }));
    expect(overridden.backgroundImage).toBe('none');
    // A hover-only bg-* is not a fill override: the gradient stays.
    const hoverOnly = getComputedStyle(screen.getByRole('button', { name: 'Hover only' }));
    expect(hoverOnly.backgroundImage).toContain('linear-gradient');
  });

  it('primary and danger hover/pressed use the generated fills, not ad-hoc darkening', () => {
    expect(primitiveRules).not.toMatch(/color-mix\(in oklab, var\(--vy-(?:primary|danger)/);
    expect(ruleBody('.vy-btn-primary:active:not(:disabled)')).toContain(
      '--vy-btn-from: var(--vy-primary-press-from);',
    );
    expect(ruleBody('.vy-btn-danger:active:not(:disabled)')).toContain(
      'background-color: var(--vy-danger-press);',
    );
  });

  it('an invalid field keeps its danger border on hover', () => {
    const hoverRules = [
      ...primitiveRules.matchAll(/([^{}]*\.vy-field[^{}]*:hover[^{}]*)\{([^}]*)\}/g),
    ];
    expect(hoverRules.length).toBeGreaterThan(0);
    for (const [, selector, body] of hoverRules)
      if (/border-color/.test(body!))
        expect(selector, selector!.trim()).toContain(":not([aria-invalid='true'])");
  });

  it('the dialog is a raised popover at elevation 3', async () => {
    velvetDark();
    renderWithProviders(
      <Dialog open onClose={() => undefined} title="Remove friend?">
        <p>They won’t be told.</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Remove friend?' });
    const style = getComputedStyle(dialog);
    expect(style.boxShadow).toBe('var(--vy-shadow-3)');
    expect(style.backgroundColor).toBe('var(--vy-popover)');
    // Glass only where the look has it: the blur is the look's (0px in Velvet). jsdom
    // has no backdrop-filter, so this one is read from the rule.
    expect(dialog).toHaveClass('vy-popover');
    expect(ruleBody('.vy-popover')).toContain('backdrop-filter: blur(var(--vy-panel-blur))');
    // A hairline border (jsdom drops a var() in the border-color shorthand, so that is
    // read from the rule), with the look's edge on top (gold in Velvet).
    expect(style.borderTopColor).toBe('var(--vy-edge)');
    expect(ruleBody('.vy-popover')).toContain('border-color: var(--vy-border);');
    html.dataset.contrast = 'high';
    const flat = getComputedStyle(dialog);
    expect(flat.boxShadow).toBe('none');
    expect(ruleBody(":root[data-contrast='high'] .vy-popover")).toMatch(
      /(?:^|\s)backdrop-filter: none;/,
    );
  });

  it('menus, toasts and tooltips share the popover surface at elevation 2', () => {
    velvetDark();
    renderWithProviders(
      <>
        <div role="menu" className={menuContentClass}>
          <div role="menuitem" className={menuItemClass}>
            Pin
          </div>
        </div>
        <ToastCard tone="success" message="Copied" />
        <span role="tooltip" className={tooltipContentClass}>
          Search
        </span>
      </>,
    );
    for (const el of [
      screen.getByRole('menu'),
      screen.getByRole('status'),
      screen.getByRole('tooltip'),
    ]) {
      const style = getComputedStyle(el);
      expect(style.boxShadow).toBe('var(--vy-shadow-2)');
      expect(style.backgroundColor).toBe('var(--vy-popover)');
      expect(style.borderTopColor).toBe('var(--vy-edge)');
    }
  });

  it('inputs: the control edge, a subtle inset, an accent border and ring on focus', async () => {
    velvetDark();
    renderWithProviders(<Input label="Username" />);
    const input = screen.getByLabelText('Username');
    expect(input).toHaveClass('vy-field');
    expect(getComputedStyle(input).boxShadow).toContain('inset');
    expect(ruleBody('.vy-field')).toContain('border-color: var(--vy-border-strong);');
    expect(ruleBody('.vy-field:focus')).toContain('border-color: var(--vy-accent);');
    await userEvent.click(input);
    input.dataset.focusProbe = ''; // see the button focus test
    const focused = getComputedStyle(input);
    expect(focused.outlineStyle).toBe('solid');
    expect(focused.outlineWidth).toBe('2px');
    expect(focused.outlineColor).toBe('var(--vy-accent)');
    html.dataset.contrast = 'high';
    expect(getComputedStyle(input).boxShadow).toBe('none');
  });

  it('segmented: an inset track and a raised accent thumb; flat under high contrast', () => {
    velvetDark();
    renderWithProviders(
      <Segmented
        label="Mode"
        value="dark"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={() => undefined}
      />,
    );
    const on = screen.getByRole('radio', { name: 'Dark' });
    const track = screen.getByRole('radiogroup');
    expect(getComputedStyle(on).backgroundColor).toBe('var(--vy-accent)');
    expect(getComputedStyle(on).boxShadow).toContain('var(--vy-shadow-1)');
    expect(getComputedStyle(track).boxShadow).toContain('inset');
    html.dataset.contrast = 'high';
    expect(getComputedStyle(on).boxShadow).toBe('none');
    expect(getComputedStyle(track).boxShadow).toBe('none');
  });

  it('nothing moves on hover or press: no transform in class lists, the CSS or the sources', () => {
    renderWithProviders(
      <>
        {VARIANTS.map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
        <Input label="Name" />
        <Segmented
          label="Size"
          value="a"
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
          onChange={() => undefined}
        />
        <EmptyState icon={<span />} title="Nothing here" />
        <ToastCard tone="info" message="Saved" />
        <div className={menuContentClass}>
          <div className={menuItemClass}>Item</div>
        </div>
        <span className={tooltipContentClass}>Tip</span>
      </>,
    );
    const moving =
      /^(?:[\w-]+:)*(?:hover|active|focus|group-hover):\S*(?:scale|translate|rotate|skew|transform)/;
    for (const el of document.body.querySelectorAll<HTMLElement>('[class]')) {
      for (const token of el.getAttribute('class')!.split(/\s+/))
        expect(token, el.outerHTML.slice(0, 80)).not.toMatch(moving);
    }
    // Every :hover / :active rule in the primitives' CSS is colour and shadow only.
    const rules = [...primitiveRules.matchAll(/([^{}]*:(?:hover|active)[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(3);
    for (const [, selector, body] of rules)
      expect(body, selector!.trim()).not.toMatch(/transform|translate|scale|rotate/);
    // And no component source adds one.
    const dir = resolve(web, 'src/components/ui');
    for (const file of readdirSync(dir).filter((f) => /\.tsx$/.test(f) && !f.includes('test'))) {
      const src = readFileSync(resolve(dir, file), 'utf8');
      expect(src, file).not.toMatch(/(?:hover|active):[-\w[\]]*(?:scale|translate|rotate)/);
    }
  });

  it('the empty-state icon tile has depth that high contrast removes', () => {
    velvetDark();
    renderWithProviders(<EmptyState icon={<span data-testid="glyph" />} title="No requests" />);
    const tile = screen.getByTestId('glyph').parentElement!;
    expect(getComputedStyle(tile).boxShadow).toBe('var(--vy-shadow-1)');
    expect(getComputedStyle(tile).backgroundImage).toContain('linear-gradient');
    html.dataset.contrast = 'high';
    expect(getComputedStyle(tile).boxShadow).toBe('none');
    expect(getComputedStyle(tile).backgroundImage).toBe('none');
  });

  it('the logo mark draws in the look’s primary colours, no fixed hexes', () => {
    const { container } = renderWithProviders(<LogoMark />);
    const markup = container.innerHTML;
    expect(markup).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(markup).toContain('var(--vy-primary-from)');
    expect(markup).toContain('var(--vy-on-primary)');
  });
});

describe('illustrations recolour per look', () => {
  it('every fill and stroke is a look token or the line colour; my bubble is the look’s', () => {
    const { container } = renderWithProviders(
      <>
        <WelcomeIllustration />
        <NoChatsIllustration />
        <NoFriendsIllustration />
        <NothingFoundIllustration />
      </>,
    );
    for (const el of container.querySelectorAll('[fill], [stroke]')) {
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        if (v === null) continue;
        expect(v, `${el.tagName} ${attr}`).toMatch(
          /^(?:none|currentColor|var\(--vy-[a-z0-9-]+\))$/,
        );
      }
    }
    const welcome = container.querySelector('svg[data-illustration="welcome"]')!;
    expect(welcome.innerHTML).toContain('var(--vy-bubble-out-from)');
    expect(welcome.innerHTML).toContain('var(--vy-bubble-out-text)');
  });
});
