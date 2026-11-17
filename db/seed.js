import bcrypt from 'bcryptjs';
import { MongoClient, ObjectId } from 'mongodb';

// Fills the app database with sample data for testing: users, templates, rankings, likes,
// comments and notifications that look like real use.
//
//   npm run seed               replace the sample data with a fresh copy
//   npm run seed -- --remove   remove it
//
// Sample accounts have emails ending in @seed.example.com, and everything they own or wrote is
// sample data. Removing it also removes what hangs off it (other people's rankings of sample
// templates, likes and comments on sample rankings) and corrects the counters on anything else
// it touched. Nothing else in the database changes.
//
// Ids are the same on every run, so links to sample rankings keep working. Dates are counted
// back from now, so the data always looks recent. Run setup.js first: it creates the collections.

const SEED_EMAIL = /@seed\.example\.com$/;
const emailFor = (username) => `${username}@seed.example.com`;
const DEFAULT_PASSWORD = 'tierlist-dev';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const COLLECTIONS = ['users', 'oauthaccounts', 'authtokens', 'templates', 'items', 'rankings', 'comments', 'likes', 'notifications'];

// The palette the API gives new rankings (server/src/models/enums.js), plus one for "God tier"
const PALETTE = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fbfff'];
const DEFAULT_LABELS = ['S', 'A', 'B', 'C', 'D', 'F'];
const LABEL_COLORS = { 'God tier': '#bf7fff', ...Object.fromEntries(DEFAULT_LABELS.map((label, i) => [label, PALETTE[i]])) };

// ---------------------------------------------------------------------------------------------
// The sample content
// ---------------------------------------------------------------------------------------------

// joined: days ago. prefs: changes from the defaults (comments and rankings on, likes off)
const USERS = [
  { username: 'snackqueen', displayName: 'Maya', bio: 'Will rank any snack aisle.', joined: 30,
    note: 'Owns the snack and fries templates, and the most liked ranking' },
  { username: 'pixelpete', displayName: 'Pete', bio: 'Games, mostly. Sometimes pizza.', joined: 29,
    prefs: { newLike: true }, note: 'Owns the game templates. Like notifications on' },
  { username: 'reeltalk', displayName: 'Jordan', bio: 'Movie night every Friday.', joined: 27,
    note: 'Owns the movie template and a private template' },
  { username: 'brunchclub', displayName: 'Sam', joined: 26,
    prefs: { newComment: false }, note: 'Owns the pizza and breakfast templates. Comment notifications off' },
  { username: 'tierlord', displayName: 'Alex', bio: 'Everything is a tier list if you try hard enough.', joined: 25,
    prefs: { newLike: true }, note: 'Owns the programming and study spot templates. Like notifications on' },
  { username: 'quietcritic', joined: 22,
    prefs: { newComment: false, newRanking: false, newLike: false }, note: 'No display name or templates. All notifications off' },
  { username: 'freshstart', displayName: 'Nina', joined: 1, verified: false,
    note: 'Email not verified, so logging in answers 403' },
];

