import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Full social flows against a REAL Supabase backend (no mocks).
 * Requires E2E_SUPABASE_URL + E2E_SUPABASE_ANON_KEY and email confirmation
 * disabled (default for `supabase start`, see supabase/config.toml).
 */
test.skip(
  !process.env.E2E_SUPABASE_URL || !process.env.E2E_SUPABASE_ANON_KEY,
  'Set E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY to run',
);
test.describe.configure({ mode: 'serial' });

const here = dirname(fileURLToPath(import.meta.url));
const run = Date.now().toString(36);
const alice = {
  email: `alice.${run}@e2e.vybora.dev`,
  username: `alice_${run}`,
  password: 'e2e-pass-123',
};
const bob = {
  email: `bob.${run}@e2e.vybora.dev`,
  username: `bob_${run}`,
  password: 'e2e-pass-123',
};
let postUrl = '';

async function signup(page: Page, u: typeof alice) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Username').fill(u.username);
  await page.getByLabel('Display name').fill(u.username);
  await page.getByLabel('Password').fill(u.password);
  await expect(page.getByText('Available')).toBeVisible();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function login(page: Page, u: typeof alice) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/home/);
}

async function logout(page: Page) {
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('sign up two users and edit a profile', async ({ page }) => {
  await signup(page, bob);
  await logout(page);
  await signup(page, alice);
  await page.goto('/settings/profile');
  await page.getByLabel('Bio').fill('Testing VYBORA end to end');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Bio')).toHaveValue('Testing VYBORA end to end');
});

test('create a post with a real image upload', async ({ page }) => {
  await login(page, alice);
  await page.goto('/create');
  await page.locator('input[type=file]').setInputFiles(join(here, 'fixtures', 'pixel.png'));
  await page.getByLabel('Caption').fill(`First post #e2e${run}`);
  await page.getByRole('button', { name: 'Share post' }).click();
  await expect(page).toHaveURL(/\/p\//);
  postUrl = new URL(page.url()).pathname;
  await page.reload();
  await expect(page.getByText(`#e2e${run}`).first()).toBeVisible();
});

test('another user follows, likes and comments; state persists after refresh', async ({ page }) => {
  await login(page, bob);
  await page.goto(`/u/${alice.username}`);
  await page.getByRole('button', { name: 'Follow' }).click();
  await expect(page.getByRole('button', { name: 'Following' })).toBeVisible();

  await page.goto(postUrl);
  const like = page.getByRole('button', { name: 'Like' }).first();
  await like.click();
  await expect(page.getByRole('button', { name: 'Unlike' }).first()).toBeVisible();
  await page.getByLabel('Add a comment').first().fill('Lovely!');
  await page.getByRole('button', { name: 'Post' }).first().click();
  await expect(page.getByText('Lovely!').first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Unlike' }).first()).toBeVisible();
  await expect(page.getByText('Lovely!').first()).toBeVisible();

  await page.goto('/home');
  await expect(page.getByText(`#e2e${run}`).first()).toBeVisible();
});

test('the author is notified', async ({ page }) => {
  await login(page, alice);
  await page.goto('/notifications');
  await expect(page.getByText('started following you.')).toBeVisible();
  await expect(page.getByText('liked your post.')).toBeVisible();
});

test('unauthorized access is rejected by the backend, not just the UI', async ({ page }) => {
  await login(page, bob);
  // A non-staff user forcing the admin route sees "Not authorized".
  await page.goto('/admin');
  await expect(page.getByText('Not authorized')).toBeVisible();
  // Direct API call to a privileged RPC with Bob's session is refused by Postgres.
  const result = await page.evaluate(
    async ({ url, key }) => {
      const raw = Object.entries(localStorage).find(([k]) => k.includes('auth-token'))?.[1];
      const token = raw ? JSON.parse(raw).access_token : '';
      const res = await fetch(`${url}/rest/v1/rpc/admin_overview`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      return { status: res.status, body: await res.text() };
    },
    { url: process.env.E2E_SUPABASE_URL!, key: process.env.E2E_SUPABASE_ANON_KEY! },
  );
  expect(result.status).toBeGreaterThanOrEqual(400);
  expect(result.body).toContain('forbidden');
});
