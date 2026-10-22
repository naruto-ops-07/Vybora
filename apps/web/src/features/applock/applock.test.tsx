import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { appLockKey } from '@vybora/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { AppLockCover } from './AppLockGate';
import { AppLockProvider, useAppLock } from './AppLockProvider';
import {
  clearLock,
  createRecord,
  loadLock,
  saveLock,
  toB64,
  verifyPasscode,
  type AppLockRecord,
} from './store';
import { verifyAssertion } from './webauthn';

const USER = 'user-1';
const CODE = '246810';
let base: AppLockRecord;

beforeAll(async () => {
  base = await createRecord(CODE);
}, 30_000);

afterEach(() => {
  localStorage.clear();
  document.title = 'VYBORA';
  vi.restoreAllMocks();
});

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

let api: ReturnType<typeof useAppLock> | null = null;
function Probe() {
  api = useAppLock();
  return null;
}

function mount(opts: { now?: () => number; signOut?: () => Promise<void> } = {}) {
  return render(
    <ToastProvider>
      <AppLockProvider
        userId={USER}
        userName="sam"
        signOut={opts.signOut ?? (async () => undefined)}
        now={opts.now}
      >
        <Probe />
        <AppLockCover>
          <p>Secret chat preview</p>
        </AppLockCover>
      </AppLockProvider>
    </ToastProvider>,
  );
}

describe('passcode hashing', () => {
  it('round-trips with PBKDF2 and a random salt; nothing stores the passcode', async () => {
    expect(base.iterations).toBe(600_000);
    expect(await verifyPasscode(base, CODE)).toBe(true);
    expect(await verifyPasscode(base, '000000')).toBe(false);
    const again = await createRecord(CODE);
    expect(again.salt).not.toBe(base.salt);
    expect(again.hash).not.toBe(base.hash);
    saveLock(USER, base);
    const raw = localStorage.getItem(appLockKey(USER))!;
    expect(raw).not.toContain(CODE);
    expect(loadLock(USER)).toEqual(base);
  }, 30_000);
});

