import { MongoClient } from 'mongodb';

const { MONGO_ROOT_URI, MONGO_APP_DB, MONGO_APP_USER, MONGO_APP_PASSWORD } = process.env;

const client = new MongoClient(MONGO_ROOT_URI);
await client.connect();

try {
  const db = client.db(MONGO_APP_DB);
  const roles = [{ role: 'readWrite', db: MONGO_APP_DB }];
  const { users } = await db.command({ usersInfo: MONGO_APP_USER });

  if (users.length === 0) {
    await db.command({ createUser: MONGO_APP_USER, pwd: MONGO_APP_PASSWORD, roles });
    console.log(`Created user ${MONGO_APP_USER}`);
  } else {
    await db.command({ updateUser: MONGO_APP_USER, pwd: MONGO_APP_PASSWORD, roles });
  }

// collections for tier list application 
  const oid = { bsonType: 'objectId' };
  const visibility = { enum: ['public', 'unlisted', 'private'] };

  const collections = {
    users: {
      schema: {
        bsonType: 'object',
        required: ['username', 'email', 'emailVerified', 'createdAt'],
        properties: {
          username: { bsonType: 'string' },
          email: { bsonType: 'string' },
          passwordHash: { bsonType: ['string', 'null'] }, // null for OAuth-only users
          emailVerified: { bsonType: 'bool' },
          role: { enum: ['user', 'moderator', 'admin'] }, // missing counts as user
          bannedAt: { bsonType: 'date' },
          banReason: { bsonType: 'string' },
          displayName: { bsonType: 'string' },
          bio: { bsonType: 'string' },
          avatarUrl: { bsonType: 'string' },
          pushTokens: { bsonType: 'array', items: { bsonType: 'string' } },
          notificationPrefs: {
            bsonType: 'object',
            properties: {
              newComment: { bsonType: 'bool' },
              newRanking: { bsonType: 'bool' },
              newLike: { bsonType: 'bool' },
            },
          },
          createdAt: { bsonType: 'date' },
        },
      },
      indexes: [
        { key: { username: 1 }, unique: true },
        { key: { email: 1 }, unique: true },
      ],
    },

    oauthaccounts: {
      schema: {
        bsonType: 'object',
        required: ['userId', 'provider', 'providerUserId'],
        properties: {
          userId: oid,
          provider: { enum: ['google', 'discord'] },
          providerUserId: { bsonType: 'string' },
          email: { bsonType: 'string' },
          linkedAt: { bsonType: 'date' },
        },
      },
      indexes: [
        { key: { provider: 1, providerUserId: 1 }, unique: true },
        // one Google and one Discord account per user
        { key: { userId: 1, provider: 1 }, unique: true },
      ],
    },

    authtokens: {
      schema: {
        bsonType: 'object',
        required: ['userId', 'type', 'tokenHash', 'expiresAt'],
        properties: {
          userId: oid,
          type: { enum: ['verify_email', 'reset_password'] },
          tokenHash: { bsonType: 'string' },
          expiresAt: { bsonType: 'date' },
          usedAt: { bsonType: ['date', 'null'] },
        },
      },
      indexes: [
        { key: { tokenHash: 1 } },
        { key: { userId: 1 } },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, // auto-deletes expired tokens
      ],
    },

    templates: {
      schema: {
        bsonType: 'object',
        required: ['ownerId', 'title', 'visibility', 'createdAt'],
        properties: {
          ownerId: oid,
          title: { bsonType: 'string' },
          description: { bsonType: 'string' },
          category: { bsonType: 'string' },
          coverImageUrl: { bsonType: ['string', 'null'] },
          tierLabels: { bsonType: 'array', items: { bsonType: 'string' } },
          visibility,
          rankingCount: { bsonType: 'number' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        },
      },
      indexes: [
        { key: { title: 'text', description: 'text', category: 'text' } },
        { key: { ownerId: 1 } },
        { key: { visibility: 1, createdAt: -1 } },
        { key: { visibility: 1, rankingCount: -1, _id: -1 } }, // most ranked first
      ],
    },

    items: {
      schema: {
        bsonType: 'object',
        required: ['templateId', 'name'],
        properties: {
          templateId: oid,
          name: { bsonType: 'string' },
          imageUrl: { bsonType: ['string', 'null'] },
          createdAt: { bsonType: 'date' },
        },
      },
      indexes: [{ key: { templateId: 1 } }],
    },

    rankings: {
      schema: {
        bsonType: 'object',
        required: ['templateId', 'ownerId', 'tiers', 'visibility'],
        properties: {
          templateId: oid,
          ownerId: oid,
          title: { bsonType: 'string' },
          tiers: {
            bsonType: 'array',
            items: {
              bsonType: 'object',
              required: ['label', 'color', 'order', 'itemIds'],
              properties: {
                label: { bsonType: 'string' },
                color: { bsonType: 'string' },
                order: { bsonType: 'number' },
                itemIds: { bsonType: 'array', items: oid },
              },
            },
          },
          visibility,
          likeCount: { bsonType: 'number' },
          commentCount: { bsonType: 'number' },
          publishedAt: { bsonType: ['date', 'null'] },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        },
      },
      indexes: [
        { key: { templateId: 1, ownerId: 1 }, unique: true }, // one ranking per person per template
        { key: { ownerId: 1 } },
        { key: { templateId: 1, visibility: 1 } },
        { key: { visibility: 1, publishedAt: -1, _id: -1 } }, // the feed, newest first
        { key: { visibility: 1, likeCount: -1, _id: -1 } }, // the feed, most liked first
      ],
    },

    comments: {
      schema: {
        bsonType: 'object',
        required: ['rankingId', 'authorId', 'body'],
        properties: {
          rankingId: oid,
          authorId: oid,
          body: { bsonType: 'string' },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' }, // later than createdAt once the comment is edited
        },
      },
      indexes: [{ key: { rankingId: 1, createdAt: 1 } }],
    },

    likes: {
      schema: {
        bsonType: 'object',
        required: ['rankingId', 'userId'],
        properties: {
          rankingId: oid,
          userId: oid,
          createdAt: { bsonType: 'date' },
        },
      },
      indexes: [{ key: { rankingId: 1, userId: 1 }, unique: true }],
    },

    notifications: {
      schema: {
        bsonType: 'object',
        required: ['recipientId', 'actorId', 'type', 'read'],
        properties: {
          recipientId: oid,
          actorId: oid,
          type: { enum: ['new_ranking', 'new_comment', 'new_like', 'content_removed'] },
          rankingId: oid, // every type has one except content_removed of a template or ranking
          removed: {
            bsonType: 'object',
            required: ['kind', 'title'],
            properties: {
              kind: { enum: ['template', 'ranking', 'comment'] },
              title: { bsonType: 'string' },
              reason: { bsonType: 'string' },
            },
          },
          read: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
        },
      },
      indexes: [{ key: { recipientId: 1, read: 1, createdAt: -1 } }],
    },

    moderationlogs: {
      schema: {
        bsonType: 'object',
        required: ['action', 'targetUserId', 'summary', 'createdAt'],
        properties: {
          actorId: oid, // unset when a role was given with the setRole command
          action: { enum: ['delete_template', 'delete_ranking', 'delete_comment', 'ban', 'unban', 'set_role'] },
          targetUserId: oid,
          contentId: oid,
          summary: { bsonType: 'string' },
          reason: { bsonType: 'string' },
          createdAt: { bsonType: 'date' },
        },
      },
      indexes: [{ key: { createdAt: -1, _id: -1 } }],
    },
  };

  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );

  // one-time cleanup of the old cards project: its users have no username (breaks the
  // unique username index) and its unique login index breaks every sign-up after the first
  if (existing.has('cards')) await db.collection('cards').drop();
  if (existing.has('users')) {
    await db.collection('users').deleteMany({ username: { $exists: false } });
    if (await db.collection('users').indexExists('login_1')) await db.collection('users').dropIndex('login_1');
  }
  // replaced by the unique userId + provider index, which also serves lookups by userId
  if (existing.has('oauthaccounts') && (await db.collection('oauthaccounts').indexExists('userId_1'))) {
    await db.collection('oauthaccounts').dropIndex('userId_1');
  }

  for (const [name, { schema, indexes }] of Object.entries(collections)) {
    const validator = { $jsonSchema: schema };
    if (existing.has(name)) {
      await db.command({ collMod: name, validator }); // keeps validators in sync on re-runs
    } else {
      await db.createCollection(name, { validator });
    }
    await db.collection(name).createIndexes(indexes); // no-op if they already exist
  }

} finally {
  await client.close();
}
