const fs = require('fs');

let content = fs.readFileSync('server/db.js', 'utf8');

const migration51 = `
  {
    version: 51,
    description: 'Add advanced app tracking schema',
    up: \`
      CREATE TABLE IF NOT EXISTS app_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );

      INSERT OR IGNORE INTO app_categories (name) VALUES 
        ('Social Media'), ('Gaming'), ('Education'), ('Entertainment'), ('Communication'), ('Other');

      CREATE TABLE IF NOT EXISTS app_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        app_identifier TEXT NOT NULL,
        app_name TEXT NOT NULL,
        category_id INTEGER REFERENCES app_categories(id) ON DELETE SET NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS blocked_apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        app_identifier TEXT,
        category_id INTEGER REFERENCES app_categories(id) ON DELETE CASCADE,
        is_blocked INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS curfews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        days_of_week TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS block_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        reason_type TEXT NOT NULL
      );
    \`,
  },
];`;

content = content.replace('];\n\n/**', migration51 + '\n\n/**');

fs.writeFileSync('server/db.js', content);
console.log('Patched db.js');
