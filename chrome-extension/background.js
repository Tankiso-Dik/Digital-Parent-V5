const API_URL = 'http://localhost:3000/api/v1/app-usage/logs';
const SYNC_URL = 'http://localhost:3000/api/v1/rules/sync';

async function fetchRules() {
  try {
    const res = await fetch(SYNC_URL, { credentials: 'include' });
    if (!res.ok) return;
    const payload = await res.json();
    if (!payload.error) {
      const data = await chrome.storage.local.get(['rules_payload']);
      const currentPayload = data.rules_payload;
      if (!currentPayload || !currentPayload.meta || payload.meta.last_updated !== currentPayload.meta.last_updated) {
        console.log('[Oikos] Rules updated to version:', payload.meta.last_updated);
        await chrome.storage.local.set({ rules_payload: payload });
      }
    }
  } catch (e) {}
}

fetchRules();
chrome.alarms.create('syncRules', { periodInMinutes: 1 });

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
  
  const today = new Date().toISOString().split('T')[0];
  let daily = data.daily_usage || { date: today, usage: {} };
  if (daily.date !== today) daily = { date: today, usage: {} };
  
  const deltaMins = deltaMs / 60000;
  const domain = session.domain;
  daily.usage[domain] = (daily.usage[domain] || 0) + deltaMins;
  
  let category = null;
  if (data.rules_payload && data.rules_payload.category_map && data.rules_payload.category_map[domain]) {
    category = data.rules_payload.category_map[domain];
    daily.usage['cat_' + category] = (daily.usage['cat_' + category] || 0) + deltaMins;
  }
  
  await chrome.storage.local.set({ daily_usage: daily });
  checkLimits(domain, category, daily.usage, data.rules_payload);
}

function checkLimits(domain, category, usage, payload) {
  if (!payload || !payload.rules) return;
  let block = false;
  
  if (payload.rules.domains && payload.rules.domains[domain] && payload.rules.domains[domain].action === 'limit') {
    if (usage[domain] >= payload.rules.domains[domain].limit_mins) block = true;
  }
  if (category && payload.rules.categories && payload.rules.categories[category] && payload.rules.categories[category].action === 'limit') {
    if (usage['cat_' + category] >= payload.rules.categories[category].limit_mins) block = true;
  }
  
  if (block) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs.length > 0) {
        chrome.scripting.executeScript({ target: {tabId: tabs[0].id}, files: ['blocker.js'] }).catch(e => {});
      }
    });
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

async function getActiveRole() {
  if (Date.now() - lastRoleCheckTime > 30000) {
    try {
      const res = await fetch('http://localhost:3000/api/v1/app-usage/active-role', { credentials: 'include' });
      const data = await res.json();
      globalActiveRole = data.active_role;
      await chrome.storage.local.set({ active_role: globalActiveRole });
      lastRoleCheckTime = Date.now();
    } catch (err) {
      // Safe Role Fallback: Default to cached role or closed
      const cached = await chrome.storage.local.get(['active_role']);
      globalActiveRole = cached.active_role || 'child'; 
    }
  }
  return globalActiveRole || 'child';
}

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
