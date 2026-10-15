import { fetchPost, qk } from '@vybora/api';
import { feedAspectRatio, formatCount } from '@vybora/core';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, Heart, Send } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Carousel } from '@/components/media/Media';
import { RichText } from '@/components/ui/RichText';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import NotFound from '@/routes/NotFound';
import { Comments } from './Comments';
import { PostCardView, PostHeader, sharePost } from './PostCard';
import { usePostActions } from './usePostActions';

export default function PostPage() {
  const { postId = '' } = useParams();
  const query = useQuery({ queryKey: qk.post(postId), queryFn: () => fetchPost(supabase, postId) });

  if (query.isPending) return <PageSpinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <NotFound />;
  const post = query.data;

  return (
    <div className="mx-auto max-w-[1040px] py-0 sm:px-4 sm:py-8">
      {/* Mobile: regular card + comments below */}
      <div className="md:hidden">
        <PostCardView post={post} />
        <div className="flex h-[60vh] flex-col bg-surface">
          <Comments post={post} />
        </div>
      </div>
      {/* Desktop: media left, conversation right */}
      <DesktopPost post={post} />
    </div>
  );
}

function DesktopPost({ post }: { post: NonNullable<Awaited<ReturnType<typeof fetchPost>>> }) {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { like, save } = usePostActions(post);
  const first = post.media[0];
  const requireAuth = () => {
    if (!userId) navigate(`/login?next=/p/${post.id}`);
    return !!userId;
  };

  return (
    <article
      className="hidden overflow-hidden rounded-[24px] border border-line bg-surface shadow-card md:grid md:grid-cols-[minmax(0,1.25fr)_minmax(340px,1fr)]"
      style={{ height: 'min(86vh, 760px)' }}
    >
      <div className="flex items-center bg-black">
        <div className="w-full">
          <Carousel
            media={post.media}
            aspect={first ? feedAspectRatio(first.width, first.height) : 1}
            label={`Post by ${post.author.username}`}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="border-b border-line">
          <PostHeader post={post} />
        </div>
        {post.caption && (
          <div className="border-b border-line px-4 py-3 text-sm">
            <Link to={`/u/${post.author.username}`} className="mr-1.5 font-semibold">
              {post.author.username}
            </Link>
            <RichText text={post.caption} className="whitespace-pre-line break-words" />
          </div>
        )}
        <Comments post={post} />
        <div className="border-t border-line px-3 py-2">
          <div className="flex items-center">
            <button
              type="button"
              aria-pressed={post.liked_by_me}
              aria-label={post.liked_by_me ? 'Unlike' : 'Like'}
              className="rounded-xl p-2"
              onClick={() => requireAuth() && like.mutate(!post.liked_by_me)}
            >
              <Heart size={24} className={cn(post.liked_by_me && 'fill-coral text-coral')} />
            </button>
            <button
              type="button"
              aria-label="Share"
              className="rounded-xl p-2"
              onClick={() => sharePost(post, toast)}
            >
              <Send size={22} />
            </button>
            <button
              type="button"
              aria-pressed={post.saved_by_me}
              aria-label={post.saved_by_me ? 'Remove from saved' : 'Save'}
              className="ml-auto rounded-xl p-2"
              onClick={() => requireAuth() && save.mutate(!post.saved_by_me)}
            >
              <Bookmark size={23} className={cn(post.saved_by_me && 'fill-ink')} />
            </button>
          </div>
          <p className="px-2 pb-1 text-sm font-semibold">{formatCount(post.like_count)} likes</p>
        </div>
      </div>
    </article>
  );
}
