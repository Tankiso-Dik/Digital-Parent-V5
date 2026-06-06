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

// POST /api/v1/app-usage/logs (Called by Extension)
router.post('/logs', (req, res) => {
  try {
    // Only track if user is child (family_role = 'child')
    const user = db.get().prepare('SELECT family_role FROM users WHERE id = ?').get(req.authUserId || req.session?.userId);
    if (!user || user.family_role !== 'child') {
      return res.json({ ok: true, ignored: true, message: 'Not a child role' });
    }

    const { app_identifier, app_name, category_id, start_time, end_time, duration } = req.body;
    db.get().prepare(`
      INSERT INTO app_usage_logs (user_id, app_identifier, app_name, category_id, start_time, end_time, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.authUserId || req.session?.userId, app_identifier, app_name, category_id || null, start_time, end_time || null, duration || 0);

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
