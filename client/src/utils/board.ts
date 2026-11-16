import type { Item, Tier } from "./types";

// The whole board: each tier's items in order, and the items not placed yet
export interface Board {
  tiers: Tier[];
  pool: string[];
}

export const POOL = "pool";

// Moves one item to another container, before `beforeId` or at the end
export function moveItem(board: Board, itemId: string, containerId: string, beforeId?: string): Board {
  const tiers = board.tiers.map((tier) => ({ ...tier, itemIds: tier.itemIds.filter((id) => id !== itemId) }));
  const pool = board.pool.filter((id) => id !== itemId);

  const insert = (list: string[]) => {
    const at = beforeId ? list.indexOf(beforeId) : -1;
    return at === -1 ? [...list, itemId] : [...list.slice(0, at), itemId, ...list.slice(at)];
  };

  if (containerId === POOL) return { tiers, pool: insert(pool) };

  const index = Number(containerId.replace("tier-", ""));
  if (!tiers[index]) return board;
  tiers[index] = { ...tiers[index], itemIds: insert(tiers[index].itemIds) };
  return { tiers, pool };
}

// Builds a board from saved tiers: any item that is in no tier starts in the pool
export function boardFrom(tiers: Tier[], items: Item[]): Board {
  const placed = new Set(tiers.flatMap((tier) => tier.itemIds));
  return {
    tiers: tiers.map((tier) => ({ label: tier.label, color: tier.color, itemIds: [...tier.itemIds] })),
    pool: items.filter((item) => !placed.has(item._id)).map((item) => item._id),
  };
}
