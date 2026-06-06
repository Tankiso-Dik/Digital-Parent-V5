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

router.post('/', (req, res) => {
  try {
    const { location_type, lat, lng, zone_name } = req.body;
    if (!['school', 'park', 'danger', 'safe', 'unknown', 'transit'].includes(location_type)) {
      return res.status(400).json({ error: 'Invalid location type.' });
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
    `).run(req.authUserId, location_type, lat || 0, lng || 0, zone_name || null);

    db.get().prepare(`
      INSERT INTO child_location_history (user_id, lat, lng, zone_name)
      VALUES (?, ?, ?, ?)
    `).run(req.authUserId, lat || 0, lng || 0, zone_name || null);

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
    
    db.transaction(() => {
       for (const child of children) {
          stmt.run(child.id);
       }
    });

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
    const { name, lat, lng, zone_type } = req.body;
    db.get().prepare(`
      INSERT INTO family_zones (name, lat, lng, zone_type)
      VALUES (?, ?, ?, ?)
    `).run(name, lat, lng, zone_type);
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
    db.get().prepare('DELETE FROM family_zones WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/zones/:id', (req, res) => {
  try {
    const { radius } = req.body;
    db.get().prepare('UPDATE family_zones SET radius = ? WHERE id = ?').run(radius, req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

