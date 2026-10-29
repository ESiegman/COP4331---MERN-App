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
} finally {
  await client.close();
}
