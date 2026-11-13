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
        { key: { userId: 1 } },
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
        required: ['recipientId', 'actorId', 'type', 'rankingId', 'read'],
        properties: {
          recipientId: oid,
          actorId: oid,
          type: { enum: ['new_ranking', 'new_comment', 'new_like'] },
          rankingId: oid,
          read: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
        },
      },
      indexes: [{ key: { recipientId: 1, read: 1, createdAt: -1 } }],
    },
  };

  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );

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
