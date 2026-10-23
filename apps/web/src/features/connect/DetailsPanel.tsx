import {
  ArchiveIcon,
  BellIcon,
  BellSlashIcon,
  CheckIcon,
  FlagIcon,
  LinkSimpleIcon,
  MusicNoteIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PhoneSlashIcon,
  PlayIcon,
  ProhibitIcon,
  PushPinIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  StarIcon,
  TimerIcon,
  TrashIcon,
  UserMinusIcon,
  UserPlusIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  block,
  fetchContactPhone,
  groupAdmin,
  isMuted,
  MESSAGE_TONES,
  muteUntil,
  peerOf,
  qk,
  reportContent,
  searchProfiles,
  setDisappearing,
  setNickname,
  setSharedTheme,
  updateConversationPreferences,
  WALLPAPERS,
  type ChatTheme,
  type ConnectMember,
  type MessageTone,
  type PreferencePatch,
  type SecureConversation,
  type ThemePreset,
} from '@vybora/api';
import {
  chatAccent,
  chatThemeDefs,
  THEME_ORDER,
  toneLabels,
  wallpaperLabels,
  wallpaperSvg,
} from '@vybora/config';
import { friendlyError, tokenizeText } from '@vybora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Input, Toggle } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { playTone } from '@/lib/connect/tones';
import { supabase } from '@/lib/supabase';
import { ImageAttachment } from './Attachment';
import { useConnect } from './ConnectProvider';
import { conversationTitle, MESSAGE_PAGE, useNicknames } from './hooks';
import { Meta, Row, Section, Select, useIsDark } from './ui';

const DISAPPEARING: { label: string; seconds: number | null }[] = [
  { label: 'Off', seconds: null },
  { label: '5 minutes', seconds: 300 },
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
  { label: '1 week', seconds: 604800 },
];

const MUTE_OPTIONS = [
  { id: '1h', label: 'For 1 hour' },
  { id: '8h', label: 'For 8 hours' },
  { id: '1w', label: 'For 1 week' },
  { id: 'always', label: 'Until I turn it back on' },
] as const;

