import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(__dirname, '..', 'data', 'oikos.db'));

const samId = db.prepare("SELECT id FROM users WHERE username = 'sam'").get()?.id;
if (!samId) process.exit(0);

const today = new Date().toISOString().slice(0, 10);

const insertLog = db.prepare(`
  INSERT INTO app_usage_logs (user_id, app_identifier, app_name, category_id, start_time, end_time, duration)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

[
  ['youtube.com', 'YouTube', 1, `${today}T14:00:00Z`, `${today}T14:45:00Z`, 2700],
  ['tiktok.com', 'TikTok', 1, `${today}T15:00:00Z`, `${today}T15:20:00Z`, 1200],
  ['roblox.com', 'Roblox', 2, `${today}T16:00:00Z`, `${today}T17:00:00Z`, 3600],
  ['khanacademy.org', 'Khan Academy', 3, `${today}T10:00:00Z`, `${today}T10:30:00Z`, 1800],
  ['wikipedia.org', 'Wikipedia', 3, `${today}T10:35:00Z`, `${today}T10:50:00Z`, 900],
].forEach(row => {
  insertLog.run(samId, ...row);
});

console.log('Seeded app usage logs');
