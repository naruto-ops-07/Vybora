/**
 * Gallery sections for D2: the four empty states, Get started (0/3, 2/3, done)
 * and the HandleCard (full and compact), using the same components as the app.
 */
import { friendInviteLink } from '@vybora/core';
import type { ReactNode } from 'react';
import { Meta } from '@/features/connect/ui';
import { HandleCardView } from '@/features/friends/HandleCard';
import {
  AddFriendLink,
  FriendsEmpty,
  NoChatsEmpty,
  NoResultsEmpty,
  WelcomeEmpty,
} from '@/features/onboarding/EmptyStates';
import { GetStartedView } from '@/features/onboarding/GetStarted';
import { cn } from '@/lib/cn';
import { PEOPLE } from '../sample';

const noop = () => undefined;
const ME = PEOPLE.turquoise;
const LINK = friendInviteLink('https://vybora.example', ME.username);

function Handle({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  return <HandleCardView person={ME} link={LINK} variant={variant} />;
}

function Frame({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className="min-w-0">
      <figcaption>
        <Meta>{label}</Meta>
      </figcaption>
      <div className={cn('mt-2 overflow-hidden rounded-lg border border-line', className)}>
        {children}
      </div>
    </figure>
  );
}

export function EmptyStatesSection() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Frame label="Content pane, no chat selected" className="flex justify-center bg-bg p-8">
        <WelcomeEmpty onCompose={noop} handle={<Handle />} />
      </Frame>
      <div className="space-y-6">
        <Frame label="Chat list, no chats yet" className="bg-surface">
          <NoChatsEmpty onCompose={noop} />
        </Frame>
        <Frame label="Friends, none yet" className="bg-surface">
          <FriendsEmpty handle={<Handle />} />
        </Frame>
        <Frame label="Search, no results" className="bg-surface">
          <NoResultsEmpty
            action={<AddFriendLink username="kofi_m" variant="outline" size="sm" />}
          />
        </Frame>
      </div>
    </div>
  );
}

const progress = (share: boolean, friend: boolean, hi: boolean) => {
  const steps = { share, friend, hi };
  const done = [share, friend, hi].filter(Boolean).length;
  return { steps, done, complete: done === 3 };
};

export function GetStartedSection() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {(
        [
          ['0 of 3', progress(false, false, false)],
          ['2 of 3', progress(true, true, false)],
          ['Done', progress(true, true, true)],
        ] as const
      ).map(([label, p]) => (
        <Frame key={label} label={label} className="bg-surface">
          <GetStartedView
            progress={p}
            handle={<Handle variant="compact" />}
            username={ME.username}
            onSayHi={noop}
            onDismiss={noop}
          />
        </Frame>
      ))}
    </div>
  );
}

export function HandleCardSection() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Frame label="Full" className="bg-bg p-4">
        <Handle />
      </Frame>
      <Frame label="Compact" className="bg-surface p-4">
        <Handle variant="compact" />
      </Frame>
    </div>
  );
}
