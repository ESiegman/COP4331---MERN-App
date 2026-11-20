import { HttpError } from './errors.js';

// Each role can do everything the ones below it can: user < moderator < admin

const RANK = { user: 0, moderator: 1, admin: 2 };

// Accounts made before roles existed have none, which counts as 'user'
export const roleOf = (account) => account?.role ?? 'user';

export const hasRole = (role, minimum) => RANK[role ?? 'user'] >= RANK[minimum];

export const isModerator = (role) => hasRole(role, 'moderator');

export const banned = (account) =>
  new HttpError(
    403,
    account.banReason ? `This account has been banned: ${account.banReason}` : 'This account has been banned',
    { code: 'ACCOUNT_BANNED' },
  );
