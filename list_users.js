const db = require('better-sqlite3')('backend/database/clinic.db');
const users = db.prepare('SELECT id, username, full_name, role FROM users').all();
console.table(users);
