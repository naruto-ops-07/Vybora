import { expect, test } from '@playwright/test';

// Backend-independent checks against the production build.

const noHorizontalOverflow = () =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth;

test('landing page presents the messaging product and its calls to action', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your people, in colour/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create your account' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What our servers can’t see' })).toBeVisible();
  expect(await page.evaluate(noHorizontalOverflow)).toBeLessThanOrEqual(0);
});

for (const [name, size] of [
  ['phone', { width: 375, height: 812 }],
  ['tablet', { width: 768, height: 1024 }],
  ['laptop', { width: 1280, height: 800 }],
  ['desktop', { width: 1680, height: 1050 }],
] as const) {
  test(`public pages fit a ${name} viewport without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const path of [
      '/',
      '/features',
      '/privacy-and-security',
      '/faq',
      '/download',
      '/login',
      '/signup',
      '/forgot-password',
    ]) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(noHorizontalOverflow), path).toBeLessThanOrEqual(0);
    }
  });
}

test('protected routes redirect to sign in and keep the destination', async ({ page }) => {
  for (const path of ['/messages', '/settings/privacy']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
  }
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('removed social and admin areas are not routable', async ({ page }) => {
  for (const path of ['/home', '/explore', '/reels', '/admin/reports']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'This page isn’t here' })).toBeVisible();
  }
});

test('login form validates input client-side', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
});

test('signup form rejects reserved usernames and weak passwords', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('This username is reserved')).toBeVisible();
  await expect(page.getByText('Use at least 8 characters')).toBeVisible();
});

test('unknown routes show a 404 page via the SPA fallback', async ({ page }) => {
  await page.goto('/this/does/not/exist');
  await expect(page.getByRole('heading', { name: 'This page isn’t here' })).toBeVisible();
});

test('keyboard users can reach the sign-in fields with a visible focus indicator', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  let reached = false;
  for (let i = 0; i < 8 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(
      () => (document.activeElement as HTMLInputElement | null)?.type === 'email',
    );
  }
  expect(reached).toBe(true);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});

test('the interface uses the VYBORA type system (DM Sans, IBM Plex Mono)', async ({ page }) => {
  await page.goto('/privacy-and-security');
  await expect(page.getByText('What the server stores')).toBeVisible();
  const fonts = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    mono: getComputedStyle(document.querySelector('.font-mono')!).fontFamily,
  }));
  expect(fonts.body).toContain('DM Sans');
  expect(fonts.mono).toContain('IBM Plex Mono');
});