// created: days ago. Items are listed roughly best first: rankings start from that order.
const TEMPLATES = [
  {
    key: 'snacks', owner: 'snackqueen', created: 21, title: 'Gas station snacks', category: 'food',
    description: 'The road trip essentials. What are you grabbing at the counter?',
    items: ['Beef jerky', 'Peanut M&Ms', 'Takis', 'Sour Patch Kids', 'Doritos', 'Slim Jim', 'Sunflower seeds', 'Gummy worms', 'Corn nuts', 'Pork rinds'],
  },
  {
    key: 'fries', owner: 'snackqueen', created: 14, title: 'Fast food fries', category: 'food',
    description: 'Ranked on the fries alone. Nothing else on the menu counts.',
    items: ['Five Guys', 'Chick-fil-A', "McDonald's", 'Popeyes', "Wendy's", "Arby's", 'Burger King', 'In-N-Out'],
  },
  {
    key: 'pizza', owner: 'brunchclub', created: 20, title: 'Pizza toppings', category: 'food',
    description: 'One topping at a time. Pineapple people, this is your moment.',
    items: ['Pepperoni', 'Sausage', 'Mushrooms', 'Extra cheese', 'Onions', 'Green peppers', 'Jalapeños', 'Black olives', 'Pineapple', 'Anchovies'],
    note: 'Most ranked template, for the community ranking', notePath: '/community-ranking',
  },
  {
    key: 'breakfast', owner: 'brunchclub', created: 12, title: 'Breakfast foods', category: 'food',
    description: 'How often would you actually eat it?',
    labels: ['Every day', 'Weekends', 'Sometimes', 'Never'],
    items: ['Scrambled eggs', 'Bacon', 'Pancakes', 'Hash browns', 'French toast', 'Waffles', 'Avocado toast', 'Cereal', 'Oatmeal'],
    note: 'Template with its own tier labels instead of S to F',
  },
  {
    key: 'genres', owner: 'pixelpete', created: 19, title: 'Video game genres', category: 'games',
    description: 'Which genres you would actually play, top to bottom.',
    items: ['RPG', 'Platformer', 'Roguelike', 'Shooter', 'Puzzle', 'Survival', 'Strategy', 'Fighting', 'Racing', 'Sports'],
  },
  {
    key: 'boardgames', owner: 'pixelpete', created: 3, title: 'Board games', category: 'games',
    items: ['Codenames', 'Catan', 'Ticket to Ride', 'Pandemic', 'Clue', 'Uno', 'Scrabble', 'Chess', 'Monopoly'],
    note: 'Template nobody has ranked yet, and with no description',
  },
  {
    key: 'movies', owner: 'reeltalk', created: 17, title: 'Movie genres', category: 'movies',
    description: 'Friday night picks, settled once and for all.',
    items: ['Sci-fi', 'Comedy', 'Animation', 'Thriller', 'Action', 'Horror', 'Documentary', 'Romance', 'Musical', 'Western'],
  },
  {
    key: 'languages', owner: 'tierlord', created: 16, title: 'Programming languages', category: 'tech',
    description: 'For people who have opinions about semicolons.',
    items: ['Python', 'TypeScript', 'Rust', 'Go', 'C', 'JavaScript', 'Java', 'C++', 'PHP'],
  },
  {
    key: 'study', owner: 'tierlord', created: 9, title: 'Study spots on campus', category: 'school', visibility: 'unlisted',
    description: 'Shared with my study group only.',
    items: ['Library quiet floor', 'Empty classroom', 'Coffee shop', 'Student union', 'Dorm room', 'Outside on a bench'],
    note: 'Unlisted template: opens by link, never listed',
  },
  {
    key: 'weekend', owner: 'reeltalk', created: 5, title: 'Weekend plans', category: 'life', visibility: 'private',
    description: 'Just for me.',
    items: ['Movie marathon', 'Hiking', 'Sleeping in', 'Board game night', 'Cleaning my room', 'Laundry'],
    note: 'Private template: only reeltalk can see it',
  },
];

// Who ranked what. Each ranking starts from the template's order and moves items around a bit,
// so people mostly agree but not completely.
//   draft      never published, and about half the items left unranked
//   hotTake    mostly upside down
//   favorites  items put in the top tier whatever the template's order says
//   labels     tiers that differ from the template's, as if the person added or removed some
//   likes, comments   how many. Otherwise a few at random
const RANKINGS = [
  { owner: 'snackqueen', template: 'snacks', title: 'The official list', likes: 5, comments: 6,
    note: 'Most liked ranking, with the longest comment thread' },
  { owner: 'pixelpete', template: 'snacks', title: 'Road trip fuel' },
  { owner: 'reeltalk', template: 'snacks', labels: ['God tier', ...DEFAULT_LABELS],
    note: 'Ranking with an extra "God tier" above S' },
  { owner: 'tierlord', template: 'snacks', title: 'Hot takes only', hotTake: true, likes: 4, comments: 4 },
  { owner: 'quietcritic', template: 'snacks' },
  { owner: 'brunchclub', template: 'snacks', draft: true, note: 'Draft ranking: only brunchclub can see it' },

  { owner: 'snackqueen', template: 'fries' },
  { owner: 'brunchclub', template: 'fries', title: 'Fries only, no sauce' },
  { owner: 'tierlord', template: 'fries', visibility: 'unlisted', note: 'Unlisted ranking: opens by link, never listed' },

  { owner: 'brunchclub', template: 'pizza', title: 'Settling this' },
  { owner: 'snackqueen', template: 'pizza' },
  { owner: 'pixelpete', template: 'pizza', title: 'Game night order' },
  { owner: 'reeltalk', template: 'pizza' },
  { owner: 'tierlord', template: 'pizza', title: 'Pineapple supremacy', favorites: ['Pineapple'] },
  { owner: 'quietcritic', template: 'pizza' },

  { owner: 'brunchclub', template: 'breakfast', title: 'My actual week' },
  { owner: 'snackqueen', template: 'breakfast' },

  { owner: 'pixelpete', template: 'genres', title: 'What I actually play' },
  { owner: 'tierlord', template: 'genres' },
  { owner: 'reeltalk', template: 'genres', draft: true },

  { owner: 'reeltalk', template: 'movies', title: 'Friday night rules' },
  { owner: 'brunchclub', template: 'movies' },
  { owner: 'pixelpete', template: 'movies', visibility: 'private', note: 'Private ranking: only pixelpete can see it' },

  { owner: 'tierlord', template: 'languages', title: 'No semicolons were harmed' },
  { owner: 'pixelpete', template: 'languages', labels: ['S', 'A', 'B', 'F'] },
  { owner: 'reeltalk', template: 'languages' },
  { owner: 'snackqueen', template: 'languages', title: 'I took one CS class' },

  { owner: 'tierlord', template: 'study', title: 'Exam week edition' },

  { owner: 'reeltalk', template: 'weekend', visibility: 'private' },
];

