import express from 'express';
import * as db from '../db.js';
import { createLogger } from '../logger.js';
const log = createLogger('AppUsage');

const router = express.Router();

// GET /api/v1/app-usage/categories
router.get('/categories', (req, res) => {
  try {
    const cats = db.get().prepare('SELECT * FROM app_categories').all();
    res.json({ data: cats });
  } catch (err) {
    log.error('GET /app-usage/categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/app-usage/active-role
router.get('/active-role', (req, res) => {
  try {
    const row = db.get().prepare(`
      SELECT users.family_role 
      FROM active_session_state 
      JOIN users ON active_session_state.user_id = users.id 
      WHERE active_session_state.id = 1
      AND EXISTS (
        SELECT 1 FROM sessions 
        WHERE json_extract(sess, '$.userId') = users.id 
        AND expired_at > (strftime('%s', 'now') * 1000)
      )
    `).get();
    res.json({ active_role: row ? row.family_role : null });
  } catch (err) {
    log.error('GET /app-usage/active-role error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v1/app-usage/logs (Called by Extension)
router.post('/logs', (req, res) => {
  try {
    // Only track if globally active user is a child AND their session hasn't naturally expired
    const user = db.get().prepare(`
      SELECT users.id, users.family_role 
      FROM active_session_state 
      JOIN users ON active_session_state.user_id = users.id 
      WHERE active_session_state.id = 1
      AND EXISTS (
        SELECT 1 FROM sessions 
        WHERE json_extract(sess, '$.userId') = users.id 
        AND expired_at > (strftime('%s', 'now') * 1000)
      )
    `).get();
    
    if (!user || user.family_role !== 'child') {
      return res.json({ ok: true, ignored: true, message: 'Active role is not a child' });
    }

    const { app_identifier, app_name, category_id, start_time, end_time, duration } = req.body;
    db.get().prepare(`
      INSERT INTO app_usage_logs (user_id, app_identifier, app_name, category_id, start_time, end_time, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, app_identifier, app_name, category_id || null, start_time, end_time || null, duration || 0);

    res.json({ ok: true });
  } catch (err) {
    log.error('POST /app-usage/logs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/app-usage/logs
router.get('/logs', (req, res) => {
  try {
    const logs = db.get().prepare(`
      SELECT l.*, c.name as category_name 
      FROM app_usage_logs l
      LEFT JOIN app_categories c ON l.category_id = c.id
      ORDER BY l.start_time DESC
    `).all();
    res.json({ data: logs });
  } catch (err) {
    log.error('GET /app-usage/logs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v1/app-usage/analytics
router.get('/analytics', (req, res) => {
  try {
    // Top used apps
    const topApps = db.get().prepare(`
      SELECT app_name, category_id, SUM(duration) as total_duration
      FROM app_usage_logs
      GROUP BY app_name
      ORDER BY total_duration DESC
      LIMIT 5
    `).all();

    // Category breakdown
    const categoryStats = db.get().prepare(`
      SELECT c.name as category_name, SUM(l.duration) as total_duration
      FROM app_usage_logs l
      JOIN app_categories c ON l.category_id = c.id
      GROUP BY c.id
      ORDER BY total_duration DESC
    `).all();

    // Daily totals (last 7 days)
    const dailyStats = db.get().prepare(`
      SELECT date(start_time) as log_date, SUM(duration) as total_duration
      FROM app_usage_logs
      GROUP BY log_date
      ORDER BY log_date DESC
      LIMIT 7
    `).all();

    res.json({ data: { topApps, categoryStats, dailyStats } });
  } catch (err) {
    log.error('GET /app-usage/analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
