// Shapes of what the API sends back. They mirror the ERD and the server's models.

export type Visibility = "public" | "unlisted" | "private";

export type Role = "user" | "moderator" | "admin";

export type OAuthProviderId = "google" | "discord";

// One linked Google or Discord account, as GET /users/me lists them
export interface LinkedAccount {
  provider: OAuthProviderId;
  email?: string;
  linkedAt: string;
}

export interface NotificationPrefs {
  newComment: boolean;
  newRanking: boolean;
  newLike: boolean;
}

// The signed-in user's own account (GET /users/me, login, verify-email)
export interface Account {
  _id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  // Missing on accounts made before roles existed, which counts as "user"
  role?: Role;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  notificationPrefs: NotificationPrefs;
  createdAt: string;
  // Only GET /users/me sends these two: how the account can log in
  hasPassword?: boolean;
  linkedAccounts?: LinkedAccount[];
}

// What everyone else can see about a user
export interface PublicProfile {
  _id: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface Template {
  _id: string;
  ownerId: string;
  title: string;
  description?: string;
  category?: string;
  coverImageUrl: string | null;
  tierLabels: string[];
  visibility: Visibility;
  rankingCount: number;
  createdAt: string;
  owner?: PublicProfile | null;
}

export interface Item {
  _id: string;
  templateId: string;
  name: string;
  imageUrl: string | null;
}

export interface Tier {
  label: string;
  color: string;
  itemIds: string[];
  order?: number;
}

export interface Ranking {
  _id: string;
  templateId: string;
  ownerId: string;
  title?: string;
  tiers: Tier[];
  visibility: Visibility;
  likeCount: number;
  commentCount: number;
  publishedAt: string | null;
  createdAt: string;
  owner?: PublicProfile | null;
  template?: Pick<Template, "_id" | "title" | "coverImageUrl"> | null;
}

export interface Comment {
  _id: string;
  rankingId: string;
  authorId: string;
  body: string;
  createdAt: string;
  // Later than createdAt once the comment has been edited
  updatedAt?: string;
  author: PublicProfile | null;
}

export type NotificationType = "new_ranking" | "new_comment" | "new_like" | "content_removed";

export interface AppNotification {
  _id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  // null for content_removed: the notice never says which moderator acted
  actor: PublicProfile | null;
  ranking: { _id: string; title?: string; template: { title: string } | null } | null;
  // content_removed only
  removed?: { kind: "template" | "ranking" | "comment"; title: string; reason?: string };
}

// What the admin routes send for an account (the public profile plus moderation fields)
export interface ModerationUser extends PublicProfile {
  role?: Role;
  bannedAt?: string;
  banReason?: string;
}

export type ModerationAction = "delete_template" | "delete_ranking" | "delete_comment" | "ban" | "unban" | "set_role";

export interface ModerationLogEntry {
  _id: string;
  action: ModerationAction;
  summary: string;
  reason?: string;
  createdAt: string;
  // null when the role was set with the setRole command on the server
  actor: PublicProfile | null;
  targetUser: PublicProfile | null;
}

// Every list endpoint answers with this
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// Response bodies of single-record endpoints
export interface AuthResponse {
  token: string;
  user: Account;
}

export interface TemplateDetail {
  template: Template;
  items: Item[];
  owner: PublicProfile | null;
  shareUrl: string;
}

export interface RankingDetail {
  ranking: Ranking;
  template: Template;
  items: Item[];
  owner: PublicProfile | null;
  likedByMe: boolean;
  shareUrl: string;
}
