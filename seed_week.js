import * as db from './server/db.js';

// Init DB
db.init();

// Insert sample chores for Sam (id=2) for the whole week
const today = new Date();
const dates = [];
for(let i=0; i<7; i++) {
  const d = new Date(today);
  d.setDate(d.getDate() - 3 + i);
  dates.push(d.toISOString().split('T')[0]);
}

const stmts = [
  // Recurring Chore: Make Bed (Every day)
  `INSERT INTO calendar_events (title, category, assigned_to, created_by, start_datetime, end_datetime, recurrence_rule)
   VALUES ('Make Bed', 'chore', 2, 1, '${dates[0]}T07:00:00Z', '${dates[0]}T07:15:00Z', 'FREQ=DAILY')`,
   
  // Recurring Study: Math Homework (Weekdays)
  `INSERT INTO calendar_events (title, category, assigned_to, created_by, start_datetime, end_datetime, recurrence_rule)
   VALUES ('Math Homework', 'study', 2, 1, '${dates[0]}T15:00:00Z', '${dates[0]}T16:00:00Z', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')`,

  // One-off Chore: Clean Garage (Today)
  `INSERT INTO calendar_events (title, category, assigned_to, created_by, start_datetime, end_datetime)
   VALUES ('Clean Garage', 'chore', 2, 1, '${dates[3]}T10:00:00Z', '${dates[3]}T12:00:00Z')`,

  // Recurring Routine: Read a Book (Every day)
  `INSERT INTO calendar_events (title, category, assigned_to, created_by, start_datetime, end_datetime, recurrence_rule)
   VALUES ('Read a Book', 'routine', 2, 1, '${dates[0]}T19:00:00Z', '${dates[0]}T19:30:00Z', 'FREQ=DAILY')`,
];

stmts.forEach(s => db.get().prepare(s).run());
console.log('Seed data added.');
