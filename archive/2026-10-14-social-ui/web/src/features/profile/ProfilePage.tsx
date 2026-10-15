import { fetchProfile, fetchProfilePosts, PAGE, qk } from '@vybora/api';
import {
  flattenUnique,
  followButtonState,
  formatCount,
  formatJoinDate,
  timeCursorOf,
  type TimeCursor,
} from '@vybora/core';
import type { ProfileView } from '@vybora/types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  Ban,
  Camera,
  Clapperboard,
  Flag,
  Grid3x3,
  Link2,
  Lock,
  MoreHorizontal,
  VolumeX,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LoadMore } from '@/components/LoadMore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { PostGrid, PostGridSkeleton } from '@/features/posts/PostGrid';
import { ReportDialog } from '@/features/posts/ReportDialog';
import { siteUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import NotFound from '@/routes/NotFound';
import { FollowListDialog } from './FollowListDialog';
import { useRelationship } from './useRelationship';

export default function ProfilePage() {
  const { username = '' } = useParams();
  const q = useQuery({
    queryKey: qk.profile(username.toLowerCase()),
    queryFn: () => fetchProfile(supabase, username),
  });
  if (q.isPending) return <PageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <NotFound />;
  return <Profile profile={q.data} />;
}

function Stat({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="font-semibold text-ink">{formatCount(value)}</span>{' '}
      <span className="text-muted">{label}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="text-sm hover:opacity-80 sm:text-[15px]">
      {content}
    </button>
  ) : (
    <span className="text-sm sm:text-[15px]">{content}</span>
  );
}

function Profile({ profile }: { profile: ProfileView }) {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<'posts' | 'reels'>('posts');
  const [list, setList] = useState<'followers' | 'following' | null>(null);
  const [dialog, setDialog] = useState<'block' | 'unfollow' | 'report' | null>(null);
  const rel = useRelationship(profile);
  const state = followButtonState(profile);

  const posts = useInfiniteQuery({
    queryKey: qk.feed.profile(profile.id, tab),
    queryFn: ({ pageParam }) =>
      fetchProfilePosts(supabase, profile.id, tab === 'reels' ? 'reel' : null, pageParam),
    initialPageParam: null as TimeCursor | null,
    getNextPageParam: (last) => timeCursorOf(last, PAGE.profile),
    enabled: profile.can_view_content,
  });
  const items = flattenUnique(posts.data?.pages);

  const requireAuth = () => {
    if (!userId) navigate(`/login?next=/u/${profile.username}`);
    return !!userId;
  };

  const followButton = (() => {
    switch (state) {
      case 'follow':
      case 'follow_back':
        return (
          <Button
            onClick={() => requireAuth() && rel.followMut.mutate()}
            loading={rel.followMut.isPending}
          >
            {state === 'follow_back' ? 'Follow back' : 'Follow'}
          </Button>
        );
      case 'requested':
        return (
          <Button
            variant="secondary"
            onClick={() => rel.unfollowMut.mutate()}
            loading={rel.unfollowMut.isPending}
          >
            Requested
          </Button>
        );
      case 'following':
        return (
          <Button variant="secondary" onClick={() => setDialog('unfollow')}>
            Following
          </Button>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="mx-auto max-w-[935px] px-0 py-6 sm:px-4 md:py-10">
      <header className="flex flex-col gap-6 px-4 sm:flex-row sm:items-start sm:gap-12 sm:px-8">
        <div className="flex items-center gap-5 sm:block">
          <Avatar
            path={profile.avatar_path}
            name={profile.username}
            size={120}
            className="hidden sm:inline-block"
          />
          <Avatar
            path={profile.avatar_path}
            name={profile.username}
            size={80}
            className="sm:hidden"
          />
          <div className="sm:hidden">
            <h1 className="flex items-center gap-1.5 text-xl font-semibold">
              {profile.username}{' '}
              {profile.is_private && <Lock size={15} aria-label="Private account" />}
            </h1>
            {profile.display_name && <p className="text-sm text-muted">{profile.display_name}</p>}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="hidden items-center gap-1.5 text-xl font-semibold sm:flex">
              {profile.username}{' '}
              {profile.is_private && <Lock size={16} aria-label="Private account" />}
            </h1>
            {profile.is_me ? (
              <>
                <Link to="/settings/profile">
                  <Button variant="secondary">Edit profile</Button>
                </Link>
                <Link to="/create">
                  <Button variant="secondary" leftIcon={<Camera size={16} />}>
                    New post
                  </Button>
                </Link>
              </>
            ) : (
              <>
                {profile.blocked_by_me ? (
                  <Button
                    variant="secondary"
                    onClick={() => rel.blockMut.mutate(false)}
                    loading={rel.blockMut.isPending}
                  >
                    Unblock
                  </Button>
                ) : (
                  followButton
                )}
                {!profile.blocked_by_me && userId && (
                  <Button
                    variant="secondary"
                    onClick={() => rel.message.mutate()}
                    loading={rel.message.isPending}
                  >
                    Message
                  </Button>
                )}
              </>
            )}
            <Menu
              label="Profile options"
              trigger={<MoreHorizontal size={20} />}
              items={[
                {
                  label: 'Copy profile link',
                  icon: <Link2 size={16} />,
                  onSelect: () =>
                    void navigator.clipboard
                      .writeText(`${siteUrl()}/u/${profile.username}`)
                      .then(() => toast.show('Link copied', 'success')),
                },
                {
                  label: profile.muted_by_me ? 'Unmute' : 'Mute',
                  icon: <VolumeX size={16} />,
                  hidden: profile.is_me || !userId || profile.blocked_by_me,
                  onSelect: () => rel.muteMut.mutate(!profile.muted_by_me),
                },
                {
                  label: 'Block',
                  icon: <Ban size={16} />,
                  danger: true,
                  hidden: profile.is_me || !userId || profile.blocked_by_me,
                  onSelect: () => setDialog('block'),
                },
                {
                  label: 'Report',
                  icon: <Flag size={16} />,
                  danger: true,
                  hidden: profile.is_me,
                  onSelect: () => requireAuth() && setDialog('report'),
                },
              ]}
            />
          </div>

          <div className="flex gap-6 sm:gap-8">
            <Stat
              value={profile.posts_count}
              label={profile.posts_count === 1 ? 'post' : 'posts'}
            />
            <Stat
              value={profile.followers_count}
              label="followers"
              onClick={profile.can_view_content ? () => setList('followers') : undefined}
            />
            <Stat
              value={profile.following_count}
              label="following"
              onClick={profile.can_view_content ? () => setList('following') : undefined}
            />
          </div>

          <div className="space-y-1 text-[15px]">
            {profile.display_name && (
              <p className="hidden font-semibold sm:block">{profile.display_name}</p>
            )}
            {profile.bio && <p className="whitespace-pre-line break-words">{profile.bio}</p>}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
              >
                <Link2 size={14} /> {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <p className="text-xs text-subtle">Joined {formatJoinDate(profile.created_at)}</p>
            {profile.follows_me && !profile.is_me && (
              <p className="text-xs font-semibold text-muted">Follows you</p>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8 border-t border-line">
        {profile.blocked_by_me ? (
          <EmptyState
            icon={<Ban size={28} />}
            title={`You blocked @${profile.username}`}
            body="Unblock to see their posts and let them find you again."
          />
        ) : !profile.can_view_content ? (
          <EmptyState
            icon={<Lock size={28} />}
            title="This account is private"
            body={
              profile.follow_status === 'pending'
                ? 'Your follow request is pending.'
                : 'Follow this account to see their photos and videos.'
            }
          />
        ) : (
          <>
            <div role="tablist" aria-label="Profile content" className="flex justify-center gap-12">
              {(
                [
                  { v: 'posts', label: 'Posts', icon: <Grid3x3 size={14} /> },
                  { v: 'reels', label: 'Reels', icon: <Clapperboard size={14} /> },
                ] as const
              ).map((t) => (
                <button
                  key={t.v}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.v}
                  onClick={() => setTab(t.v)}
                  className={`-mt-px flex items-center gap-1.5 border-t py-4 text-xs font-semibold uppercase tracking-wider ${tab === t.v ? 'border-ink text-ink' : 'border-transparent text-subtle'}`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {posts.isPending && <PostGridSkeleton />}
            {posts.isError && (
              <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />
            )}
            {!posts.isPending && items.length === 0 && (
              <EmptyState
                icon={tab === 'reels' ? <Clapperboard size={28} /> : <Camera size={28} />}
                title={tab === 'reels' ? 'No reels yet' : 'No posts yet'}
                body={profile.is_me ? 'Share your first moment.' : undefined}
                action={
                  profile.is_me ? (
                    <Link to="/create">
                      <Button>Create</Button>
                    </Link>
                  ) : undefined
                }
              />
            )}
            <PostGrid posts={items} />
            <LoadMore
              hasMore={!!posts.hasNextPage}
              loading={posts.isFetchingNextPage}
              onLoad={() => void posts.fetchNextPage()}
            />
          </>
        )}
      </div>

      {list && (
        <FollowListDialog
          open
          onClose={() => setList(null)}
          userId={profile.id}
          direction={list}
          isMe={profile.is_me}
        />
      )}
      <ConfirmDialog
        open={dialog === 'unfollow'}
        onClose={() => setDialog(null)}
        title={`Unfollow @${profile.username}?`}
        description={
          profile.is_private
            ? 'You’ll need to request to follow again to see their posts.'
            : undefined
        }
        confirmLabel="Unfollow"
        onConfirm={() => {
          rel.unfollowMut.mutate();
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog === 'block'}
        onClose={() => setDialog(null)}
        title={`Block @${profile.username}?`}
        description="They won’t be able to find your profile, see your posts or message you. They won’t be notified."
        confirmLabel="Block"
        danger
        loading={rel.blockMut.isPending}
        onConfirm={() => rel.blockMut.mutate(true, { onSuccess: () => setDialog(null) })}
      />
      <ReportDialog
        open={dialog === 'report'}
        onClose={() => setDialog(null)}
        targetType="profile"
        targetId={profile.id}
      />
    </div>
  );
}
