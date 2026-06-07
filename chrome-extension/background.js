const API_URL = 'http://localhost:3000/api/v1/app-usage/logs';
const SYNC_URL = 'http://localhost:3000/api/v1/rules/sync';

async function fetchRules() {
  try {
    const res = await fetch(SYNC_URL, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error('Network error or non-200 OK');
    const payload = await res.json();
    if (!payload.error) {
      const data = await chrome.storage.local.get(['rules_payload']);
      const currentPayload = data.rules_payload;
      if (!currentPayload || !currentPayload.meta || payload.meta.last_updated !== currentPayload.meta.last_updated) {
        console.log('[Oikos] Rules updated to version:', payload.meta.last_updated);
        await chrome.storage.local.set({ rules_payload: payload, extension_connected: true });
      }
      return { success: true };
    }
    return { success: false, error: payload.error };
  } catch (e) {
    console.error('Failed to fetch rules:', e);
    chrome.storage.local.set({ extension_connected: false });
    return { success: false, error: e.message };
  }
}

fetchRules();
chrome.alarms.create('syncRules', { periodInMinutes: 1 });
setInterval(updateDailyUsage, 1000);

async function updateDailyUsage() {
  const data = await chrome.storage.local.get(['activeSession', 'daily_usage', 'rules_payload']);
  const session = data.activeSession;
  if (!session || !session.domain || !session.lastTickTime) return;
  
  const now = Date.now();
  const deltaMs = now - session.lastTickTime;
  if (deltaMs <= 0) return;
  
  // Advance tick time
  session.lastTickTime = now;
  await chrome.storage.local.set({ activeSession: session });
  
  const nowObj = new Date();
  const today = nowObj.getFullYear() + '-' + String(nowObj.getMonth() + 1).padStart(2, '0') + '-' + String(nowObj.getDate()).padStart(2, '0');
  let daily = data.daily_usage || { date: today, usage: {} };
  if (daily.date !== today) daily = { date: today, usage: {} };
  
  const deltaMins = deltaMs / 60000;
  const domain = session.domain;
  daily.usage[domain] = (daily.usage[domain] || 0) + deltaMins;
  
  if (data.rules_payload && data.rules_payload.rules) {
    if (data.rules_payload.rules.domains) {
      for (const d of Object.keys(data.rules_payload.rules.domains)) {
        if (domain === d || domain.endsWith('.' + d)) {
          if (domain !== d) daily.usage[d] = (daily.usage[d] || 0) + deltaMins;
        }
      }
    }
    if (data.rules_payload.rules.wildcards) {
      for (const w of data.rules_payload.rules.wildcards) {
        const regexStr = '^' + w.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
        if (new RegExp(regexStr).test(domain)) {
          daily.usage[w.pattern] = (daily.usage[w.pattern] || 0) + deltaMins;
        }
      }
    }
  }
  
  let category = null;
  if (data.rules_payload && data.rules_payload.category_map && data.rules_payload.category_map[domain]) {
    category = data.rules_payload.category_map[domain];
    daily.usage['cat_' + category] = (daily.usage['cat_' + category] || 0) + deltaMins;
  }
  
  await chrome.storage.local.set({ daily_usage: daily });
  checkLimits(domain, category, daily.usage, data.rules_payload);
}

function checkSchedule(rule) {
  if (!rule.start_time || !rule.end_time || !rule.days) return true;
  const now = new Date();
  const currentDay = now.getDay() === 0 ? 7 : now.getDay();
  const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  if (rule.start_time < rule.end_time) {
    if (!rule.days.includes(currentDay)) return false;
    return (currentTimeStr >= rule.start_time && currentTimeStr < rule.end_time);
  } else {
    // Overnight rule
    if (currentTimeStr >= rule.start_time) {
      return rule.days.includes(currentDay);
    } else if (currentTimeStr < rule.end_time) {
      const yesterday = currentDay === 1 ? 7 : currentDay - 1;
      return rule.days.includes(yesterday);
    }
    return false;
  }
}

function checkLimits(domain, category, usage, payload) {
  if (!payload || !payload.rules) return;
  let block = false;
  
  if (payload.rules.domains) {
    for (const d of Object.keys(payload.rules.domains)) {
      if (domain === d || domain.endsWith('.' + d)) {
        const r = payload.rules.domains[d];
        if (r.action !== 'allow' && checkSchedule(r)) {
          if (r.action === 'block' || (r.action === 'limit' && usage[d] >= r.limit_mins)) block = true;
        }
      }
    }
  }
  
  if (payload.rules.wildcards) {
    for (const w of payload.rules.wildcards) {
      const regexStr = '^' + w.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      if (new RegExp(regexStr).test(domain)) {
        if (w.action !== 'allow' && checkSchedule(w)) {
          if (w.action === 'block' || (w.action === 'limit' && usage[w.pattern] >= w.limit_mins)) block = true;
        }
      }
    }
  }

  if (category && payload.rules.categories && payload.rules.categories[category]) {
    const r = payload.rules.categories[category];
    if (r.action !== 'allow' && checkSchedule(r)) {
      if (r.action === 'block' || (r.action === 'limit' && usage['cat_' + category] >= r.limit_mins)) block = true;
    }
  }
  
  if (payload.curfews && payload.curfews.length > 0) {
    for (const c of payload.curfews) {
      if (c.strict_mode && checkSchedule(c)) {
        block = true;
      }
    }
  }

  if (block) {
    // The content script (blocker.js) runs its own 1000ms loop to show the overlay.
    // Injecting here creates execution context errors.
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncRules') {
    fetchRules();
    updateDailyUsage();
    chrome.storage.local.get(['failed_logs']).then(data => {
      if (data.failed_logs && data.failed_logs.length > 0) {
        sendLog(null, null, null, data.failed_logs);
      }
    });
  }
});

