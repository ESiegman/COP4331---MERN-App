# Database guide

MongoDB uses collections instead of tables, and each record is a JSON document. Everything for this app goes in the `app` database, since that's the one the API connects to.

The workflow is: design the collections in Compass on your own machine, then copy them into `db/setup.js`. That script runs on every deploy, so production ends up with the same setup.

## 1. Connect to your local database

Start the stack from the repo root:

```sh
docker compose up --build
```

In MongoDB Compass, add a new connection with this URI:

```
mongodb://root:devpassword@localhost:27017/?directConnection=true
```

## 2. Create collections in Compass

1. Click **+** next to Databases. Enter `app` as the database name and your first collection name, for example `users`.
2. To add more collections, hover over `app`, click **+**, and create them.
3. In each collection:
   - **Indexes** tab: add indexes. For example, `login` with "Create unique index" checked stops duplicate usernames.
   - **Validation** tab (optional): set rules like required fields. Compass shows them as JSON you can copy later.
   - **Documents** tab: insert test data with Add Data > Insert Document.

If the API uses Mongoose, a model named `User` reads the `users` collection (lowercase and plural), so name collections to match.

## 3. Copy it into `db/setup.js`

Anything you made by hand only exists on your machine. To make it permanent, add it to `db/setup.js` inside the `try` block, after the user setup. The script runs on every deploy, so write it to be safe to run repeatedly:

```js
// Collections
const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
for (const name of ['users', 'contacts']) {
  if (!existing.includes(name)) await db.createCollection(name);
}

// Indexes (does nothing if the index already exists)
await db.collection('users').createIndex({ login: 1 }, { unique: true });
await db.collection('contacts').createIndex({ userId: 1 });

// Validation rules (optional, paste the JSON from Compass's Validation tab)
await db.command({
  collMod: 'users',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['login', 'password'],
      properties: {
        login: { bsonType: 'string' },
        password: { bsonType: 'string' },
      },
    },
  },
});

// Starter data (only inserted if it isn't there yet)
await db.collection('users').updateOne(
  { login: 'admin' },
  { $setOnInsert: { login: 'admin', password: 'change-me', firstName: 'Admin' } },
  { upsert: true },
);
```

Rules for this file:

- Don't use plain `insertOne`, or a new copy gets inserted on every deploy. Use `updateOne` with `upsert` like above.
- To change an existing index's options, drop it first with `dropIndex('login_1')`, or `createIndex` will error.
- Never drop collections or delete data here.

## 4. Test it locally

Rerun just the setup script:

```sh
docker compose up db-setup
```

To check it works from nothing, the way a new server would, wipe your local database and start again:

```sh
docker compose down -v
docker compose up
```

Then refresh Compass and check that everything is there.

## 5. Push to production

Commit and push to `main`. The deploy workflow rebuilds the setup container and runs it on the droplet before the API restarts. Watch it in the Actions tab on GitHub.

## 6. Check production (optional)

You need your SSH key added to the droplet first. Open a tunnel and leave it running:

```sh
ssh -N -L 27018:127.0.0.1:27017 deploy@mern.esiegman.dev
```

Get the root password:

```sh
ssh deploy@mern.esiegman.dev grep MONGO_ROOT_PASSWORD /opt/mern/.env
```

Then connect Compass to:

```
mongodb://root:<password>@localhost:27018/?directConnection=true
```

Use this for looking around. Make structure changes in `setup.js` so they're in git and apply the same way everywhere.
