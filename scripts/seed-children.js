import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(__dirname, '..', 'data', 'oikos.db'));
db.pragma('foreign_keys = ON');

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function timeFromNow(days, hour, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, min, 0, 0);
  return d.toISOString().slice(0, 16);
}

console.log('Seeding child data...');

// 1. Update Sam to be a child member and add Mia
const pw = bcrypt.hashSync('demo1234', 12);
let alexId = db.prepare("SELECT id FROM users WHERE username = 'alex'").get()?.id;
let samId = db.prepare("SELECT id FROM users WHERE username = 'sam'").get()?.id;

db.prepare("UPDATE users SET family_role = 'child', points = 150, current_streak = 3 WHERE id = ?").run(samId);

const insertUser = db.prepare(`
  INSERT INTO users (username, display_name, password_hash, role, family_role, avatar_color, points, current_streak)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const miaId = insertUser.run('mia', 'Mia Johnson', pw, 'member', 'child', '#EC4899', 85, 1).lastInsertRowid;

console.log(`Updated Sam (id=${samId}) and added Mia (id=${miaId})`);

// 2. Add Family Zones
console.log('Adding Family Zones...');
const insertZone = db.prepare("INSERT INTO family_zones (name, lat, lng, zone_type) VALUES (?, ?, ?, ?)");
try {
  insertZone.run('Westpark Primary School', 51.505, -0.09, 'school');
  insertZone.run('Home', 51.51, -0.1, 'safe');
  insertZone.run('Local Park', 51.515, -0.095, 'park');
} catch(e) {} // ignore if they exist

// 3. Add Child Locations
console.log('Adding Child Locations...');
const insertLoc = db.prepare("INSERT INTO child_locations (user_id, location_type, lat, lng, zone_name) VALUES (?, ?, ?, ?, ?)");
try { insertLoc.run(samId, 'school', 51.505, -0.09, 'Westpark Primary School'); } catch(e) {}
try { insertLoc.run(miaId, 'safe', 51.51, -0.1, 'Home'); } catch(e) {}

// 4. Add Chores & School Tasks
console.log('Adding Chores & Homework...');
const insertTask = db.prepare(`
  INSERT INTO tasks (title, description, category, priority, status, due_date, assigned_to, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

[
  // Sam's Chores & Homework
  ['Math Worksheet', 'Complete pages 45-46', 'school', 'high', 'open', daysFromNow(1), samId, alexId],
  ['Science Project', 'Collect leaves for biology', 'school', 'medium', 'open', daysFromNow(3), samId, alexId],
  ['Clean Bedroom', 'Make bed and pick up toys', 'chore', 'high', 'open', daysFromNow(0), samId, alexId],
  ['Take out trash', 'Empty kitchen bin', 'chore', 'medium', 'done', daysFromNow(-1), samId, alexId],
  
  // Mia's Chores & Homework
  ['History Essay', 'Write 500 words on Romans', 'school', 'high', 'open', daysFromNow(2), miaId, alexId],
  ['Feed the Dog', 'Morning and evening', 'chore', 'high', 'open', daysFromNow(0), miaId, alexId],
  ['Empty Dishwasher', 'Put away all clean plates', 'chore', 'medium', 'done', daysFromNow(-1), miaId, alexId],
].forEach(row => insertTask.run(...row));

// 5. Add Calendar Events for School
console.log('Adding School Events...');
const insertEvent = db.prepare(`
  INSERT INTO calendar_events (title, description, start_datetime, end_datetime, all_day, location, color, assigned_to, created_by, category)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

[
  ['Parent-Teacher Meeting (Sam)', 'Room 12', timeFromNow(1, 15, 0), timeFromNow(1, 16, 0), 0, 'School', '#8B5CF6', samId, alexId, 'school'],
  ['Football Practice (Sam)', 'Bring boots', timeFromNow(0, 16, 0), timeFromNow(0, 18, 0), 0, 'Park', '#3B82F6', samId, alexId, 'activity'],
  ['Piano Lesson (Mia)', 'Practice scales', timeFromNow(0, 15, 30), timeFromNow(0, 16, 30), 0, 'Home', '#EC4899', miaId, alexId, 'activity'],
  ['Science Fair (Mia)', 'Gymnasium', timeFromNow(2, 9, 0), timeFromNow(2, 12, 0), 0, 'School', '#10B981', miaId, alexId, 'school'],
].forEach(row => insertEvent.run(...row));

console.log('Done!');
