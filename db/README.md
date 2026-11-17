# Database guide

MongoDB uses collections instead of tables, and each record is a JSON document. Everything for this app goes in the `app` database, since that's the one the API connects to.

The workflow is: design the collections in Compass on your own machine, then copy them into `db/setup.js`. That script runs on every deploy, so production ends up with the same setup.

## Current collections

```mermaid
erDiagram
    users ||--o{ oauthaccounts : "signs in with"
    users ||--o{ authtokens : has
    users ||--o{ templates : creates
    users ||--o{ rankings : ranks
    users ||--o{ comments : writes
    users ||--o{ likes : gives
    users ||--o{ notifications : receives
    templates ||--o{ items : contains
    templates ||--o{ rankings : "ranked in"
    rankings ||--o{ comments : has
    rankings ||--o{ likes : has
    rankings ||--o{ notifications : about
```

| Collection | Holds | Unique index |
| --- | --- | --- |
| `users` | Accounts, with their notification switches and push tokens | `username`, and `email` |
| `oauthaccounts` | Google and Discord logins linked to a user | `provider` + `providerUserId` |
| `authtokens` | One-time tokens behind email verification and password reset links. MongoDB deletes them once `expiresAt` has passed | |
| `templates` | The things being ranked, like "Gas station snacks" | |
| `items` | What gets ranked inside a template | |
| `rankings` | One person's tier list for a template. Its tiers are stored inside it | `templateId` + `ownerId` |
| `comments` | Comments on a ranking. `updatedAt` moves past `createdAt` when one is edited | |
| `likes` | One like per user per ranking | `rankingId` + `userId` |
| `notifications` | "Someone ranked, liked or commented on your content" | |

`db/setup.js` has every field. For each collection it lists a `schema`, which MongoDB uses to check every write, and its `indexes`. The same fields are drawn as a diagram in [server/README.md](../server/README.md#data-model).

The API's Mongoose models in `server/src/models/` use these same field names. If you rename or add a field here, tell the API developer so the models match. If they don't, the API's writes are rejected by the schema and it answers `500`.

```mermaid
flowchart LR
    A[Design in Compass locally] --> B[Copy into db/setup.js]
    B --> C["Test: docker compose down -v, then up"]
    C --> D[Push to main]
    D --> E[Deploy runs db-setup on the droplet]
    E --> F[(Production database matches)]
```

## Sample data

`db/seed.js` fills the database with sample data for trying the app by hand. It never runs on its own: deploys only run `setup.js`.

With the dev stack running (`docker compose up`):

```sh
docker compose run --rm --build db-setup node seed.js
```

`--build` is needed the first time, because the script uses a package that older db images don't have. Running it again replaces the sample data with a fresh copy. To take it out:

```sh
docker compose run --rm db-setup node seed.js --remove
```

Every sample account's email ends in `@seed.example.com`, and the password is `tierlist-dev`. The script prints the accounts and the links to the cases below.

| What | Includes |
| --- | --- |
| 7 accounts | Different notification settings, one with no display name, and one that hasn't verified its email, so its login answers `403` |
| 10 templates | One with its own tier labels instead of S to F, one nobody has ranked, one unlisted, one private |
| 29 rankings | Two drafts, a private one, an unlisted one, hot takes, one with an extra "God tier", one with only four tiers. People mostly agree, so the community rankings have a clear top and bottom |
| Likes, comments, notifications | Comments mention the items in the ranking, and owners sometimes reply. Notifications follow the same rules as the API, and the older ones are marked read |

How it behaves:

- **It only touches sample data.** That is everything the sample accounts own or wrote. Removing it also removes what hangs off it (other people's rankings of sample templates, and their likes and comments on sample rankings), and fixes the counters on anything else the sample accounts liked, commented on or ranked.
- **Links keep working.** Ids are the same on every run and start with `5eed`. Dates are counted back from now, so the data always looks recent.
- **All or nothing.** It runs in one transaction, so if anything fails the database is left as it was.
- **It won't take a real account's username.** If someone has already registered one of the sample usernames, it stops and says which.

To have demo data on the live site, run it on the droplet once a deploy has included `seed.js`, with a password of your own. The default one is written here, so anyone could log in to the sample accounts with it:

```sh
ssh deploy@mern.esiegman.dev
cd /opt/mern
docker compose run --rm -e SEED_PASSWORD='<a password>' db-setup node seed.js
```

The same command with `--remove` at the end takes it out again.

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
   - **Indexes** tab: add indexes. For example, `username` with "Create unique index" checked stops duplicate usernames.
   - **Validation** tab (optional): set rules like required fields. Compass shows them as JSON you can copy later.
   - **Documents** tab: insert test data with Add Data > Insert Document.

If the API uses Mongoose, a model named `User` reads the `users` collection (lowercase and plural), so name collections to match.

## 3. Copy it into `db/setup.js`

Anything you made by hand only exists on your machine. To make it permanent, add it to `db/setup.js`. The script runs on every deploy, so it is written to be safe to run repeatedly.

Every collection is one entry in the `collections` object near the top of the `try` block. To add a collection, add an entry. This one is only an example:

```js
const collections = {
  // ...the existing collections...

  reports: {
    // Validation rules: paste the JSON from Compass's Validation tab
    schema: {
      bsonType: 'object',
      required: ['rankingId', 'reporterId', 'reason'],
      properties: {
        rankingId: oid,
        reporterId: oid,
        reason: { bsonType: 'string' },
        note: { bsonType: ['string', 'null'] },
        createdAt: { bsonType: 'date' },
      },
    },
    indexes: [
      { key: { rankingId: 1 } },
      { key: { rankingId: 1, reporterId: 1 }, unique: true },
    ],
  },
};
```

The loop at the bottom of the file does the rest: it creates the collection if it is missing, applies the `schema`, and creates the indexes. Nothing else needs to change.

To add a field to an existing collection, add it under that collection's `properties`. To add an index, add it to that collection's `indexes`.

Starter data goes after the loop, written so that it is only inserted once. This is for data production needs on every deploy; sample data for testing belongs in `seed.js` (see [Sample data](#sample-data)).

```js
await db.collection('users').updateOne(
  { username: 'demo' },
  {
    $setOnInsert: {
      username: 'demo',
      email: 'demo@example.com',
      passwordHash: null,
      emailVerified: true,
      createdAt: new Date(),
    },
  },
  { upsert: true },
);
```

Rules for this file:

- Don't use plain `insertOne`, or a new copy gets inserted on every deploy. Use `updateOne` with `upsert` like above. Starter data has to pass the collection's `schema` like any other write.
- A field with `bsonType: 'string'` rejects `null`. If it should be allowed to be empty, write `bsonType: ['string', 'null']`, or leave the field out of the document.
- Only put a field in `required` if every document will have it, including the ones already in production.
- A new unique index has to fit the documents already in production, or the deploy fails and the API does not restart. That is what happened when `username` became unique while the old users had none. An empty local database will not show this, so think about what production holds.
- To change an existing index's options, drop it first with `dropIndex('username_1')`, or `createIndexes` will error.
- Never drop collections or delete data here. The one exception already in the file is the cleanup of the old cards project, just before the loop. It does nothing once it has run, and can be deleted after production and everyone's local database have run it.

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

If you changed a field, also run the API's tests against your local database. One of them saves a document of every model, so it fails if the API's models and your `schema` no longer agree:

```sh
cd server
MONGODB_URI='mongodb://app:apppassword@localhost:27017/app?directConnection=true' npm test
```

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
