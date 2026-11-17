import type { Account } from "./types";

// Moderators can remove anyone's content and ban accounts. Admins can do all of that and
// also change roles and read the moderation log. A missing role counts as a plain user.
export function isModerator(user: Account | null | undefined): boolean {
  return user?.role === "moderator" || user?.role === "admin";
}

export function isAdmin(user: Account | null | undefined): boolean {
  return user?.role === "admin";
}
