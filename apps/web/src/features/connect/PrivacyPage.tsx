import {
  BellIcon,
  CheckCircleIcon,
  ChecksIcon,
  CircleIcon,
  CpuIcon,
  DesktopIcon,
  DeviceMobileIcon,
  DotsThreeIcon,
  HardDrivesIcon,
  LockSimpleIcon,
  ProhibitIcon,
  SignOutIcon,
  UserIcon,
} from '@phosphor-icons/react';
import {
  fetchBlocked,
  fetchConnectPrivacy,
  fetchMyContactMethod,
  qk,
  saveMyContactMethod,
  unblock,
  updateConnectPrivacy,
  type ConnectPrivacy,
} from '@vybora/api';
import { formatRelativeTime, friendlyError } from '@vybora/core';
import { CIPHERSUITE } from '@vybora/e2ee';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Input, Toggle } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { SettingsPage } from '@/features/settings/SettingsNav';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useConnect } from './ConnectProvider';
import { Meta, Row, Section } from './ui';

const E164 = /^\+[1-9]\d{6,14}$/;
type Visibility = 'nobody' | 'contacts' | 'everyone';

export default function PrivacyPage() {
  const { userId } = useMe();
  const { engine, backend, signOutAndWipe } = useConnect();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const privacy = useQuery({
    queryKey: qk.connect.privacy,
    queryFn: () => fetchConnectPrivacy(supabase, userId),
  });
  const devices = useQuery({
    queryKey: qk.connect.devices,
    enabled: !!engine,
    queryFn: () => engine!.listMyDevices(),
  });
  const blocked = useQuery({ queryKey: qk.blocked, queryFn: () => fetchBlocked(supabase) });
  const contact = useQuery({
    queryKey: qk.connect.myPhone,
    queryFn: () => fetchMyContactMethod(supabase, userId),
  });
  const [phone, setPhone] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('nobody');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    label: string;
    action: () => void;
  } | null>(null);

  useEffect(() => {
    setPhone(contact.data?.phone_e164 ?? '');
    setVisibility((contact.data?.visibility as Visibility | undefined) ?? 'nobody');
  }, [contact.data?.phone_e164, contact.data?.visibility]);

  const p = privacy.data;
  const set = (patch: Partial<ConnectPrivacy>) =>
    void updateConnectPrivacy(supabase, userId, patch).then(
      () => qc.invalidateQueries({ queryKey: qk.connect.privacy }),
      (e) => toast.show(friendlyError(e), 'error'),
    );
  const toggle = (
    key: keyof ConnectPrivacy,
    label: string,
    description: string,
    icon: ReactNode,
  ) => (
    <Row
      icon={icon}
      label={label}
      description={description}
      right={
        <Toggle
          checked={!!p?.[key]}
          onChange={(v) => set({ [key]: v })}
          label={label}
          disabled={!p}
        />
      }
    />
  );

  const normalized = phone.replace(/[^\d+]/g, '');
  const phoneValid = !normalized || E164.test(normalized);
  const savePhone = async () => {
    setSaving(true);
    try {
      await saveMyContactMethod(supabase, userId, normalized || null, visibility);
      await qc.invalidateQueries({ queryKey: qk.connect.myPhone });
      toast.show('Phone settings saved', 'success');
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage title="Privacy & security">
      <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4">
        <LockSimpleIcon size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="font-medium">Your messages are end-to-end encrypted</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            They’re encrypted on your device and decrypted only on the devices of the people you
            talk to. VYBORA’s servers store ciphertext only — but can see who you talk to and when.
          </p>
        </div>
      </div>

      <Section
        title="Encryption"
        footer="The MLS library (ts-mls) is open source but has not had an independent security audit, and neither has VYBORA."
      >
        <Row
          icon={<CpuIcon size={18} />}
          label="Protocol"
          value="MLS · RFC 9420"
          description={CIPHERSUITE.replace(/_/g, ' ')}
        />
        <Row
          icon={<HardDrivesIcon size={18} />}
          label="Crypto engine"
          value={backend === 'adapter' ? 'Noble (JavaScript)' : 'Browser WebCrypto'}
        />
        <Row
          icon={<LockSimpleIcon size={18} />}
          label="Storage on this browser"
          description="Keys and history are encrypted in IndexedDB under a non-extractable key."
        />
      </Section>

      <Section
        title="Linked devices"
        footer="Removing a device cuts it off from new messages immediately; it erases its keys the next time it opens."
      >
        {devices.isPending && <p className="px-4 py-4 text-sm text-muted">Loading devices…</p>}
        {devices.isError && (
          <p className="px-4 py-4 text-sm text-danger" role="alert">
            Couldn’t load your devices.{' '}
            <button className="underline" onClick={() => void devices.refetch()}>
              Retry
            </button>
          </p>
        )}
        {(devices.data ?? [])
          .filter((d) => !d.revoked)
          .map((d) => {
            const current = d.id === engine?.deviceId;
            return (
              <Row
                key={d.id}
                icon={
                  d.platform === 'web' ? <DesktopIcon size={18} /> : <DeviceMobileIcon size={18} />
                }
                label={`${d.label || d.platform}${current ? ' · this browser' : ''}`}
                description={`Added ${new Date(d.createdAt).toLocaleDateString()} · active ${formatRelativeTime(d.lastSeenAt)}`}
                right={
                  current ? (
                    <CheckCircleIcon size={18} className="text-success" aria-label="This device" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() =>
                        setConfirm({
                          title: 'Remove device?',
                          description: `${d.label || d.platform} will no longer receive your messages.`,
                          label: 'Remove device',
                          action: () =>
                            void engine!.revokeDevice(d.id).then(
                              () => qc.invalidateQueries({ queryKey: qk.connect.devices }),
                              (e) => toast.show(friendlyError(e), 'error'),
                            ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  )
                }
              />
            );
          })}
      </Section>

      <Section title="Messaging">
        {toggle(
          'read_receipts',
          'Read receipts',
          'If off, others won’t see when you’ve read their messages.',
          <ChecksIcon size={18} />,
        )}
        {toggle(
          'typing_indicators',
          'Typing indicators',
          'Let people see when you’re typing.',
          <DotsThreeIcon size={18} />,
        )}
        {toggle(
          'show_online',
          'Show when I’m online and last seen',
          'Only people you share a chat with can see it. If you turn this off, you won’t see other people’s either.',
          <CircleIcon size={18} />,
        )}
        {p?.message_privacy === 'following' && (
          <Row
            icon={<UserIcon size={18} />}
            label="Who can start chats with me"
            description="Currently limited to people you followed before VYBORA became messaging-only."
            right={
              <Button
                variant="outline"
                size="sm"
                onClick={() => set({ message_privacy: 'everyone' })}
              >
                Allow everyone
              </Button>
            }
          />
        )}
      </Section>

      <Section
        title="Notifications"
        footer="Turning notifications off never blocks or deletes messages. Notifications never include message content."
      >
        {toggle(
          'notifications_enabled',
          'Message notifications',
          'Applies to all chats on all your devices.',
          <BellIcon size={18} />,
        )}
        {toggle(
          'message_previews',
          'Show sender in notifications',
          'If off, notifications only say “New message”.',
          <UserIcon size={18} />,
        )}
      </Section>

      <Section
        title="Phone number"
        footer="Optional and never public by default. Never used to find you; VYBORA never uploads your address book."
      >
        <div className="space-y-3 p-4">
          <Input
            label="Phone (international format)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+14155550123"
            error={phoneValid ? undefined : 'Use international format, for example +14155550123.'}
          />
          <div role="radiogroup" aria-label="Who can see my phone number">
            <p className="mb-1.5 text-[13px] font-semibold">Who can see it</p>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-line-strong">
              {(['nobody', 'contacts', 'everyone'] as const).map((v, i) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={visibility === v}
                  onClick={() => setVisibility(v)}
                  className={cn(
                    'h-10 px-2 text-[13px] font-medium transition-colors duration-150',
                    i > 0 && 'border-l border-line-strong',
                    visibility === v ? 'bg-accent text-on-accent' : 'hover:bg-surface-muted',
                  )}
                >
                  {{ nobody: 'Nobody', contacts: 'People I chat with', everyone: 'Everyone' }[v]}
                </button>
              ))}
            </div>
            <Meta className="mt-1.5 block">
              “People I chat with” also includes accounts you mutually followed in the past.
            </Meta>
          </div>
          <Button onClick={() => void savePhone()} disabled={!phoneValid} loading={saving}>
            Save phone settings
          </Button>
        </div>
      </Section>

      <Section title={`Blocked accounts · ${blocked.data?.length ?? 0}`}>
        {(blocked.data ?? []).map((u) => (
          <Row
            key={u.id}
            icon={<ProhibitIcon size={18} />}
            label={u.username}
            right={
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void unblock(supabase, userId, u.id).then(
                    () => qc.invalidateQueries({ queryKey: qk.blocked }),
                    (e) => toast.show(friendlyError(e), 'error'),
                  )
                }
              >
                Unblock
              </Button>
            }
          />
        ))}
        {blocked.isSuccess && !blocked.data.length && (
          <p className="px-4 py-4 text-sm text-muted">You haven’t blocked anyone.</p>
        )}
      </Section>

      <Section>
        <Row
          icon={<SignOutIcon size={18} />}
          label="Sign out and erase this browser"
          description="Removes this browser as a device and deletes its keys and message history."
          danger
          onClick={() =>
            setConfirm({
              title: 'Erase this browser?',
              description:
                'Decrypted messages on this browser will be deleted. Your other devices keep theirs.',
              label: 'Erase and sign out',
              action: () => void signOutAndWipe().then(() => navigate('/login')),
            })
          }
        />
      </Section>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.action();
          setConfirm(null);
        }}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        danger
      />
    </SettingsPage>
  );
}
