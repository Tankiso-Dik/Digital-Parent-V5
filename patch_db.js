const fs = require('fs');
let content = fs.readFileSync('server/db.js', 'utf8');

const migration52 = `
  {
    version: 52,
    description: 'Add global active session state for extension polling',
    up: \`
      CREATE TABLE IF NOT EXISTS active_session_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      INSERT OR IGNORE INTO active_session_state (id, user_id) VALUES (1, NULL);
    \`,
  },
`;

content = content.replace('];\n\n/**', migration52 + '];\n\n/**');
fs.writeFileSync('server/db.js', content);
