const fs = require('fs');
let code = fs.readFileSync('server/db.js', 'utf8');

const migration48 = `  {
    version: 48,
    description: 'Add missing columns for points, streak, calendar categories, and child zones',
    up: \`
      ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0;
      ALTER TABLE calendar_events ADD COLUMN category TEXT DEFAULT 'other';
      ALTER TABLE child_locations ADD COLUMN zone_name TEXT;
    \`,
  },
];`;

code = code.replace('  },\n];', '  },\n' + migration48);
fs.writeFileSync('server/db.js', code);
