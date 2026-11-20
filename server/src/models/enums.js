// The enum values from the ERD. db/setup.js enforces the same lists in the database.
export const VISIBILITIES = ['public', 'unlisted', 'private'];
export const OAUTH_PROVIDERS = ['google', 'discord'];
export const AUTH_TOKEN_TYPES = ['verify_email', 'reset_password'];
export const NOTIFICATION_TYPES = ['new_ranking', 'new_comment', 'new_like', 'content_removed'];

// Each role can do everything the ones before it can
export const ROLES = ['user', 'moderator', 'admin'];
export const MODERATION_ACTIONS = ['delete_template', 'delete_ranking', 'delete_comment', 'ban', 'unban', 'set_role'];
export const REMOVED_KINDS = ['template', 'ranking', 'comment'];

// A template only stores tier labels, but every tier in a ranking needs a color.
// New rankings take their colors from this palette by position, repeating if there are more tiers.
export const DEFAULT_TIER_LABELS = ['S', 'A', 'B', 'C', 'D', 'F'];
export const DEFAULT_TIER_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fbfff'];
