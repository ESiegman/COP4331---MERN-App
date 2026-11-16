// Shapes of what the API sends back. They mirror the ERD and the server's models.

export type Visibility = "public" | "unlisted" | "private";

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
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  notificationPrefs: NotificationPrefs;
  createdAt: string;
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
  author: PublicProfile | null;
}

export type NotificationType = "new_ranking" | "new_comment" | "new_like";

export interface AppNotification {
  _id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: PublicProfile | null;
  ranking: { _id: string; title?: string; template: { title: string } | null } | null;
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
