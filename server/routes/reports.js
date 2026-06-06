import express from 'express';
import * as db from '../db.js';
import { createLogger } from '../logger.js';

const log = createLogger('Reports');
const router = express.Router();

router.get('/child/:id', (req, res) => {
  try {
    const childId = req.params.id;
    
    const tasks = db.get().prepare(`
      SELECT 
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as finished,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COUNT(*) as total
      FROM tasks
      WHERE (assigned_to = ? OR EXISTS (SELECT 1 FROM task_assignments WHERE task_id = tasks.id AND user_id = ?))
    `).get(childId, childId);

    const events = db.get().prepare(`
      SELECT 
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as finished,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COUNT(*) as total
      FROM calendar_events
      WHERE (assigned_to = ? OR EXISTS (SELECT 1 FROM event_assignments WHERE event_id = calendar_events.id AND user_id = ?))
    `).get(childId, childId);

    const apps = db.get().prepare(`
      SELECT app_type, SUM(minutes) as total_minutes
      FROM child_app_usage
      WHERE user_id = ? AND date(recorded_at, 'localtime') = date('now', 'localtime')
      GROUP BY app_type
    `).all(childId);

    const location = db.get().prepare(`
      SELECT location_type, updated_at
      FROM child_locations
      WHERE user_id = ?
    `).get(childId);

    const userRow = db.get().prepare('SELECT points, current_streak FROM users WHERE id = ?').get(childId);

    res.json({ 
      data: {
        tasks: tasks || { finished: 0, failed: 0, total: 0 },
        events: events || { finished: 0, failed: 0, total: 0 },
        apps: apps || [],
        location: location || null,
        points: userRow?.points || 0,
        current_streak: userRow?.current_streak || 0,
        highest_streak: userRow?.highest_streak || 0
      }
    });
  } catch (err) {
    log.error('GET /child/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/apps', (req, res) => {
  try {
    const { app_type, minutes } = req.body;
    if (!['social', 'games', 'school'].includes(app_type)) {
      return res.status(400).json({ error: 'Invalid app type.' });
    }
    
    db.get().prepare(`
      INSERT INTO child_app_usage (user_id, app_type, minutes)
      VALUES (?, ?, ?)
    `).run(req.authUserId, app_type, minutes);
    
    res.json({ ok: true });
  } catch (err) {
    log.error('POST /apps error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/spend', (req, res) => {
  try {
    const { cost, app_type, minutes } = req.body;
    
    // Use a transaction to ensure points and usage are updated atomically
    const performSpend = db.get().transaction(() => {
      const user = db.get().prepare('SELECT points FROM users WHERE id = ?').get(req.authUserId);
      const currentPoints = user?.points || 0;

      if (currentPoints < cost) {
        throw new Error('INSUFFICIENT_POINTS');
      }

      // 1. Deduct points
      db.get().prepare('UPDATE users SET points = points - ? WHERE id = ?').run(cost, req.authUserId);

      // 2. Log app usage if provided (Atomic Action)
      if (app_type && minutes) {
        if (!['social', 'games', 'school'].includes(app_type)) {
          throw new Error('INVALID_APP_TYPE');
        }
        db.get().prepare(`
          INSERT INTO child_app_usage (user_id, app_type, minutes)
          VALUES (?, ?, ?)
        `).run(req.authUserId, app_type, minutes);
      }

      return currentPoints - cost;
    });

    const newBalance = performSpend();
    res.json({ ok: true, new_balance: newBalance });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_POINTS') {
      return res.status(402).json({ error: 'Insufficient points to complete this action.' });
    }
    if (err.message === 'INVALID_APP_TYPE') {
      return res.status(400).json({ error: 'Invalid app type.' });
    }
    log.error('POST /spend error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


router.get('/emergency', (req, res) => {
  try {
    const user = db.get().prepare('SELECT role, family_role FROM users WHERE id = ?').get(req.authUserId);
    const isParent = user?.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user?.family_role);

    let query = `
      SELECT e.*, u.display_name, u.avatar_color
      FROM emergency_requests e
      JOIN users u ON e.user_id = u.id
    `;
    let params = [];

    if (!isParent) {
      query += ` WHERE e.user_id = ?`;
      params.push(req.authUserId);
    }
    query += ` ORDER BY e.created_at DESC`;

    const requests = db.get().prepare(query).all(...params);
    res.json({ data: requests });
  } catch (err) {
    log.error('GET /emergency error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/emergency', (req, res) => {
  try {
    const { app_type, reason, request_type } = req.body;
    db.get().prepare(`
      INSERT INTO emergency_requests (user_id, app_type, reason)
      VALUES (?, ?, ?)
    `).run(req.authUserId, app_type || 'system', reason);
    res.json({ ok: true });
  } catch (err) {
    log.error('POST /emergency error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.patch('/emergency/:id', (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    db.get().prepare(`
      UPDATE emergency_requests SET status = ? WHERE id = ?
    `).run(status, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    log.error('PATCH /emergency/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/award', (req, res) => {
  try {
    const { childId, amount } = req.body;
    if (!childId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid parameters.' });
    }
    
    const performAward = db.get().transaction(() => {
      db.get().prepare('UPDATE users SET points = points + ? WHERE id = ?').run(amount, childId);
      const user = db.get().prepare('SELECT points FROM users WHERE id = ?').get(childId);
      return user?.points || 0;
    });

    const newBalance = performAward();
    res.json({ ok: true, new_balance: newBalance });
  } catch (err) {
    log.error('POST /award error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