// {top}, {middle}, {bottom} and {unranked} become items from the ranking being commented on
const COMMENTS = [
  '{top} at the top is correct, no notes.',
  '{bottom} that low is a crime.',
  'How is {bottom} below {middle}?',
  'Agree with all of this except {middle}.',
  'Finally someone puts {top} where it belongs.',
  'Swap {top} and {middle} and it is perfect.',
  'Hard disagree on {bottom}.',
  'You left {unranked} unranked. Afraid to commit?',
  'Saving this one.',
  'Respectfully, this is chaos.',
  'This is the one.',
  'Bold of you to post this.',
];

const REPLIES = [
  'Thank you, finally someone gets it.',
  'I stand by every placement.',
  'Fair, {middle} was a tough call.',
  'Not changing it.',
];

// ---------------------------------------------------------------------------------------------
// Building the documents
// ---------------------------------------------------------------------------------------------

class SeedError extends Error {}

// A small seeded random number generator, so every run builds the same data
function randomFrom(seedText) {
  let state = 2166136261;
  for (const char of seedText) state = Math.imul(state ^ char.codePointAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (list, rand) => list[Math.floor(rand() * list.length)];

function shuffled(list, rand) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Ids that start with 5eed and count up per collection: the same on every run, easy to spot,
// and in creation order, which is how the API sorts a template's items
function idMaker() {
  const kinds = { users: '01', templates: '02', items: '03', rankings: '04', comments: '05', likes: '06', notifications: '07' };
  const counts = {};
  return (kind) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return new ObjectId(`5eed${kinds[kind]}${counts[kind].toString(16).padStart(18, '0')}`);
  };
}

// Places a template's items into tiers. Items are put in order (the template's order, shuffled
// a little by personal disagreement) and then spread from the top tier to the bottom one, so
// every board uses its whole range. People mostly agree about the best and worst items and
// argue about the middle, which is what gives the community ranking a full top and bottom tier.
function placeItems(items, labels, rand, { hotTake = false, draft = false, favorites = [] }) {
  const scored = items.map((item, index) => {
    const consensus = index / (items.length - 1);
    const disagreement = 0.3 + 0.7 * 4 * consensus * (1 - consensus);
    const target = hotTake ? 1 - consensus : consensus;
    const noisy = Math.min(1, Math.max(0, target + (rand() - 0.5) * 0.5 * disagreement));
    return { item, score: favorites.includes(item.name) ? 0 : noisy };
  });

  const unranked = draft ? Math.ceil(items.length / 2) : Math.floor(rand() * 2);
  const placed = shuffled(scored, rand)
    .slice(unranked)
    .sort((a, b) => a.score - b.score);

  const tiers = labels.map((label, order) => ({
    label,
    color: LABEL_COLORS[label] ?? PALETTE[order % PALETTE.length],
    order,
    itemIds: [],
  }));
  const lastPosition = Math.max(placed.length - 1, 1);
  placed.forEach(({ item }, position) => {
    tiers[Math.round((position / lastPosition) * (labels.length - 1))].itemIds.push(item._id);
  });
  return tiers;
}

// Fills in a comment line with item names from the ranking it is on
function writeComment(lines, tiers, items, rand) {
  const nameOf = new Map(items.map((item) => [String(item._id), item.name]));
  const placed = tiers.flatMap((tier) => tier.itemIds.map(String));
  const unranked = items.map((item) => String(item._id)).filter((id) => !placed.includes(id));

  const words = {
    top: nameOf.get(placed[0]),
    middle: nameOf.get(placed[Math.floor(placed.length / 2)]),
    bottom: nameOf.get(placed.at(-1)),
    unranked: nameOf.get(unranked[0]),
  };
  const usable = lines.filter((line) => !line.includes('{unranked}') || words.unranked);
  return pick(usable, rand).replace(/\{(\w+)\}/g, (_, word) => words[word]);
}

const PREF_FOR_TYPE = { new_ranking: 'newRanking', new_comment: 'newComment', new_like: 'newLike' };

function buildSampleData(passwordHash, now) {
  const nextId = idMaker();
  const daysAgo = (days, rand) => new Date(now - days * DAY + Math.floor(rand() * 6 * HOUR));
  // A moment between `from` and now, leaving a little room at the end
  const after = (from, rand) => new Date(from.getTime() + MINUTE + rand() * (now - from.getTime() - 2 * MINUTE) * 0.95);

  const docs = { users: [], templates: [], items: [], rankings: [], likes: [], comments: [], notifications: [] };
  const accounts = [];
  const highlights = [];

  const users = new Map();
  for (const spec of USERS) {
    const rand = randomFrom(`user:${spec.username}`);
    const user = {
      _id: nextId('users'),
      username: spec.username,
      email: emailFor(spec.username),
      passwordHash,
      emailVerified: spec.verified !== false,
      ...(spec.displayName && { displayName: spec.displayName }),
      ...(spec.bio && { bio: spec.bio }),
      pushTokens: [],
      notificationPrefs: { newComment: true, newRanking: true, newLike: false, ...spec.prefs },
      createdAt: daysAgo(spec.joined, rand),
    };
    users.set(spec.username, user);
    docs.users.push(user);
    accounts.push({ email: user.email, note: spec.note });
  }
  const activeUsers = docs.users.filter((user) => user.emailVerified);

  // The same rules the API follows: never notify yourself, and respect the switches
  const notify = (recipientId, actor, type, ranking, createdAt) => {
    const recipient = docs.users.find((user) => user._id.equals(recipientId));
    if (recipient._id.equals(actor._id) || !recipient.notificationPrefs[PREF_FOR_TYPE[type]]) return;
    docs.notifications.push({
      _id: nextId('notifications'),
      recipientId: recipient._id,
      actorId: actor._id,
      type,
      rankingId: ranking._id,
      read: createdAt.getTime() < now - 2 * DAY,
      createdAt,
    });
  };

  const templates = new Map();
  for (const spec of TEMPLATES) {
    const rand = randomFrom(`template:${spec.key}`);
    const createdAt = daysAgo(spec.created, rand);
    const template = {
      _id: nextId('templates'),
      ownerId: users.get(spec.owner)._id,
      title: spec.title,
      ...(spec.description && { description: spec.description }),
      category: spec.category,
      coverImageUrl: null,
      tierLabels: spec.labels ?? DEFAULT_LABELS,
      visibility: spec.visibility ?? 'public',
      rankingCount: 0,
      createdAt,
      updatedAt: createdAt,
    };
    const items = spec.items.map((name) => ({ _id: nextId('items'), templateId: template._id, name, imageUrl: null, createdAt }));

    templates.set(spec.key, { template, items });
    docs.templates.push(template);
    docs.items.push(...items);
    if (spec.note) highlights.push({ note: spec.note, path: `/api/templates/${template._id}${spec.notePath ?? ''}` });
  }

  for (const spec of RANKINGS) {
    const rand = randomFrom(`ranking:${spec.owner}:${spec.template}`);
    const owner = users.get(spec.owner);
    const { template, items } = templates.get(spec.template);

    const start = Math.max(template.createdAt, owner.createdAt) + HOUR;
    const ownTemplate = owner._id.equals(template.ownerId);
    const createdAt = new Date(ownTemplate ? start + rand() * 2 * HOUR : start + rand() * (now - 12 * HOUR - start) * 0.7);
    const publishedAt = spec.draft ? null : new Date(createdAt.getTime() + (10 + rand() * 110) * MINUTE);
    const visibility = spec.visibility ?? 'public';

    const ranking = {
      _id: nextId('rankings'),
      templateId: template._id,
      ownerId: owner._id,
      ...(spec.title && { title: spec.title }),
      tiers: placeItems(items, spec.labels ?? template.tierLabels, rand, spec),
      visibility,
      likeCount: 0,
      commentCount: 0,
      publishedAt,
      createdAt,
      updatedAt: publishedAt ?? new Date(createdAt.getTime() + 5 * MINUTE),
    };
    docs.rankings.push(ranking);
    if (spec.note) highlights.push({ note: spec.note, path: `/api/rankings/${ranking._id}` });

    // Drafts and private rankings get no attention from anyone else. rankingCount counts
    // published public rankings, like the API (none at all for a private template)
    if (!publishedAt) continue;
    if (visibility === 'public' && template.visibility !== 'private') template.rankingCount += 1;
    if (visibility === 'private' || template.visibility === 'private') continue;
    notify(template.ownerId, owner, 'new_ranking', ranking, publishedAt);

    const others = activeUsers.filter((user) => !user._id.equals(owner._id));

    for (const liker of shuffled(others, rand).slice(0, spec.likes ?? Math.floor(rand() * 4))) {
      const likedAt = after(publishedAt, rand);
      docs.likes.push({ _id: nextId('likes'), rankingId: ranking._id, userId: liker._id, createdAt: likedAt });
      ranking.likeCount += 1;
      notify(owner._id, liker, 'new_like', ranking, likedAt);
    }

    const commentTimes = Array.from({ length: spec.comments ?? Math.floor(rand() * 4) }, () => after(publishedAt, rand))
      .sort((a, b) => a - b);
    for (const commentedAt of commentTimes) {
      const author = pick(others, rand);
      docs.comments.push({
        _id: nextId('comments'),
        rankingId: ranking._id,
        authorId: author._id,
        body: writeComment(COMMENTS, ranking.tiers, items, rand),
        createdAt: commentedAt,
        updatedAt: commentedAt,
      });
      ranking.commentCount += 1;
      notify(owner._id, author, 'new_comment', ranking, commentedAt);

      // Sometimes the owner answers
      if (rand() < 0.3) {
        const repliedAt = new Date(Math.min(commentedAt.getTime() + (5 + rand() * 55) * MINUTE, now - MINUTE));
        docs.comments.push({
          _id: nextId('comments'),
          rankingId: ranking._id,
          authorId: owner._id,
          body: writeComment(REPLIES, ranking.tiers, items, rand),
          createdAt: repliedAt,
          updatedAt: repliedAt,
        });
        ranking.commentCount += 1;
      }
    }
  }

  return { docs, accounts, highlights };
}

// ---------------------------------------------------------------------------------------------
// Database work
// ---------------------------------------------------------------------------------------------

const uniqueIds = (ids) => [...new Map(ids.map((id) => [String(id), id])).values()];

async function checkCollectionsExist(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const missing = COLLECTIONS.filter((name) => !existing.has(name));
  if (missing.length > 0) {
    throw new SeedError(`Missing collections: ${missing.join(', ')}. Run setup.js first (docker compose up does).`);
  }
}

async function checkUsernamesFree(db) {
  const taken = await db
    .collection('users')
    .find({ username: { $in: USERS.map((user) => user.username) }, email: { $not: SEED_EMAIL } })
    .project({ username: 1 })
    .toArray();
  if (taken.length > 0) {
    const names = taken.map((user) => user.username).join(', ');
    throw new SeedError(`Real accounts already use these usernames: ${names}. Rename them in USERS in seed.js.`);
  }
}

// Sets likeCount, commentCount and rankingCount from the documents that actually exist
async function recount(db, session, { rankingIds, templateIds }) {
  for (const _id of uniqueIds(rankingIds)) {
    const likeCount = await db.collection('likes').countDocuments({ rankingId: _id }, { session });
    const commentCount = await db.collection('comments').countDocuments({ rankingId: _id }, { session });
    await db.collection('rankings').updateOne({ _id }, { $set: { likeCount, commentCount } }, { session });
  }
  for (const _id of uniqueIds(templateIds)) {
    const rankingCount = await db.collection('rankings').countDocuments({ templateId: _id, publishedAt: { $ne: null } }, { session });
    await db.collection('templates').updateOne({ _id }, { $set: { rankingCount } }, { session });
  }
}

// Removes the sample accounts and everything that belongs to them or hangs off what they made
async function removeSampleData(db, session) {
  const options = { session };
  const userIds = await db.collection('users').distinct('_id', { email: SEED_EMAIL }, options);
  const templateIds = await db.collection('templates').distinct('_id', { ownerId: { $in: userIds } }, options);
  const rankings = await db
    .collection('rankings')
    .find({ $or: [{ ownerId: { $in: userIds } }, { templateId: { $in: templateIds } }] }, { projection: { templateId: 1 }, session })
    .toArray();
  const rankingIds = rankings.map((ranking) => ranking._id);

  // Real rankings and templates whose counters will change
  const sampleTemplates = new Set(templateIds.map(String));
  const touched = {
    rankingIds: [
      ...(await db.collection('likes').distinct('rankingId', { userId: { $in: userIds }, rankingId: { $nin: rankingIds } }, options)),
      ...(await db.collection('comments').distinct('rankingId', { authorId: { $in: userIds }, rankingId: { $nin: rankingIds } }, options)),
    ],
    templateIds: rankings.map((ranking) => ranking.templateId).filter((id) => !sampleTemplates.has(String(id))),
  };

  const remove = async (name, filter) => (await db.collection(name).deleteMany(filter, options)).deletedCount;
  const removed = {
    users: await remove('users', { _id: { $in: userIds } }),
    templates: await remove('templates', { _id: { $in: templateIds } }),
    items: await remove('items', { templateId: { $in: templateIds } }),
    rankings: await remove('rankings', { _id: { $in: rankingIds } }),
    likes: await remove('likes', { $or: [{ rankingId: { $in: rankingIds } }, { userId: { $in: userIds } }] }),
    comments: await remove('comments', { $or: [{ rankingId: { $in: rankingIds } }, { authorId: { $in: userIds } }] }),
    notifications: await remove('notifications', {
      $or: [{ rankingId: { $in: rankingIds } }, { recipientId: { $in: userIds } }, { actorId: { $in: userIds } }],
    }),
    authtokens: await remove('authtokens', { userId: { $in: userIds } }),
    oauthaccounts: await remove('oauthaccounts', { userId: { $in: userIds } }),
  };

  await recount(db, session, touched);
  return removed;
}

function report(removed, sample, passwordNote) {
  const describe = (counts) =>
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${count} ${name}`)
      .join(', ');

  console.log(describe(removed) ? `Removed: ${describe(removed)}` : 'There was no sample data to remove.');
  if (!sample) return;

  const added = Object.fromEntries(Object.entries(sample.docs).map(([name, list]) => [name, list.length]));
  console.log(`Added: ${describe(added)}`);

  console.log(`\nSample accounts, all with ${passwordNote}:`);
  const width = Math.max(...sample.accounts.map((account) => account.email.length));
  for (const { email, note } of sample.accounts) console.log(`  ${email.padEnd(width)}  ${note}`);

  console.log('\nWorth trying:');
  for (const { note, path } of sample.highlights) console.log(`  ${note}\n    ${path}`);
}

// ---------------------------------------------------------------------------------------------

const { MONGO_ROOT_URI, MONGO_APP_DB = 'app', SEED_PASSWORD } = process.env;
const removeOnly = process.argv.includes('--remove');

if (!MONGO_ROOT_URI) {
  console.error("Set MONGO_ROOT_URI, for example MONGO_ROOT_URI='mongodb://root:devpassword@localhost:27017/?directConnection=true'");
  process.exit(1);
}

const client = new MongoClient(MONGO_ROOT_URI);
await client.connect();

try {
  const db = client.db(MONGO_APP_DB);
  const target = `database "${MONGO_APP_DB}" on ${client.options.hosts.join(', ')}`;
  console.log(removeOnly ? `Removing sample data from ${target}` : `Seeding ${target}`);

  await checkCollectionsExist(db);
  if (!removeOnly) await checkUsernamesFree(db);

  const sample = removeOnly
    ? null
    : buildSampleData(await bcrypt.hash(SEED_PASSWORD || DEFAULT_PASSWORD, 10), Date.now());

  // All or nothing: if anything fails, the old sample data is still there
  let removed;
  await client.withSession((session) =>
    session.withTransaction(async () => {
      removed = await removeSampleData(db, session);
      for (const [name, list] of Object.entries(sample?.docs ?? {})) {
        if (list.length > 0) await db.collection(name).insertMany(list, { session });
      }
    }),
  );

  report(removed, sample, SEED_PASSWORD ? 'the password in SEED_PASSWORD' : `the password "${DEFAULT_PASSWORD}"`);
} catch (err) {
  console.error(err instanceof SeedError ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.close();
}
