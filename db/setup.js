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

  // ---- Cards project: collections ----
const existingCollections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
for (const name of ['users', 'cards']) {
  if (!existingCollections.includes(name)) await db.createCollection(name);
}

// ---- Indexes (no-op if they already exist) ----
await db.collection('users').createIndex({ login: 1 }, { unique: true });
await db.collection('cards').createIndex({ userId: 1 });

// ---- Starter users (only inserted if the login isn't there yet) ----
// Placeholder hash, not a real password. These are demo accounts.
const pw = '$2b$10$placeholderplaceholderplaceholderplaceholderplaceholde';
const demoUsers = [
  { login: 'bugsfan',      firstName: 'Alex',   lastName: 'Rivera'   },
  { login: 'toonmaster',   firstName: 'Jamie',  lastName: 'Chen'     },
  { login: 'cardshark',    firstName: 'Morgan', lastName: 'Patel'    },
  { login: 'retrocollect', firstName: 'Sam',    lastName: 'Nguyen'   },
  { login: 'tunesquad',    firstName: 'Riley',  lastName: 'Johnson'  },
  { login: 'nakamawave',   firstName: 'Maya',   lastName: 'Thompson' },
  { login: 'grandlinegk',  firstName: 'Carlos', lastName: 'Mendez'   },
  { login: 'sunnygo',      firstName: 'Priya',  lastName: 'Sharma'   },
  { login: 'wanostrike',   firstName: 'Ethan',  lastName: 'Brooks'   },
  { login: 'bountyhunter', firstName: 'Hannah', lastName: 'Kim'      },
];
for (const u of demoUsers) {
  await db.collection('users').updateOne(
    { login: u.login },
    { $setOnInsert: { ...u, password: pw } },
    { upsert: true },
  );
}

// ---- Starter cards (only inserted if the character isn't there yet) ----
const userDocs = await db.collection('users')
  .find({ login: { $in: demoUsers.map((u) => u.login) } })
  .toArray();
const idByLogin = Object.fromEntries(userDocs.map((u) => [u.login, String(u._id)]));

const cards = [
  ['Monkey D. Luffy',   'Straw Hat Pirates', 100, 'Bandai'],
  ['Roronoa Zoro',      'Straw Hat Pirates',  90, 'Bandai'],
  ['Nami',              'Straw Hat Pirates',  60, 'Topps'],
  ['Usopp',             'Straw Hat Pirates',  55, 'Topps'],
  ['Sanji',             'Straw Hat Pirates',  85, 'Bandai'],
  ['Tony Tony Chopper', 'Straw Hat Pirates',  50, 'Panini'],
  ['Nico Robin',        'Straw Hat Pirates',  70, 'Panini'],
  ['Franky',            'Straw Hat Pirates',  58, 'Topps'],
  ['Brook',             'Straw Hat Pirates',  52, 'Panini'],
  ['Jinbe',             'Straw Hat Pirates',  75, 'Bandai'],
  ['Portgas D. Ace',    'Whitebeard Pirates', 88, 'Bandai'],
  ['Edward Newgate',    'Whitebeard Pirates', 95, 'Bandai'],
  ['Marco',             'Whitebeard Pirates', 72, 'Topps'],
  ['Shanks',            'Red Hair Pirates',   92, 'Bandai'],
  ['Trafalgar Law',     'Heart Pirates',      80, 'Panini'],
  ['Eustass Kid',       'Kid Pirates',        68, 'Topps'],
  ['Boa Hancock',       'Kuja Pirates',       74, 'Panini'],
  ['Dracule Mihawk',    'Cross Guild',        86, 'Bandai'],
  ['Crocodile',         'Cross Guild',        78, 'Topps'],
  ['Kaido',             'Beasts Pirates',     96, 'Bandai'],
  ['Charlotte Linlin',  'Big Mom Pirates',    94, 'Bandai'],
  ['Blackbeard',        'Blackbeard Pirates', 91, 'Topps'],
  ['Monkey D. Garp',    'Marines',            82, 'Panini'],
  ['Sabo',              'Revolutionary Army', 84, 'Bandai'],
  ['Smoker',            'Marines',            56, 'Topps'],
];
for (let i = 0; i < cards.length; i++) {
  const [playerName, teamName, cardValue, publisher] = cards[i];
  const owner = demoUsers[i % demoUsers.length].login;
  await db.collection('cards').updateOne(
    { playerName },
    { $setOnInsert: { playerName, teamName, cardValue, publisher, userId: idByLogin[owner] } },
    { upsert: true },
  );
}
} finally {
  await client.close();
}
