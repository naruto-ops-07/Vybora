import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * End-to-end encrypted messaging against a REAL Supabase backend (no mocks).
 * Requires E2E_SUPABASE_URL + E2E_SUPABASE_ANON_KEY pointing at a disposable
 * stack with all migrations applied and email confirmation disabled
 * (`supabase start`). Never point this at production.
 */
test.skip(
  !process.env.E2E_SUPABASE_URL || !process.env.E2E_SUPABASE_ANON_KEY,
  'Set E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY to run',
);
test.describe.configure({ mode: 'serial' });

const run = Date.now().toString(36);
const user = (name: string) => ({
  email: `${name}.${run}@e2e.vybora.dev`,
  username: `${name}_${run}`,
  password: 'e2e-pass-123',
});
const alice = user('alice');
const bob = user('bob');

async function signup(browser: Browser, u: typeof alice): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/signup');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Username').fill(u.username);
  await page.getByLabel('Display name').fill(u.username);
  await page.getByLabel('Password').fill(u.password);
  await expect(page.getByText('Available')).toBeVisible();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/messages/);
  // The browser's encryption engine is ready once the inbox renders.
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible({ timeout: 30_000 });
  return page;
}

let alicePage: Page;
let bobPage: Page;
let chatUrl = '';

test('two people sign up and each browser registers an encryption device', async ({ browser }) => {
  // Bob first, so his device keys exist before Alice opens the chat.
  bobPage = await signup(browser, bob);
  alicePage = await signup(browser, alice);
  await alicePage.goto('/settings/privacy');
  await expect(alicePage.getByText('this browser')).toBeVisible();
});

test('a direct chat delivers an end-to-end encrypted message both ways', async () => {
  await alicePage.goto('/messages');
  await alicePage.getByLabel('New message').click();
  await alicePage.getByRole('textbox', { name: 'Search people' }).fill(bob.username);
  await alicePage.getByRole('checkbox', { name: new RegExp(bob.username) }).click();
  await alicePage.getByRole('button', { name: `Message ${bob.username}` }).click();
  await expect(alicePage).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  chatUrl = alicePage.url();

  const text = `Hello Bob — ${run}`;
  await alicePage.getByRole('textbox', { name: 'Message' }).fill(text);
  await alicePage.keyboard.press('Enter');
  await expect(alicePage.getByRole('log').getByText(text)).toBeVisible();

  await bobPage.goto('/messages');
  await bobPage.getByRole('link', { name: new RegExp(alice.username) }).click();
  await expect(bobPage.getByRole('log').getByText(text)).toBeVisible({ timeout: 30_000 });

  const reply = `Hi Alice — ${run}`;
  await bobPage.getByRole('textbox', { name: 'Message' }).fill(reply);
  await bobPage.keyboard.press('Enter');
  await expect(alicePage.getByRole('log').getByText(reply)).toBeVisible({ timeout: 30_000 });
});

test('history survives a reload (decrypted locally, not from the server)', async () => {
  await alicePage.goto(chatUrl);
  await expect(alicePage.getByRole('log').getByText(`Hi Alice — ${run}`)).toBeVisible({
    timeout: 30_000,
  });
});

test('privacy settings save and persist', async () => {
  await alicePage.goto('/settings/privacy');
  const receipts = alicePage.getByRole('switch', { name: 'Read receipts' });
  await expect(receipts).toHaveAttribute('aria-checked', 'true');
  await receipts.click();
  await expect(receipts).toHaveAttribute('aria-checked', 'false');
  await alicePage.reload();
  await expect(alicePage.getByRole('switch', { name: 'Read receipts' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

test('a mobile viewport shows list and chat one at a time with working back navigation', async () => {
  await alicePage.setViewportSize({ width: 375, height: 812 });
  await alicePage.goto('/messages');
  await alicePage.getByRole('link', { name: new RegExp(bob.username) }).click();
  await expect(alicePage.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await alicePage.getByRole('link', { name: 'Back to chats' }).click();
  await expect(alicePage.getByRole('heading', { name: 'Chats' })).toBeVisible();
  const overflow = await alicePage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