export function ThemePicker({
  value,
  onPick,
  disabled,
}: {
  value: ChatTheme;
  onPick: (t: ChatTheme) => void;
  disabled?: boolean;
}) {
  const dark = useIsDark();
  const preset = value.preset ?? 'aurora';
  const accent = chatAccent(chatThemeDefs[preset] ?? chatThemeDefs.aurora!, dark);
  return (
    <fieldset disabled={disabled} className={cn('space-y-4 p-4', disabled && 'opacity-60')}>
      <div>
        <legend className="mb-2 text-xs font-medium text-muted">Colour</legend>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Theme colour">
          {THEME_ORDER.map((p) => {
            const d = chatThemeDefs[p]!;
            const active = preset === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onPick({ ...value, preset: p as ThemePreset })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md border py-2 transition-colors duration-150',
                  active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-muted',
                )}
              >
                <span className="h-6 w-6 rounded-sm" style={{ background: d.bubble }} />
                <span className="text-[11px]">{d.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted">Wallpaper</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Wallpaper">
          {WALLPAPERS.map((w) => {
            const svg = wallpaperSvg(w, accent);
            const active = (value.wallpaper ?? 'none') === w;
            return (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onPick({ ...value, wallpaper: w })}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className={cn(
                    'h-14 w-full rounded-md border bg-bg bg-cover bg-center',
                    active ? 'border-accent outline-2 outline-accent' : 'border-line',
                  )}
                  style={{
                    backgroundImage: svg
                      ? `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
                      : undefined,
                  }}
                />
                <span className={cn('text-[11px]', active ? 'text-ink' : 'text-muted')}>
                  {wallpaperLabels[w]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}

interface Confirm {
  title: string;
  description: string;
  label: string;
  danger?: boolean;
  action: () => void;
}

function IconAction({
  children,
  label,
  onClick,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors duration-150',
        danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-surface-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export function DetailsPanel({
  conversation: conv,
  onClose,
  onVerify,
  onOpenStarred,
}: {
  conversation: SecureConversation;
  onClose: () => void;
  onVerify: (userId: string) => void;
  /** Starred messages in this chat (on this browser). */
  onOpenStarred?: () => void;
}) {
  const { userId } = useMe();
  const { engine } = useConnect();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const nicknames = useNicknames();
  const [nickDraft, setNickDraft] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<ChatTheme | null>(null);
  const [localDraft, setLocalDraft] = useState<ChatTheme | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState('');
  const q = useDeferredValue(term.trim());
  const id = conv.id;
  const peer = peerOf(conv, userId);
  const phone = useQuery({
    queryKey: qk.connect.phone(peer?.id ?? ''),
    enabled: !!peer,
    queryFn: () => fetchContactPhone(supabase, peer!.id),
  });
  // Same key and page as the open chat's query, so this reuses its cache.
  const history = useQuery({
    queryKey: [...qk.connect.messages(id), MESSAGE_PAGE],
    enabled: !!engine,
    queryFn: () => engine!.listMessages(id, { limit: MESSAGE_PAGE }),
  });
  const search = useQuery({
    queryKey: qk.search(q),
    enabled: adding && q.length > 0,
    queryFn: () => searchProfiles(supabase, q),
  });

  const isAdmin = conv.myRole === 'admin';
  const canEdit = conv.settingsPolicy === 'everyone' || isAdmin;
  const title = conversationTitle(conv, userId, nicknames.data);
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.connect.inbox });
  const fail = (e: unknown) => {
    const m = (e as { message?: string }).message ?? '';
    toast.show(
      m.includes('theme_conflict')
        ? 'Someone just changed the theme. Showing the latest — try again.'
        : m.includes('admins_only')
          ? 'Only group admins can change this.'
          : friendlyError(e),
      'error',
    );
    if (m.includes('theme_conflict')) {
      setThemeDraft(null);
      refresh();
    }
  };
  const prefs = (patch: PreferencePatch) =>
    updateConversationPreferences(supabase, userId, id, patch).then(refresh, fail);

  const items = history.data ?? [];
  const images = items.filter(
    (m) => m.kind === 'attachment' && !m.deleted && m.attachment?.kind === 'image',
  );
  const fileCount = items.filter(
    (m) => m.kind === 'attachment' && !m.deleted && m.attachment?.kind !== 'image',
  ).length;
  const links = items
    .flatMap((m) => (m.body && !m.deleted ? tokenizeText(m.body) : []))
    .flatMap((t) => (t.type === 'url' ? [t] : []))
    .slice(-6)
    .reverse();

  const memberName = (m: ConnectMember) =>
    m.id === userId ? 'You' : (nicknames.data?.[m.id] ?? (m.display_name || m.username));
  const muted = isMuted(conv);

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <h2 className="text-[15px] font-semibold">Chat info</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
          <XIcon size={18} />
        </Button>
      </div>

      <div className="space-y-6 p-4 pb-12">
        <div className="flex flex-col items-center pt-2 text-center">
          {conv.kind === 'group' ? (
            <GroupAvatar members={conv.members.filter((x) => x.id !== userId)} size={72} />
          ) : (
            <Avatar
              path={peer?.avatar_path}
              name={peer?.username ?? '?'}
              userId={peer?.id ?? conv.id}
              displayName={peer?.display_name}
              size={72}
            />
          )}
          {titleDraft === null ? (
            <p className="mt-3 flex items-center gap-1 text-lg font-semibold">
              {title}
              {conv.kind === 'group' && canEdit && (
                <IconAction label="Rename group" onClick={() => setTitleDraft(conv.title ?? '')}>
                  <PencilSimpleIcon size={14} />
                </IconAction>
              )}
            </p>
          ) : (
            <form
              className="mt-3 flex w-full items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const next = titleDraft.trim();
                if (!next) return toast.show('Group name can’t be empty.', 'error');
                void groupAdmin
                  .updateInfo(supabase, id, next.slice(0, 80), conv.avatarPath)
                  .then(() => {
                    setTitleDraft(null);
                    refresh();
                  }, fail);
              }}
            >
              <div className="flex-1">
                <Input
                  autoFocus
                  aria-label="Group name"
                  value={titleDraft}
                  maxLength={80}
                  onChange={(e) => setTitleDraft(e.target.value)}
                />
              </div>
              <Button type="submit" size="icon" aria-label="Save group name">
                <CheckIcon size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTitleDraft(null)}
                aria-label="Cancel"
              >
                <XIcon size={16} />
              </Button>
            </form>
          )}
          {peer && (
            <Meta className="mt-0.5">
              @{peer.username}
              {nicknames.data?.[peer.id] ? ` · ${peer.display_name || peer.username}` : ''}
            </Meta>
          )}
          {conv.kind === 'group' && <Meta className="mt-0.5">{conv.members.length} members</Meta>}
        </div>

        {conv.kind === 'direct' && peer && (
          <Section
            title="Contact"
            footer="Nicknames are private: only you see them, on your devices."
          >
            {nickDraft === null ? (
              <Row
                icon={<PencilSimpleIcon size={18} />}
                label="Nickname"
                value={nicknames.data?.[peer.id] ?? 'Add'}
                onClick={() => setNickDraft(nicknames.data?.[peer.id] ?? '')}
              />
            ) : (
              <form
                className="flex items-end gap-2 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void setNickname(supabase, userId, peer.id, nickDraft.trim() || null).then(() => {
                    setNickDraft(null);
                    void qc.invalidateQueries({ queryKey: qk.connect.nicknames });
                  }, fail);
                }}
              >
                <div className="flex-1">
                  <Input
                    autoFocus
                    value={nickDraft}
                    onChange={(e) => setNickDraft(e.target.value)}
                    maxLength={40}
                    placeholder={peer.display_name || peer.username}
                    aria-label="Nickname"
                  />
                </div>
                <Button type="submit" size="icon" aria-label="Save nickname">
                  <CheckIcon size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setNickDraft(null)}
                  aria-label="Cancel"
                >
                  <XIcon size={16} />
                </Button>
              </form>
            )}
            {phone.data ? (
              <Row
                icon={<PhoneIcon size={18} />}
                label="Phone"
                value={phone.data}
                right={
                  <a
                    href={`tel:${phone.data}`}
                    className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Call
                  </a>
                }
              />
            ) : (
              <Row icon={<PhoneSlashIcon size={18} />} label="Phone" value="Not shared" />
            )}
          </Section>
        )}

        <Section
          title="Notifications"
          footer="Muting or turning off notifications never blocks or deletes messages."
        >
          <Row
            icon={<BellIcon size={18} />}
            label="Notifications"
            right={
              <Toggle
                checked={conv.notificationsEnabled}
                onChange={(v) => void prefs({ notifications_enabled: v })}
                label="Notifications for this chat"
              />
            }
          />
          <Row
            icon={<BellSlashIcon size={18} />}
            label="Mute"
            description={
              muted
                ? conv.mutedUntil === 'infinity'
                  ? 'Muted until you turn it back on'
                  : `Muted until ${new Date(conv.mutedUntil!).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                : undefined
            }
            right={
              <Select
                label="Mute this chat"
                value={muted ? 'muted' : 'off'}
                options={[
                  { value: muted ? 'muted' : 'off', label: muted ? 'Muted' : 'Off' },
                  ...(muted ? [{ value: 'unmute', label: 'Unmute' }] : []),
                  ...MUTE_OPTIONS.map((o) => ({ value: o.id as string, label: o.label })),
                ]}
                onChange={(v) => {
                  if (v === 'unmute') void prefs({ muted_until: null });
                  else if (v !== 'muted' && v !== 'off')
                    void prefs({
                      muted_until: muteUntil(v as (typeof MUTE_OPTIONS)[number]['id']),
                    });
                }}
              />
            }
          />
          <Row
            icon={<MusicNoteIcon size={18} />}
            label="Message tone"
            right={
              <span className="flex items-center gap-1">
                <IconAction label="Preview tone" onClick={() => playTone(conv.tone)}>
                  <PlayIcon size={14} />
                </IconAction>
                <Select<MessageTone>
                  label="Message tone"
                  value={conv.tone}
                  options={MESSAGE_TONES.map((t) => ({ value: t, label: toneLabels[t] ?? t }))}
                  onChange={(t) => {
                    playTone(t);
                    void prefs({ tone: t });
                  }}
                />
              </span>
            }
          />
        </Section>

        <Section
          title="Chat theme"
          footer={
            canEdit
              ? 'The shared theme is shown to everyone in this chat, on all their devices. It never affects messages or encryption.'
              : 'Only group admins can change the shared theme.'
          }
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <span className="text-sm font-medium">Shared with everyone</span>
            <Meta>v{conv.themeVersion}</Meta>
          </div>
          <ThemePicker
            value={themeDraft ?? conv.theme}
            onPick={setThemeDraft}
            disabled={!canEdit}
          />
          {themeDraft && (
            <div className="flex gap-2 px-4 pb-4">
              <Button variant="secondary" className="flex-1" onClick={() => setThemeDraft(null)}>
                Cancel
              </Button>
              <Button
                className="flex-[2]"
                onClick={() =>
                  setConfirm({
                    title: 'Change theme for everyone?',
                    description: `Everyone in “${title}” will see this theme and wallpaper on all their devices.`,
                    label: 'Apply for everyone',
                    action: () =>
                      void setSharedTheme(supabase, id, themeDraft, conv.themeVersion).then(() => {
                        setThemeDraft(null);
                        refresh();
                      }, fail),
                  })
                }
              >
                Apply for everyone
              </Button>
            </div>
          )}
          <Row
            label="Use my own theme instead"
            description="A personal override, only on your devices"
            right={
              <Toggle
                checked={conv.useLocalTheme}
                onChange={(v) =>
                  void prefs({ use_local_theme: v, local_theme: conv.localTheme ?? conv.theme })
                }
                label="Use my own theme"
              />
            }
          />
          {conv.useLocalTheme && (
            <>
              <ThemePicker
                value={localDraft ?? conv.localTheme ?? conv.theme}
                onPick={setLocalDraft}
              />
              {localDraft && (
                <div className="px-4 pb-4">
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() =>
                      void prefs({ local_theme: localDraft }).then(() => setLocalDraft(null))
                    }
                  >
                    Save my theme
                  </Button>
                </div>
              )}
            </>
          )}
        </Section>

        <Section title="Privacy">
          <Row
            icon={<TimerIcon size={18} />}
            label="Disappearing messages"
            description="New messages disappear for everyone after this time"
            right={
              <Select
                label="Disappearing messages"
                value={String(conv.disappearingSeconds ?? 'off')}
                options={DISAPPEARING.map((o) => ({
                  value: String(o.seconds ?? 'off'),
                  label: o.label,
                }))}
                onChange={(v) =>
                  canEdit
                    ? void setDisappearing(supabase, id, v === 'off' ? null : Number(v)).then(
                        refresh,
                        fail,
                      )
                    : toast.show('Only group admins can change this.', 'error')
                }
              />
            }
          />
          {peer && (
            <Row
              icon={<ShieldCheckIcon size={18} />}
              label="Verify safety number"
              description="Confirm no one is intercepting this chat"
              onClick={() => onVerify(peer.id)}
            />
          )}
          <Row
            icon={<PushPinIcon size={18} />}
            label="Pin chat"
            right={
              <Toggle
                checked={conv.pinned}
                onChange={(v) => void prefs({ pinned: v })}
                label="Pin chat"
              />
            }
          />
          <Row
            icon={<ArchiveIcon size={18} />}
            label="Archive chat"
            right={
              <Toggle
                checked={conv.archived}
                onChange={(v) => void prefs({ archived: v })}
                label="Archive chat"
              />
            }
          />
        </Section>

        <Section title={`Media · ${images.length} photos · ${fileCount} files`}>
          {images.length ? (
            <div className="grid grid-cols-3 gap-1 p-2">
              {images
                .slice(-9)
                .reverse()
                .map((m) => (
                  <div
                    key={m.id}
                    className="aspect-square overflow-hidden [&>button]:!aspect-square [&>button]:!w-full"
                  >
                    <ImageAttachment attachment={m.attachment!} />
                  </div>
                ))}
            </div>
          ) : (
            <p className="px-4 py-4 text-sm text-muted">Photos and files you share appear here.</p>
          )}
          {links.map((l, i) => (
            <a
              key={`${l.href}-${i}`}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-muted"
            >
              <LinkSimpleIcon size={16} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">{l.value.replace(/^https?:\/\//, '')}</span>
            </a>
          ))}
        </Section>

        {onOpenStarred && (
          <Section>
            <Row
              icon={<StarIcon size={18} />}
              label="Starred messages"
              description="Stars stay on this browser"
              onClick={onOpenStarred}
            />
          </Section>
        )}

        {conv.kind === 'group' && (
          <Section
            title={`${conv.members.length} members`}
            footer={
              conv.settingsPolicy === 'admins' && !isAdmin
                ? 'Only admins can edit group settings.'
                : 'New members can only read messages sent after they join.'
            }
          >
            {canEdit && (
              <Row
                icon={<UserPlusIcon size={18} />}
                label="Add members"
                onClick={() => setAdding(true)}
              />
            )}
            {conv.members.map((m) => (
              <div key={m.id} className="group flex items-center gap-3 px-4 py-2.5">
                <Avatar
                  path={m.avatar_path}
                  name={m.username}
                  userId={m.id}
                  displayName={m.display_name}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{memberName(m)}</p>
                  <Meta>@{m.username}</Meta>
                </div>
                {m.role === 'admin' && (
                  <span className="rounded-sm border border-line px-1.5 text-[11px] font-medium text-muted">
                    Admin
                  </span>
                )}
                {m.id !== userId && (
                  <div className="flex opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                    <IconAction label={`Verify ${m.username}`} onClick={() => onVerify(m.id)}>
                      <ShieldCheckIcon size={15} />
                    </IconAction>
                    {isAdmin && (
                      <>
                        <IconAction
                          label={
                            m.role === 'admin'
                              ? `Remove ${m.username} as admin`
                              : `Make ${m.username} admin`
                          }
                          onClick={() =>
                            void groupAdmin
                              .setRole(supabase, id, m.id, m.role === 'admin' ? 'member' : 'admin')
                              .then(refresh, fail)
                          }
                        >
                          <SlidersHorizontalIcon size={15} />
                        </IconAction>
                        <IconAction
                          danger
                          label={`Remove ${m.username}`}
                          onClick={() =>
                            setConfirm({
                              title: `Remove ${m.username}?`,
                              description: 'They’ll stop receiving new messages in this group.',
                              label: 'Remove',
                              danger: true,
                              action: () =>
                                void groupAdmin.removeMember(supabase, id, m.id).then(() => {
                                  refresh();
                                  void engine?.sync(id);
                                }, fail),
                            })
                          }
                        >
                          <UserMinusIcon size={15} />
                        </IconAction>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isAdmin && (
              <Row
                label="Only admins can edit settings"
                right={
                  <Toggle
                    checked={conv.settingsPolicy === 'admins'}
                    onChange={(v) =>
                      void groupAdmin
                        .setPolicy(supabase, id, v ? 'admins' : 'everyone')
                        .then(refresh, fail)
                    }
                    label="Only admins can edit settings"
                  />
                }
              />
            )}
          </Section>
        )}

        <Section>
          <Row
            icon={<TrashIcon size={18} />}
            label="Clear chat on this browser"
            danger
            onClick={() =>
              setConfirm({
                title: 'Clear chat?',
                description: 'Removes the decrypted history from this browser only.',
                label: 'Clear',
                danger: true,
                action: () => void engine?.clearConversation(id),
              })
            }
          />
          {conv.kind === 'direct' && peer && (
            <>
              <Row
                icon={<FlagIcon size={18} />}
                label={`Report ${peer.username}`}
                danger
                onClick={() =>
                  setConfirm({
                    title: 'Report account?',
                    description:
                      'Your report is recorded for the service operator. Message content stays encrypted and is never included.',
                    label: 'Report',
                    danger: true,
                    action: () =>
                      void reportContent(supabase, userId, {
                        target_type: 'profile',
                        target_id: peer.id,
                        reason: 'harassment',
                      }).then(() => toast.show('Report recorded. Thank you.', 'success'), fail),
                  })
                }
              />
              <Row
                icon={<ProhibitIcon size={18} />}
                label={`Block ${peer.username}`}
                danger
                onClick={() =>
                  setConfirm({
                    title: `Block ${peer.username}?`,
                    description: 'They won’t be able to message you or start new chats with you.',
                    label: 'Block',
                    danger: true,
                    action: () =>
                      void block(supabase, userId, peer.id).then(() => navigate('/messages'), fail),
                  })
                }
              />
            </>
          )}
          {conv.kind === 'group' && (
            <Row
              icon={<SignOutIcon size={18} />}
              label="Leave group"
              danger
              onClick={() =>
                setConfirm({
                  title: 'Leave group?',
                  description: 'You’ll stop receiving messages from this group.',
                  label: 'Leave',
                  danger: true,
                  action: () =>
                    void groupAdmin.removeMember(supabase, id, userId).then(() => {
                      refresh();
                      navigate('/messages');
                    }, fail),
                })
              }
            />
          )}
          <Row
            icon={<XCircleIcon size={18} />}
            label="Delete chat"
            description="Clears it here and hides it until a new message arrives"
            danger
            onClick={() =>
              setConfirm({
                title: 'Delete chat?',
                description: 'Messages are removed from your devices. Others keep their copies.',
                label: 'Delete',
                danger: true,
                action: () =>
                  void (async () => {
                    await engine?.clearConversation(id);
                    await prefs({ archived: true, cleared_before_seq: conv.lastSeq });
                    navigate('/messages');
                  })(),
              })
            }
          />
        </Section>

        <p className="text-center text-xs text-muted">
          Devices and privacy:{' '}
          <Link
            to="/settings/privacy"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Privacy &amp; security
          </Link>
        </p>
      </div>

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
        danger={confirm?.danger}
      />

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add members"
        description="New members can only read messages sent after they join."
        size="sm"
      >
        <Input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search people"
          aria-label="Search people"
        />
        <ul className="mt-2 divide-y divide-line">
          {(search.data ?? [])
            .filter((u) => !conv.members.some((m) => m.id === u.id))
            .map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() =>
                    void groupAdmin.addMembers(supabase, id, [u.id]).then(() => {
                      refresh();
                      void engine?.sync(id); // add their devices to the encrypted group now
                      setAdding(false);
                      setTerm('');
                    }, fail)
                  }
                  className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface-muted"
                >
                  <Avatar
                    path={u.avatar_path}
                    name={u.username}
                    userId={u.id}
                    displayName={u.display_name}
                    size={32}
                  />
                  <span className="flex-1 text-sm font-medium">{u.username}</span>
                  <UserPlusIcon size={16} className="text-accent" aria-hidden="true" />
                </button>
              </li>
            ))}
        </ul>
      </Dialog>
    </div>
  );
}