let globalActiveRole = null;
let lastRoleCheckTime = 0;

async function getActiveRole(force = false) {
  if (force || Date.now() - lastRoleCheckTime > 5000) {
    try {
      const res = await fetch('http://localhost:3000/api/v1/app-usage/active-role', { credentials: 'include' });
      if (!res.ok) throw new Error('Role fetch failed');
      const data = await res.json();
      globalActiveRole = data.active_role;
      await chrome.storage.local.set({ active_role: globalActiveRole, extension_connected: true });
      lastRoleCheckTime = Date.now();
    } catch (err) {
      console.error('Failed to fetch role:', err);
      chrome.storage.local.set({ extension_connected: false });
      const cached = await chrome.storage.local.get(['active_role']);
      globalActiveRole = cached.active_role || 'child'; 
    }
  }
  return globalActiveRole || 'child';
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FORCE_SYNC') {
    fetchRules().then(result => sendResponse(result));
    return true;
  } else if (request.action === 'GET_ACTIVE_ROLE') {
    getActiveRole().then(role => sendResponse({ role }));
    return true;
  }
});

async function sendLog(domain, startTime, endTime, failedLogs = []) {
  let logsToSend = [...failedLogs];
  if (domain && startTime && endTime) {
    const duration = Math.floor((endTime - startTime) / 1000);
    if (duration > 0) {
      logsToSend.push({
        app_identifier: domain,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        duration
      });
    }
  }

  if (logsToSend.length === 0) return;
  const newFailedLogs = [];

  for (const log of logsToSend) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
      const data = await res.json();
      if (!data.ignored) console.log('Logged usage:', log.app_identifier, log.duration, 'sec');
    } catch (err) {
      console.error('Failed to log usage, queueing:', err);
      newFailedLogs.push(log);
    }
  }

  if (newFailedLogs.length > 0) {
    await chrome.storage.local.set({ failed_logs: newFailedLogs });
  } else {
    await chrome.storage.local.remove(['failed_logs']);
  }
}

const finalizedSessionsSet = new Set();
let eventQueue = Promise.resolve();

