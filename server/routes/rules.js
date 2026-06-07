import express from 'express';
import * as db from '../db.js';

const router = express.Router();

/**
 * GET /api/v1/rules/sync
 * Generates the compiled JSON payload for the Chrome extension
 */
router.get('/sync', (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const database = db.get();
    
    // We only need rules for the current family, but for simplicity we assume 
    // all users under the parent share the same rules, or we use the parent's rules.
    // In this MVP, we pull all rules globally or from the specific parent.
    // We'll just pull all active rules for now, or filter by the admin user.
    
    const adminUser = database.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (!adminUser) {
      return res.json({ error: 'No admin user found' });
    }
    const adminId = adminUser.id;

    // 1. Fetch domains, wildcards, and categories
    const rules = database.prepare("SELECT type, value, action, limit_minutes, start_time, end_time, days_of_week, custom_message FROM blocked_rules").all();
    
    const domains = {};
    const wildcards = [];
    const categories = {};
    const category_map = {};

    const safeParse = (str) => {
      try { return JSON.parse(str); } catch (e) { return [1,2,3,4,5,6,7]; }
    };

    for (const r of rules) {
      if (r.type === 'domain') {
        domains[r.value] = { action: r.action };
        if (r.limit_minutes) domains[r.value].limit_mins = r.limit_minutes;
        if (r.start_time) domains[r.value].start_time = r.start_time;
        if (r.end_time) domains[r.value].end_time = r.end_time;
        if (r.days_of_week) domains[r.value].days = safeParse(r.days_of_week);
        if (r.custom_message) domains[r.value].message = r.custom_message;
      } else if (r.type === 'wildcard') {
        wildcards.push({ pattern: r.value, action: r.action });
        if (r.limit_minutes) wildcards[wildcards.length - 1].limit_mins = r.limit_minutes;
        if (r.start_time) wildcards[wildcards.length - 1].start_time = r.start_time;
        if (r.end_time) wildcards[wildcards.length - 1].end_time = r.end_time;
        if (r.days_of_week) wildcards[wildcards.length - 1].days = safeParse(r.days_of_week);
        if (r.custom_message) wildcards[wildcards.length - 1].message = r.custom_message;
      } else if (r.type === 'category') {
        categories[r.value] = { action: r.action };
        if (r.limit_minutes) categories[r.value].limit_mins = r.limit_minutes;
        if (r.start_time) categories[r.value].start_time = r.start_time;
        if (r.end_time) categories[r.value].end_time = r.end_time;
        if (r.days_of_week) categories[r.value].days = safeParse(r.days_of_week);
        if (r.custom_message) categories[r.value].message = r.custom_message;
        
        // Populate category_map ONLY for categories that have rules
        const catDomains = database.prepare(`
          SELECT DISTINCT app_identifier as domain 
          FROM app_usage_logs l
          JOIN app_categories c ON l.category_id = c.id
          WHERE c.name = ? AND l.app_identifier IS NOT NULL
        `).all(r.value);
        for (const cd of catDomains) {
          category_map[cd.domain] = r.value;
        }
      }
    }

    // 2. Fetch Curfews
    const curfewsRaw = database.prepare(`
      SELECT c.start_time, c.end_time, c.days_of_week, c.strict_mode, m.message
      FROM curfews c
      LEFT JOIN block_messages m ON c.message_id = m.id
    `).all();

    const curfews = curfewsRaw.map(c => ({
      start_time: c.start_time,
      end_time: c.end_time,
      days: JSON.parse(c.days_of_week || '[]'),
      strict_mode: !!c.strict_mode,
      message_override: c.message || null
    }));

    // 3. Fetch default messages
    // Find generic messages (where user_id matches admin and they have no specific curfew attached)
    // For MVP, we provide hardcoded defaults and override if found
    const messages = {
      curfew_default: "Device is locked for the night.",
      category_default: "This app category is restricted right now.",
      domain_default: "This specific website has been blocked."
    };

    const msgRows = database.prepare("SELECT reason_type, message FROM block_messages WHERE reason_type IN ('curfew', 'category', 'domain')").all();
    for (const m of msgRows) {
      if (m.reason_type === 'curfew') messages.curfew_default = m.message;
      if (m.reason_type === 'category') messages.category_default = m.message;
      if (m.reason_type === 'domain') messages.domain_default = m.message;
    }

    const payload = {
      meta: {
        schema_version: "1.0",
        last_updated: Date.now(),
        active_preset: null // we can wire this up later
      },
      rules: {
        domains,
        wildcards,
        categories
      },
      category_map,
      curfews,
      messages
    };

    res.json(payload);
  } catch (error) {
    console.error('[RULES SYNC] Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * CRUD Endpoints for UI Wiring
 */

// Get all rules for the UI
router.get('/', (req, res) => {
  try {
    const database = db.get();
    const blocked_rules = database.prepare("SELECT * FROM blocked_rules").all();
    const curfews = database.prepare("SELECT * FROM curfews").all();
    res.json({ blocked_rules, curfews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update or create a rule
router.post('/rule', (req, res) => {
  try {
    const { type, value, action, limit_minutes, start_time, end_time, days_of_week, custom_message } = req.body;
    const database = db.get();
    
    // check if exists
    const existing = database.prepare("SELECT id FROM blocked_rules WHERE type = ? AND value = ?").get(type, value);
    if (existing) {
      database.prepare("UPDATE blocked_rules SET action = ?, limit_minutes = ?, start_time = ?, end_time = ?, days_of_week = ?, custom_message = ? WHERE id = ?")
              .run(action, limit_minutes || null, start_time || null, end_time || null, days_of_week ? JSON.stringify(days_of_week) : null, custom_message || null, existing.id);
    } else {
      database.prepare("INSERT INTO blocked_rules (user_id, type, value, action, limit_minutes, start_time, end_time, days_of_week, custom_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
              .run(req.authUserId, type, value, action, limit_minutes || null, start_time || null, end_time || null, days_of_week ? JSON.stringify(days_of_week) : null, custom_message || null);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/rule/:id', (req, res) => {
  try {
    const database = db.get();
    database.prepare("DELETE FROM blocked_rules WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Curfew endpoints
router.post('/curfew', (req, res) => {
  try {
    const { start_time, end_time, days_of_week, strict_mode } = req.body;
    const database = db.get();
    database.prepare("INSERT INTO curfews (user_id, start_time, end_time, days_of_week, strict_mode) VALUES (?, ?, ?, ?, ?)")
            .run(req.authUserId, start_time, end_time, JSON.stringify(days_of_week), strict_mode ? 1 : 0);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/curfew/:id', (req, res) => {
  try {
    const database = db.get();
    database.prepare("DELETE FROM curfews WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
