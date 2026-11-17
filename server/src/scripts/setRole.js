import { connectDb, disconnectDb } from '../lib/db.js';
import { roleOf } from '../lib/roles.js';
import { ROLES, User } from '../models/index.js';
import { changeRole } from '../modules/admin/admin.service.js';

// Gives an account a role from the server. This is how the first admin is made, since no route
// lets anyone promote themselves. On the droplet:
//   docker compose exec api node src/scripts/setRole.js <username> <user|moderator|admin>

const [username, role] = process.argv.slice(2);
if (!username || !ROLES.includes(role)) {
  console.error('Usage: node src/scripts/setRole.js <username> <user|moderator|admin>');
  process.exit(1);
}

await connectDb();
try {
  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) {
    console.error(`No account is called ${username}`);
    process.exitCode = 1;
  } else if (roleOf(user) === role) {
    console.log(`${user.username} is already ${role}`);
  } else {
    await changeRole(null, user, role);
    console.log(`${user.username} is now ${role}`);
  }
} finally {
  await disconnectDb();
}