// Finalizes the current session, strictly deduplicated.
function finalizeSession(endTime) {
  eventQueue = eventQueue.then(async () => {
    const data = await chrome.storage.local.get(['activeSession', 'failed_logs']);
    const session = data.activeSession;
    
    if (!session || !session.sessionId) return;
    if (finalizedSessionsSet.has(session.sessionId)) return; // Idempotency lock
    
    finalizedSessionsSet.add(session.sessionId);
    if (finalizedSessionsSet.size > 100) finalizedSessionsSet.delete(finalizedSessionsSet.keys().next().value);

    const durationMs = endTime - session.sessionStart;
    if (durationMs > 0 && durationMs < 12 * 60 * 60 * 1000) {
      await sendLog(session.domain, session.sessionStart, endTime, data.failed_logs || []);
    }
    await chrome.storage.local.remove(['activeSession']);
  }).catch(() => {});
}

// Starts a new session atomically.
async function startSession(domain, startTime) {
  const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const activeSession = {
    sessionId,
    domain,
    sessionStart: startTime,
    lastTickTime: startTime,
    isBlocked: false
  };
  await chrome.storage.local.set({ activeSession });
}

// Handles switching to a new tab/domain via queue.
function handleTabChange(tab) {
  eventQueue = eventQueue.then(async () => {
    const role = await getActiveRole();
    if (role !== 'child') {
      await chrome.storage.local.remove(['activeSession']);
      return;
    }

    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
      const data = await chrome.storage.local.get(['activeSession']);
      if (data.activeSession) {
        // inline finalize to maintain queue order context
        const session = data.activeSession;
        if (!finalizedSessionsSet.has(session.sessionId)) {
           finalizedSessionsSet.add(session.sessionId);
           const durationMs = Date.now() - session.sessionStart;
           if (durationMs > 0 && durationMs < 12 * 60 * 60 * 1000) {
             await sendLog(session.domain, session.sessionStart, Date.now(), (await chrome.storage.local.get('failed_logs')).failed_logs || []);
           }
           await chrome.storage.local.remove(['activeSession']);
        }
      }
      return;
    }

    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      const now = Date.now();

      const data = await chrome.storage.local.get(['activeSession']);
      const session = data.activeSession;
      
      if (!session || session.domain !== domain) {
        if (session && !finalizedSessionsSet.has(session.sessionId)) {
           finalizedSessionsSet.add(session.sessionId);
           const durationMs = now - session.sessionStart;
           if (durationMs > 0 && durationMs < 12 * 60 * 60 * 1000) {
             await sendLog(session.domain, session.sessionStart, now, (await chrome.storage.local.get('failed_logs')).failed_logs || []);
           }
           await chrome.storage.local.remove(['activeSession']);
        }
        await startSession(domain, now);
      }
    } catch (e) {
       const data = await chrome.storage.local.get(['activeSession']);
       if (data.activeSession) {
           const session = data.activeSession;
           if (!finalizedSessionsSet.has(session.sessionId)) {
              finalizedSessionsSet.add(session.sessionId);
              await chrome.storage.local.remove(['activeSession']);
           }
       }
    }
  }).catch(() => {});
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    handleTabChange(tab);
  } catch (err) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    handleTabChange(tab);
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (removeInfo.isWindowClosing) return; 
  finalizeSession(Date.now());
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    finalizeSession(Date.now());
  } else {
    chrome.tabs.query({ active: true, windowId: windowId }).then(tabs => {
      if (tabs.length > 0) handleTabChange(tabs[0]);
    }).catch(()=>{});
  }
});

chrome.idle.onStateChanged.addListener((newState) => {
  if (newState === 'idle' || newState === 'locked') {
    finalizeSession(Date.now());
  } else if (newState === 'active') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs.length > 0) handleTabChange(tabs[0]);
    }).catch(()=>{});
  }
});

// Capture service worker suspension explicitly if possible (optional safeguard)
chrome.runtime.onSuspend.addListener(() => {
  // We don't finalize session on suspend! We want tracking to CONTINUE across sleep.
  // The storage handles persistence!
});
