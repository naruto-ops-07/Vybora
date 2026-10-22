import type { ReactNode } from 'react';
import { AppLockSettings, type AppLockSettingsProps } from '@/features/applock/AppLockSection';
import { LockScreen } from '@/features/applock/LockScreen';

const noop = async () => ({ ok: false, message: 'Wrong passcode. Try again.' });

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-[13px] font-semibold text-muted">{label}</figcaption>
      {children}
    </figure>
  );
}

const settings: AppLockSettingsProps = {
  enabled: false,
  away: null,
  hasBiometric: false,
  canUseBiometric: true,
  onTurnOn: async () => undefined,
  onTurnOff: async () => false,
  onAway: () => undefined,
  onAddBiometric: async () => undefined,
  onRemoveBiometric: () => undefined,
};

/** Lock screen and Settings → Privacy → App lock, in every state worth reviewing. */
export function AppLockSection() {
  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-3">
        <Frame label="Locked">
          <LockScreen
            contained
            waitMs={0}
            offerSignOut={false}
            hasBiometric
            onPasscode={noop}
            onBiometric={noop}
            onSignOut={() => undefined}
          />
        </Frame>
        <Frame label="Wrong passcode">
          <LockScreen
            contained
            waitMs={0}
            offerSignOut={false}
            hasBiometric={false}
            initialMessage="Wrong passcode. Try again."
            onPasscode={noop}
            onBiometric={noop}
            onSignOut={() => undefined}
          />
        </Frame>
        <Frame label="Waiting, after 10 wrong tries">
          <LockScreen
            contained
            waitMs={960_000}
            offerSignOut
            hasBiometric
            onPasscode={noop}
            onBiometric={noop}
            onSignOut={() => undefined}
          />
        </Frame>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Frame label="Off">
          <AppLockSettings {...settings} />
        </Frame>
        <Frame label="Choose a passcode">
          <AppLockSettings {...settings} initialStep="set" />
        </Frame>
        <Frame label="Passcodes didn’t match">
          <AppLockSettings
            {...settings}
            initialStep="set"
            initialError="Those passcodes didn’t match. Choose one again."
          />
        </Frame>
        <Frame label="On, with biometrics">
          <AppLockSettings {...settings} enabled away="1m" hasBiometric />
        </Frame>
        <Frame label="Turning off">
          <AppLockSettings {...settings} enabled away="1m" initialStep="off" />
        </Frame>
      </div>
    </div>
  );
}
