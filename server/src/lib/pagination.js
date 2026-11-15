import { badRequest } from './errors.js';

// Cursor pagination for list endpoints, which all answer { items, nextCursor }.
// A cursor is an opaque string holding the sort position of the last item on the previous
// page, so pages stay stable while new documents arrive.
export const encodeCursor = (position) =>
  Buffer.from(JSON.stringify(position)).toString('base64url');

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString());
  } catch {
    throw badRequest('Invalid cursor');
  }
}

// Query for limit + 1 documents and pass them here: the extra one only tells us another page exists.
export function toPage(docs, limit, positionOf) {
  const items = docs.slice(0, limit);
  const nextCursor = docs.length > limit ? encodeCursor(positionOf(items.at(-1))) : null;
  return { items, nextCursor };
}

// A cursor comes from the client, so its contents are checked before they go into a query
function readPosition(cursor) {
  const position = decodeCursor(cursor);
  if (position === null) return null;

  const { value, id } = position ?? {};
  const plainValue = typeof value === 'string' || typeof value === 'number';
  if (!plainValue || !/^[0-9a-f]{24}$/i.test(id)) throw badRequest('Invalid cursor');
  return { value, id };
}

// Runs a list query one page at a time: highest `sortBy` first (lowest first with
// ascending: true), with _id breaking ties so that documents with equal values still come
// out in a fixed order.
// `filter` must not contain an $or of its own. Returns plain objects, not Mongoose documents.
export async function findPage(Model, filter, { sortBy, cursor, limit, ascending = false }) {
  const after = readPosition(cursor);
  const [direction, beyond] = ascending ? [1, '$gt'] : [-1, '$lt'];
  const query = after
    ? {
        ...filter,
        $or: [
          { [sortBy]: { [beyond]: after.value } },
          { [sortBy]: after.value, _id: { [beyond]: after.id } },
        ],
      }
    : filter;

  const docs = await Model.find(query)
    .sort({ [sortBy]: direction, _id: direction })
    .limit(limit + 1)
    .lean();

  return toPage(docs, limit, (doc) => ({ value: doc[sortBy], id: doc._id }));
}
