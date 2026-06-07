import express from 'express';
import * as db from '../db.js';
import { createLogger } from '../logger.js';

const log = createLogger('Location');
const router = express.Router();

router.get('/', (req, res) => {
  try {
    const user = db.get().prepare('SELECT id, role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    
    if (isParent) {
      const locations = db.get().prepare(`
        SELECT cl.*, u.display_name
        FROM child_locations cl
        JOIN users u ON u.id = cl.user_id
        WHERE u.family_role = 'child'
      `).all();
      return res.json({ data: locations });
    } else {
      const location = db.get().prepare('SELECT * FROM child_locations WHERE user_id = ?').get(req.authUserId);
      return res.json({ data: location ? [location] : [] });
    }
  } catch (err) {
    log.error('GET / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

router.post('/', (req, res) => {
  try {
    const { lat, lng } = req.body;
    
    // Evaluate zone entirely on the backend
    const zones = db.get().prepare('SELECT * FROM family_zones').all();
    let computedZoneName = null;
    let computedLocationType = 'unknown';
    let minDistance = Infinity;

    for (const z of zones) {
      const d = getDistance(lat, lng, z.lat, z.lng);
      if (d < (z.radius || 250) && d < minDistance) {
        minDistance = d;
        computedZoneName = z.name;
        computedLocationType = z.zone_type;
      }
    }

    // Get previous state to detect arrival/departure events
    const prev = db.get().prepare('SELECT zone_name FROM child_locations WHERE user_id = ?').get(req.authUserId);
    const prevZone = prev ? prev.zone_name : null;

    if (prevZone !== computedZoneName) {
      // Zone changed! Record events
      const insertEvent = db.get().prepare('INSERT INTO location_events (user_id, event_type, zone_name) VALUES (?, ?, ?)');
      if (prevZone) {
        insertEvent.run(req.authUserId, 'left', prevZone);
      }
      if (computedZoneName) {
        insertEvent.run(req.authUserId, 'arrived', computedZoneName);
      }
    }

    db.get().prepare(`
      INSERT INTO child_locations (user_id, location_type, lat, lng, zone_name, updated_at)
      VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ON CONFLICT(user_id) DO UPDATE SET
        location_type = excluded.location_type,
        lat = excluded.lat,
        lng = excluded.lng,
        zone_name = excluded.zone_name,
        updated_at = excluded.updated_at
    `).run(req.authUserId, computedLocationType, lat || 0, lng || 0, computedZoneName || null);

    db.get().prepare(`
      INSERT INTO child_location_history (user_id, lat, lng, zone_name)
      VALUES (?, ?, ?, ?)
    `).run(req.authUserId, lat || 0, lng || 0, computedZoneName || null);

    // Clear pending requests
    db.get().prepare(`
      UPDATE location_requests SET status = 'completed' WHERE user_id = ? AND status = 'pending'
    `).run(req.authUserId);
    
    res.json({ ok: true });
  } catch (err) {
    log.error('POST / error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/request', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    if (!isParent) return res.status(403).json({ error: 'Forbidden' });

    const children = db.get().prepare("SELECT id FROM users WHERE family_role = 'child'").all();
    const stmt = db.get().prepare(`INSERT INTO location_requests (user_id, status) VALUES (?, 'pending')`);
    
    const tx = db.get().transaction(() => {
       for (const child of children) {
          stmt.run(child.id);
       }
    });
    tx();

    res.json({ ok: true });
  } catch (err) {
    log.error('POST /request error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/pending-status', (req, res) => {
  try {
    // Only check for requests newer than 15 minutes to avoid perma-locking
    const pending = db.get().prepare(`
      SELECT id FROM location_requests 
      WHERE user_id = ? AND status = 'pending' 
      AND (cast(strftime('%s', 'now') as integer) - cast(strftime('%s', requested_at) as integer)) < 900
      LIMIT 1
    `).get(req.authUserId);
    
    res.json({ pending: !!pending });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});


router.get('/zones', (req, res) => {
  try {
    const zones = db.get().prepare('SELECT * FROM family_zones').all();
    res.json({ data: zones });
  } catch (err) {
    log.error('GET /zones error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/zones', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    if (!isParent) return res.status(403).json({ error: 'Forbidden' });

    const { name, lat, lng, zone_type, radius } = req.body;
    db.get().prepare(`
      INSERT INTO family_zones (name, lat, lng, zone_type, radius)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, lat, lng, zone_type, radius || 250);
    res.json({ ok: true });
  } catch (err) {
    log.error('POST /zones error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


router.get('/history/:id', (req, res) => {
  try {
    const history = db.get().prepare(`
      SELECT lat, lng, zone_name, timestamp 
      FROM child_location_history 
      WHERE user_id = ? 
      ORDER BY timestamp DESC LIMIT 20
    `).all(req.params.id);
    res.json({ data: history });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/zones/:id', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    if (!isParent) return res.status(403).json({ error: 'Forbidden' });

    db.get().prepare('DELETE FROM family_zones WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/zones/:id', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    if (!isParent) return res.status(403).json({ error: 'Forbidden' });

    const { radius } = req.body;
    db.get().prepare('UPDATE family_zones SET radius = ? WHERE id = ?').run(radius, req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/events', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    if (!isParent) return res.status(403).json({ error: 'Forbidden' });

    const events = db.get().prepare(`
      SELECT le.*, u.display_name 
      FROM location_events le
      JOIN users u ON u.id = le.user_id
      ORDER BY le.timestamp DESC LIMIT 50
    `).all();
    res.json({ data: events });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/insights', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    if (!isParent) return res.status(403).json({ error: 'Forbidden' });

    const mostVisited = db.get().prepare(`
      SELECT u.display_name, ch.zone_name, count(*) as visits
      FROM child_location_history ch
      JOIN users u ON u.id = ch.user_id
      WHERE ch.zone_name IS NOT NULL
      GROUP BY ch.user_id, ch.zone_name
      ORDER BY visits DESC
      LIMIT 12
    `).all();

    const recent = db.get().prepare(`
      SELECT u.display_name, ch.zone_name, MAX(ch.timestamp) as last_seen
      FROM child_location_history ch
      JOIN users u ON u.id = ch.user_id
      WHERE ch.zone_name IS NOT NULL
      GROUP BY ch.user_id, ch.zone_name
      ORDER BY last_seen DESC
      LIMIT 12
    `).all();

    res.json({ data: { mostVisited, recent } });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/expected', (req, res) => {
  try {
    const checkins = db.get().prepare(`
      SELECT e.*, u.display_name 
      FROM expected_checkins e
      JOIN users u ON u.id = e.user_id
    `).all();

    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay();
    const currentStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    
    const enriched = checkins.map(c => {
      let status = 'pending';
      let days = [];
      try { days = JSON.parse(c.days_of_week); } catch(e) {}
      
      if (days.includes(currentDay)) {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const arrivedEvent = db.get().prepare(`
          SELECT * FROM location_events 
          WHERE user_id = ? AND zone_name = ? AND event_type = 'arrived' AND timestamp >= ?
        `).get(c.user_id, c.zone_name, startOfDay);

        if (arrivedEvent) {
           status = 'arrived';
        } else if (currentStr > c.expected_time) {
           status = 'missed';
        }
      } else {
        status = 'not_today';
      }
      return { ...c, status };
    });

    res.json({ data: enriched });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/expected', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    if (!isParent) return res.status(403).json({ error: 'Forbidden' });

    const { user_id, zone_name, expected_time, days_of_week } = req.body;
    db.get().prepare(`
      INSERT INTO expected_checkins (user_id, zone_name, expected_time, days_of_week)
      VALUES (?, ?, ?, ?)
    `).run(user_id, zone_name, expected_time, JSON.stringify(days_of_week || [1,2,3,4,5]));
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/expected/:id', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
    if (!isParent) return res.status(403).json({ error: 'Forbidden' });

    db.get().prepare('DELETE FROM expected_checkins WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

