import db from 'better-sqlite3';

import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'oikos.db');
const sqlite = new db(DB_PATH);

try { sqlite.prepare('ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0').run(); } catch(e){}
try { sqlite.prepare('ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0').run(); } catch(e){}
try { sqlite.prepare('ALTER TABLE calendar_events ADD COLUMN category TEXT DEFAULT "other"').run(); } catch(e){}

// Add 2 children
console.log('Seeding children...');
try {
  sqlite.prepare(`
    INSERT INTO users (username, display_name, password_hash, role, family_role)
    VALUES 
    ('child1', 'Leo', '$2b$10$RgZf45PX087Co38CIjw/Re/X/TPscqZ2LdrZ59AYAYqosXu4QgcUK', 'member', 'child'),
    ('child2', 'Mia', '$2b$10$RgZf45PX087Co38CIjw/Re/X/TPscqZ2LdrZ59AYAYqosXu4QgcUK', 'member', 'child')
  `).run();
} catch (e) {
  console.log('Children already exist or error:', e.message);
}

const child1Id = sqlite.prepare("SELECT id FROM users WHERE username = 'child1'").get().id;
const child2Id = sqlite.prepare("SELECT id FROM users WHERE username = 'child2'").get().id;

sqlite.prepare('UPDATE users SET points = 120, current_streak = 5 WHERE id = ?').run(child1Id);
sqlite.prepare('UPDATE users SET points = 45, current_streak = 2 WHERE id = ?').run(child2Id);

// Seed some calendar chores for the children today
console.log('Seeding chores...');
const today = new Date().toISOString().split('T')[0];

sqlite.prepare(`
  INSERT INTO calendar_events (title, start_datetime, end_datetime, all_day, category, icon, created_by, assigned_to, status)
  VALUES 
  ('Clean Room', ? || 'T15:00:00.000Z', ? || 'T15:30:00.000Z', 0, 'chore', 'broom', 1, ?, 'open'),
  ('Homework Math', ? || 'T16:00:00.000Z', ? || 'T17:00:00.000Z', 0, 'study', 'book', 1, ?, 'open'),
  ('Walk Dog', ? || 'T17:30:00.000Z', ? || 'T18:00:00.000Z', 0, 'chore', 'dog', 1, ?, 'done')
`).run(today, today, child1Id, today, today, child1Id, today, today, child2Id);

// Seed some location history
console.log('Seeding locations...');
sqlite.prepare('DROP TABLE IF EXISTS child_locations').run();
sqlite.prepare(`
  CREATE TABLE child_locations (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    battery_level INTEGER,
    is_charging INTEGER,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )
`).run();

const now = new Date();
const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

sqlite.prepare(`
  INSERT INTO child_locations (user_id, latitude, longitude, accuracy, battery_level, is_charging, timestamp)
  VALUES 
  (?, -23.8969939, 29.4488468, 10.5, 85, 0, ?),
  (?, -23.8960000, 29.4480000, 15.0, 45, 1, ?)
`).run(child1Id, thirtyMinsAgo, child2Id, now.toISOString());

// Seed emergency request
console.log('Seeding emergency requests...');
sqlite.prepare(`
  INSERT INTO emergency_requests (user_id, app_type, reason, status)
  VALUES (?, 'Pick me up', 'Finished school early', 'pending')
`).run(child1Id);

console.log('Seeding complete! Passwords for children are password123');