describe('lock screen', () => {
  it('stays open when no lock is set', () => {
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Secret chat preview')).toBeVisible();
  });

  it('locks when the app opens and hides the workspace', () => {
    saveLock(USER, base);
    mount();
    const dialog = screen.getByRole('dialog', { name: 'VYBORA is locked' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Passcode, 6 digits')).toHaveAttribute('inputmode', 'numeric');
    const content = screen.getByTestId('applock-content');
    expect(content).toHaveAttribute('inert');
    expect(content).toHaveAttribute('aria-hidden', 'true');
  });

  it('unlocks with the right passcode', async () => {
    saveLock(USER, base);
    mount();
    fireEvent.change(screen.getByLabelText('Passcode, 6 digits'), { target: { value: CODE } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 10_000 });
    expect(screen.getByTestId('applock-content')).not.toHaveAttribute('inert');
  }, 15_000);

  it('announces a wrong passcode', async () => {
    saveLock(USER, base);
    mount();
    fireEvent.change(screen.getByLabelText('Passcode, 6 digits'), { target: { value: '111111' } });
    await waitFor(
      () => expect(screen.getByRole('status')).toHaveTextContent('Wrong passcode. Try again.'),
      {
        timeout: 10_000,
      },
    );
  }, 15_000);

  it('drops the unread count from the title while locked', async () => {
    saveLock(USER, base);
    document.title = '(3) VYBORA';
    mount();
    expect(document.title).toBe('VYBORA');
    document.title = '(4) VYBORA';
    await waitFor(() => expect(document.title).toBe('VYBORA'));
  });
});

describe('wrong-attempt backoff', () => {
  it('waits 30 s after 5 wrong tries, then doubles; offers sign out after 10', async () => {
    let t = 1_000_000;
    saveLock(USER, { ...base, attempts: { failures: 4, waitUntil: 0 } });
    mount({ now: () => t });
    let r = await act(() => api!.unlock('111111'));
    expect(r).toEqual({ ok: false, message: 'Wrong passcode. Try again in 30 seconds.' });
    expect(api!.waitMs).toBe(30_000);
    // During the wait the passcode isn't even checked.
    r = await act(() => api!.unlock(CODE));
    expect(r.ok).toBe(false);
    expect(api!.locked).toBe(true);
    t += 30_000;
    r = await act(() => api!.unlock('111111'));
    expect(r).toEqual({ ok: false, message: 'Wrong passcode. Try again in 1 minute.' });
    expect(loadLock(USER)!.attempts).toEqual({ failures: 6, waitUntil: t + 60_000 });
    expect(api!.offerSignOut).toBe(false);
  }, 20_000);

  it('offers “Sign out of this device” after 10 wrong tries', () => {
    saveLock(USER, { ...base, attempts: { failures: 10, waitUntil: 0 } });
    mount();
    expect(screen.getByRole('button', { name: 'Sign out of this device' })).toBeInTheDocument();
  });

  it('keeps a wait across reloads', () => {
    const t = 5_000;
    saveLock(USER, { ...base, attempts: { failures: 5, waitUntil: t + 30_000 } });
    mount({ now: () => t });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Too many wrong tries. Try again in 30 seconds.',
    );
    expect(screen.getByLabelText('Passcode, 6 digits')).toBeDisabled();
  });
});

describe('lock after time away', () => {
  async function unlockedWith(away: AppLockRecord['away'], clock: { t: number }) {
    saveLock(USER, { ...base, away });
    mount({ now: () => clock.t });
    await act(() => api!.unlock(CODE));
    expect(api!.locked).toBe(false);
  }

  it.each([
    ['1m', 59_000, 60_000],
    ['5m', 299_000, 300_000],
    ['1h', 3_599_000, 3_600_000],
  ] as const)(
    '%s: stays open after %i ms, locks after %i ms hidden',
    async (away, short, long) => {
      const clock = { t: 0 };
      await unlockedWith(away, clock);
      act(() => setVisibility('hidden'));
      clock.t += short;
      act(() => setVisibility('visible'));
      expect(api!.locked).toBe(false);
      act(() => setVisibility('hidden'));
      clock.t += long;
      act(() => setVisibility('visible'));
      expect(api!.locked).toBe(true);
    },
    20_000,
  );

  it('immediately: locks as soon as the tab is hidden', async () => {
    const clock = { t: 0 };
    await unlockedWith('immediately', clock);
    act(() => setVisibility('hidden'));
    expect(api!.locked).toBe(true);
    act(() => setVisibility('visible'));
  }, 20_000);

  it('locks an idle visible tab after the chosen time', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const clock = { t: 0 };
      await unlockedWith('1m', clock);
      clock.t += 61_000;
      act(() => vi.advanceTimersByTime(15_000));
      expect(api!.locked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);
});

describe('signing out', () => {
  it('“Sign out of this device” clears the lock and signs out', async () => {
    const signOut = vi.fn(async () => undefined);
    saveLock(USER, { ...base, attempts: { failures: 10, waitUntil: 0 } });
    mount({ signOut });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of this device' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(loadLock(USER)).toBeNull();
  });

  it('turning off needs the passcode', async () => {
    saveLock(USER, base);
    mount();
    expect(await act(() => api!.turnOff('000000'))).toBe(false);
    expect(loadLock(USER)).not.toBeNull();
    expect(await act(() => api!.turnOff(CODE))).toBe(true);
    expect(loadLock(USER)).toBeNull();
  }, 20_000);

  it('clearLock removes only that user’s lock', () => {
    saveLock(USER, base);
    saveLock('other', base);
    clearLock(USER);
    expect(loadLock(USER)).toBeNull();
    expect(loadLock('other')).not.toBeNull();
  });
});

describe('WebAuthn unlock (mocked authenticator)', () => {
  const origin = 'http://localhost:3000';
  const rpId = 'localhost';

  async function authenticator() {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
    const stored = { id: toB64(new Uint8Array([7, 7, 7])), publicKey: toB64(spki), alg: -7 };
    const sign = async (challenge: Uint8Array, opts: { flags?: number; origin?: string } = {}) => {
      const rpHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)),
      );
      const auth = new Uint8Array(37);
      auth.set(rpHash, 0);
      auth[32] = opts.flags ?? 0x05;
      const clientDataJSON = new TextEncoder().encode(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: toB64(challenge),
          origin: opts.origin ?? origin,
        }),
      );
      const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON));
      const signed = new Uint8Array(69);
      signed.set(auth, 0);
      signed.set(clientHash, 37);
      const raw = new Uint8Array(
        await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, signed),
      );
      return { authenticatorData: auth, clientDataJSON, signature: rawToDer(raw) };
    };
    return { stored, sign };
  }

  it('accepts a verified assertion and rejects tampering', async () => {
    const { stored, sign } = await authenticator();
    const challenge = new Uint8Array(32).fill(9);
    const good = await sign(challenge);
    expect(await verifyAssertion(stored, good, { challenge, origin, rpId })).toBe(true);
    expect(
      await verifyAssertion(stored, good, { challenge: new Uint8Array(32), origin, rpId }),
    ).toBe(false);
    const noUv = await sign(challenge, { flags: 0x01 });
    expect(await verifyAssertion(stored, noUv, { challenge, origin, rpId })).toBe(false);
    const elsewhere = await sign(challenge, { origin: 'https://evil.test' });
    expect(await verifyAssertion(stored, elsewhere, { challenge, origin, rpId })).toBe(false);
  });

  it('unlocks the app through navigator.credentials.get', async () => {
    const { stored, sign } = await authenticator();
    const { location } = window;
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...location, origin, hostname: rpId });
    const get = vi.fn(async (opts: CredentialRequestOptions) => {
      const r = await sign(new Uint8Array(opts.publicKey!.challenge as ArrayBuffer));
      return { rawId: new Uint8Array([7, 7, 7]).buffer, response: r } as unknown as Credential;
    });
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get } });
    saveLock(USER, { ...base, biometric: stored });
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlock with fingerprint, face or Windows Hello' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const opts = get.mock.calls[0]![0].publicKey!;
    expect(opts.userVerification).toBe('required');
  });
});

