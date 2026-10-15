export * from './database';

/** Normalized domain models used by both clients (non-null where the DB guarantees it). */

export type MediaType = 'image' | 'video';
export type PostKind = 'post' | 'reel';

export interface MediaItem {
  id: string;
  position: number;
  storage_path: string;
  media_type: MediaType;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  alt_text: string | null;
}

export interface AuthorSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  is_private: boolean;
}

export interface PostCard {
  id: string;
  author_id: string;
  kind: PostKind;
  caption: string;
  comments_enabled: boolean;
  status: 'published' | 'removed';
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  author: AuthorSummary;
  media: MediaItem[];
  liked_by_me: boolean;
  saved_by_me: boolean;
}

export interface ProfileView {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  website: string | null;
  avatar_path: string | null;
  is_private: boolean;
  status: 'active' | 'suspended';
  posts_count: number;
  followers_count: number;
  following_count: number;
  created_at: string;
  is_me: boolean;
  follow_status: 'pending' | 'accepted' | null;
  follows_me: boolean;
  blocked_by_me: boolean;
  muted_by_me: boolean;
  can_view_content: boolean;
}

export interface CommentView {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_path: string | null;
  reply_count: number;
}

export interface StoryTrayItem {
  author_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  story_count: number;
  latest_at: string;
  has_unseen: boolean;
  is_me: boolean;
}

export interface Story {
  id: string;
  author_id: string;
  storage_path: string;
  media_type: MediaType;
  mime_type: string;
  duration_ms: number | null;
  created_at: string;
  expires_at: string;
}

export interface ConversationSummary {
  conversation_id: string;
  last_message_at: string;
  other_id: string | null;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_path: string | null;
  last_message_body: string | null;
  last_message_sender: string | null;
  last_message_has_attachment: boolean;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  attachment_path: string | null;
  attachment_mime: string | null;
  client_id: string | null;
  created_at: string;
}

export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'like'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'message'
  | 'moderation';

export interface NotificationView {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  conversation_id: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
  actor: { username: string; display_name: string; avatar_path: string | null } | null;
}

export interface UserSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  is_private?: boolean;
  followers_count?: number;
}

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'violence'
  | 'nudity'
  | 'self_harm'
  | 'misinformation'
  | 'intellectual_property'
  | 'other';

export type ReportTarget = 'post' | 'comment' | 'profile' | 'story';
