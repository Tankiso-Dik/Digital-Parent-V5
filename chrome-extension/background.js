const API_URL = 'http://localhost:4000/api/v1/app-usage/logs';

let activeTabDomain = null;
let activeTabStartTime = null;

async function sendLog(domain, startTime, endTime) {
  if (!domain) return;
  const duration = Math.floor((endTime - startTime) / 1000); // seconds
  if (duration < 5) return; // Ignore < 5s
  
  // Categorization is mocked for prototype
  let category_id = 6; // Other
  if (domain.includes('youtube') || domain.includes('tiktok') || domain.includes('instagram')) category_id = 1; // Social
  if (domain.includes('roblox') || domain.includes('minecraft')) category_id = 2; // Gaming
  if (domain.includes('khanacademy') || domain.includes('wikipedia')) category_id = 3; // Education
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_identifier: domain,
        app_name: domain.replace('www.', ''),
        category_id,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        duration
      })
    });
    const data = await res.json();
    if (data.ignored) {
      console.log('Ignored: not logged in as child');
    } else {
      console.log('Logged usage:', domain, duration, 'sec');
    }
  } catch (err) {
    console.error('Failed to log usage:', err);
  }
}

let globalActiveRole = null;

async function checkActiveRole() {
  try {
    const res = await fetch('http://localhost:4000/api/v1/app-usage/active-role', { credentials: 'include' });
    const data = await res.json();
    globalActiveRole = data.active_role;
  } catch (err) {
    globalActiveRole = null;
  }
}

// Poll every 30 seconds
setInterval(checkActiveRole, 30000);
checkActiveRole();

function handleTabChange(tab) {
  if (globalActiveRole !== 'child') {
    if (activeTabDomain) {
      activeTabDomain = null; // silently drop tracking
    }
    return;
  }

  if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
    if (activeTabDomain) {
      sendLog(activeTabDomain, activeTabStartTime, Date.now());
      activeTabDomain = null;
    }
    return;
  }
  
  try {
    const url = new URL(tab.url);
    const domain = url.hostname;
    
    if (domain !== activeTabDomain) {
      if (activeTabDomain) {
        sendLog(activeTabDomain, activeTabStartTime, Date.now());
      }
      activeTabDomain = domain;
      activeTabStartTime = Date.now();
    }
  } catch (e) {}
}

chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, handleTabChange);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    handleTabChange(tab);
  }
});

chrome.idle.onStateChanged.addListener(newState => {
  if (newState === 'idle' || newState === 'locked') {
    if (activeTabDomain) {
      sendLog(activeTabDomain, activeTabStartTime, Date.now());
      activeTabDomain = null;
    }
  } else if (newState === 'active') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs.length > 0) handleTabChange(tabs[0]);
    });
  }
});