/** r‖s → DER, as authenticators send ECDSA signatures. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0]! & 0x80) v = new Uint8Array([0, ...v]);
    return new Uint8Array([0x02, v.length, ...v]);
  };
  const r = int(raw.slice(0, 32));
  const s = int(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

describe('settings', () => {
  it('turns on with a confirmed passcode and says what it does', async () => {
    const { AppLockSettings } = await import('./AppLockSection');
    const onTurnOn = vi.fn(async () => undefined);
    render(
      <ToastProvider>
        <AppLockSettings
          enabled={false}
          away={null}
          hasBiometric={false}
          canUseBiometric={false}
          onTurnOn={onTurnOn}
          onTurnOff={async () => true}
          onAway={() => undefined}
          onAddBiometric={async () => undefined}
          onRemoveBiometric={() => undefined}
        />
      </ToastProvider>,
    );
    expect(
      screen.getByText('App lock hides your chats on this device. It doesn’t encrypt them.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Turn on app lock/ }));
    fireEvent.change(screen.getByLabelText('Choose a 6-digit passcode'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Enter the passcode again'), {
      target: { value: '654321' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on app lock' }));
    expect(
      await screen.findByText('Those passcodes didn’t match. Choose one again.'),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Choose a 6-digit passcode'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Enter the passcode again'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on app lock' }));
    await waitFor(() => expect(onTurnOn).toHaveBeenCalledWith('123456'));
  });
});
