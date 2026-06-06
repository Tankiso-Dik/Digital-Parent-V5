const API_URL = 'http://localhost:4000/api/v1/app-usage/logs';
const SYNC_URL = 'http://localhost:4000/api/v1/rules/sync';

async function fetchRules() {
  try {
    const res = await fetch(SYNC_URL, { credentials: 'include' });
    if (!res.ok) return;
    const payload = await res.json();
    if (!payload.error) {
      await chrome.storage.local.set({ rules_payload: payload });
    }
  } catch (e) {}
}

// Initial fetch & setup alarm
fetchRules();
chrome.alarms.create('syncRules', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncRules') fetchRules();
});

let globalActiveRole = null;
let lastRoleCheckTime = 0;

async function getActiveRole() {
  // Only fetch from backend if our cached role is older than 30 seconds
  if (Date.now() - lastRoleCheckTime > 30000) {
    try {
      const res = await fetch('http://localhost:4000/api/v1/app-usage/active-role', { credentials: 'include' });
      const data = await res.json();
      globalActiveRole = data.active_role;
      lastRoleCheckTime = Date.now();
    } catch (err) {
      globalActiveRole = null;
    }
  }
  return globalActiveRole;
}

async function sendLog(domain, startTime, endTime) {
  if (!domain || !startTime || !endTime) return;
  const duration = Math.floor((endTime - startTime) / 1000); // seconds
  if (duration <= 0) return;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_identifier: domain,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        duration
      })
    });
    const data = await res.json();
    if (data.ignored) {
      console.log('Ignored: active role not child');
    } else {
      console.log('Logged usage:', domain, duration, 'sec');
    }
  } catch (err) {
    console.error('Failed to log usage:', err);
  }
}

// Finalizes the current session, sends it to backend, and clears storage.
async function finalizeSession(endTime) {
  const data = await chrome.storage.local.get(['activeDomain', 'startTime']);
  if (data.activeDomain && data.startTime) {
    await sendLog(data.activeDomain, data.startTime, endTime);
  }
  await chrome.storage.local.remove(['activeDomain', 'startTime']);
}

// Starts a new session in storage.
async function startSession(domain, startTime) {
  await chrome.storage.local.set({ activeDomain: domain, startTime: startTime });
}

// Handles switching to a new tab/domain.
async function handleTabChange(tab) {
  const role = await getActiveRole();
  if (role !== 'child') {
    await chrome.storage.local.remove(['activeDomain', 'startTime']);
    return;
  }

  // If the new tab is invalid, finalize current session and stop tracking.
  if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
    await finalizeSession(Date.now());
    return;
  }

  try {
    const url = new URL(tab.url);
    const domain = url.hostname;
    const now = Date.now();

    const data = await chrome.storage.local.get(['activeDomain']);
    
    // If domain changed, finalize old and start new.
    if (data.activeDomain !== domain) {
      await finalizeSession(now);
      await startSession(domain, now);
    }
  } catch (e) {
    // URL parsing failed, likely an empty/invalid tab. Finalize tracking.
    await finalizeSession(Date.now());
  }
}

// Event Listeners

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

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  if (removeInfo.isWindowClosing) return; // Handled by windows.onRemoved
  // If the tab closed was the active one, we should finalize. 
  // However, onActivated usually fires right after or before.
  // To be safe, we query the new active tab.
  setTimeout(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        handleTabChange(tabs[0]);
      } else {
        finalizeSession(Date.now());
      }
    } catch(e) {}
  }, 100);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Chrome lost focus
    await finalizeSession(Date.now());
  } else {
    // Chrome gained focus
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
      if (tabs.length > 0) handleTabChange(tabs[0]);
    } catch(e) {}
  }
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    await finalizeSession(Date.now());
  } else if (newState === 'active') {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) handleTabChange(tabs[0]);
    } catch(e) {}
  }
});

// Capture service worker suspension explicitly if possible (optional safeguard)
chrome.runtime.onSuspend.addListener(() => {
  // We don't finalize session on suspend! We want tracking to CONTINUE across sleep.
  // The storage handles persistence!
});
