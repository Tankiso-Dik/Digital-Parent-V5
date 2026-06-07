// blocker.js - Runs at document_start
(function() {

function checkSchedule(rule) {
  if (!rule.start_time || !rule.end_time || !rule.days) return true; // No schedule, always active
  const now = new Date();
  const currentDay = now.getDay() === 0 ? 7 : now.getDay();
  if (!rule.days.includes(currentDay)) return false;
  const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  if (rule.start_time < rule.end_time) {
    return (currentTimeStr >= rule.start_time && currentTimeStr < rule.end_time);
  } else {
    return (currentTimeStr >= rule.start_time || currentTimeStr < rule.end_time);
  }
}

function buildBlockResponse(title, baseMessage, rule) {
  let extraHtml = '';
  
  if (rule && rule.start_time && rule.end_time) {
    const now = new Date();
    const endParts = rule.end_time.split(':');
    let endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(endParts[0], 10), parseInt(endParts[1], 10), 0).getTime();
    if (endMs < now.getTime()) endMs += 24 * 60 * 60 * 1000;
    
    const diffMins = Math.ceil((endMs - now.getTime()) / 60000);
    let remStr = diffMins > 60 ? `${Math.floor(diffMins/60)}h ${diffMins%60}m` : `${diffMins}m`;
    
    extraHtml = `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
      <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.5); margin-bottom: 4px;">Time Remaining</div>
      <div style="font-size: 20px; font-weight: bold; color: white;">${remStr}</div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px;">Unlocks at ${rule.end_time}</div>
    </div>`;
  } else if (rule && rule.action === 'limit') {
    extraHtml = `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
      <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.5); margin-bottom: 4px;">Time Remaining</div>
      <div style="font-size: 20px; font-weight: bold; color: #FF3B30;">0m</div>
      <div style="font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px;">Daily limit of ${rule.limit_mins}m reached.</div>
    </div>`;
  }

  return {
    title: title,
    message: baseMessage,
    extraHtml: extraHtml
  };
}

/**
 * Single Truth Function for Rule Evaluation
 * @param {string} currentDomain 
 * @param {object} payload 
 * @returns {object|null} The block message and title if blocked, or null if allowed.
 */
function shouldBlock(currentDomain, payload, usageObj) {
  const usage = usageObj && usageObj.usage ? usageObj.usage : {};
  if (!payload || !payload.rules) return null; // Fallback safety: ALLOW

  // 0. Safety override: Never block the local dashboard
  if (currentDomain === 'localhost' || currentDomain === '127.0.0.1') {
    return null;
  }

  // 1. Curfew Check (Highest Priority)
  if (payload.curfews && payload.curfews.length > 0) {
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay();
    const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    
    for (const c of payload.curfews) {
      if (c.days.includes(currentDay)) {
        let isCurfewActive = false;
        if (c.start_time < c.end_time) {
          isCurfewActive = (currentTimeStr >= c.start_time && currentTimeStr < c.end_time);
        } else {
          isCurfewActive = (currentTimeStr >= c.start_time || currentTimeStr < c.end_time);
        }
        if (isCurfewActive && c.strict_mode) {
          return buildBlockResponse('Curfew Active', c.message_override || payload.messages?.curfew_default || 'Device is locked for the night.', c);
        }
      }
    }
  }

  // 2. Domain Match (Allows subdomains like www.facebook.com for rule facebook.com)
  if (payload.rules.domains) {
    for (const d of Object.keys(payload.rules.domains)) {
      if (currentDomain === d || currentDomain.endsWith('.' + d)) {
        const rule = payload.rules.domains[d];
        if (rule.action === 'allow') return null; // whitelist bypass
        if (!checkSchedule(rule)) continue;
        if (rule.action === 'block' || (rule.action === 'limit' && usage[d] >= rule.limit_mins)) {
          return buildBlockResponse('Website Blocked', rule.message || payload.messages?.domain_default || 'This specific website has been blocked.', rule);
        }
      }
    }
  }

  // 3. Wildcard Match
  if (payload.rules.wildcards) {
    for (const w of payload.rules.wildcards) {
      const regexStr = '^' + w.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      const regex = new RegExp(regexStr);
      if (regex.test(currentDomain)) {
        const rule = w;
        if (rule.action === 'allow') return null;
        if (!checkSchedule(rule)) continue;
        if (rule.action === 'block' || (rule.action === 'limit' && usage[rule.pattern] >= rule.limit_mins)) {
          return buildBlockResponse('Website Blocked', rule.message || payload.messages?.domain_default || 'This specific website has been blocked.', rule);
        }
      }
    }
  }

  // 4. Category Match
  if (payload.category_map && payload.category_map[currentDomain]) {
    const category = payload.category_map[currentDomain];
    if (payload.rules.categories && payload.rules.categories[category]) {
      const rule = payload.rules.categories[category];
      if (rule.action === 'allow') return null;
      if (!checkSchedule(rule)) return null;
      if (rule.action === 'block' || (rule.action === 'limit' && usage['cat_' + category] >= rule.limit_mins)) {
        return buildBlockResponse('Category Restricted', rule.message || payload.messages?.category_default || 'This app category is restricted right now.', rule);
      }
    }
  }

  // Fallback safety: Default is ALLOW
  return null;
}

function getActiveLimitTracker(currentDomain, payload, usageObj) {
  const usage = usageObj && usageObj.usage ? usageObj.usage : {};
  if (!payload || !payload.rules) return null;

  if (payload.rules.domains) {
    for (const d of Object.keys(payload.rules.domains)) {
      if (currentDomain === d || currentDomain.endsWith('.' + d)) {
        const rule = payload.rules.domains[d];
        if (rule.action === 'limit' && checkSchedule(rule)) {
          return { limit: rule.limit_mins, current: usage[d] || 0 };
        }
      }
    }
  }

  if (payload.rules.wildcards) {
    for (const w of payload.rules.wildcards) {
      const regexStr = '^' + w.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      if (new RegExp(regexStr).test(currentDomain)) {
        const rule = w;
        if (rule.action === 'limit' && checkSchedule(rule)) {
          return { limit: rule.limit_mins, current: usage[w.pattern] || 0 };
        }
      }
    }
  }

  if (payload.category_map && payload.category_map[currentDomain]) {
    const category = payload.category_map[currentDomain];
    if (payload.rules.categories && payload.rules.categories[category]) {
      const rule = payload.rules.categories[category];
      if (rule.action === 'limit' && checkSchedule(rule)) {
        return { limit: rule.limit_mins, current: usage['cat_' + category] || 0 };
      }
    }
  }

  return null;
}

function updateTrackerUI(trackerData) {
  let ui = document.getElementById('oikos-tracker-ui');
  if (!trackerData) {
    if (ui) ui.remove();
    return;
  }
  
  if (!ui) {
    ui = document.createElement('div');
    ui.id = 'oikos-tracker-ui';
    ui.style.cssText = `
      position: fixed !important; bottom: 20px !important; right: 20px !important; z-index: 2147483645 !important;
      background: rgba(0,0,0,0.8) !important; color: white !important; padding: 10px 20px !important; border-radius: 30px !important;
      font-family: system-ui, -apple-system, sans-serif !important; font-size: 14px !important; 
      backdrop-filter: blur(10px) !important; border: 1px solid rgba(255,255,255,0.1) !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important; pointer-events: none !important;
      display: flex !important; align-items: center !important; gap: 8px !important; font-weight: 500 !important;
    `;
    if (document.body) document.body.appendChild(ui);
    else document.documentElement.appendChild(ui);
  }
  
  const remMinsFloat = Math.max(0, trackerData.limit - trackerData.current);
  const wholeMins = Math.floor(remMinsFloat);
  const secs = Math.round((remMinsFloat - wholeMins) * 60);
  const color = remMinsFloat < 1 ? '#FF3B30' : (remMinsFloat < 5 ? '#FF9500' : '#34C759');
  
  const timeStr = secs > 0 ? (wholeMins > 0 ? `${wholeMins}m ${secs}s` : `${secs}s`) : `${wholeMins}m`;
  
  ui.innerHTML = `
    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; box-shadow: 0 0 8px ${color};"></div>
    <span>Time Left: <strong style="color: ${color}; margin-left: 4px;">${timeStr}</strong></span>
  `;
}

async function enforceRules() {
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    document.documentElement.setAttribute('data-oikos-extension', 'active');
    
    if (!window.oikosBridgeAdded) {
      window.oikosBridgeAdded = true;
      window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'OIKOS_SYNC_NOW') {
          chrome.runtime.sendMessage({ action: 'FORCE_SYNC' }, (response) => {
            window.postMessage({ type: 'OIKOS_SYNC_ACK', success: response && response.success }, '*');
          });
        }
      });
    }
    return;
  }

  const roleResponse = await chrome.runtime.sendMessage({ action: 'GET_ACTIVE_ROLE' }).catch(e => null);
  const active_role = roleResponse ? roleResponse.role : 'child';
  
  if (active_role !== 'child') {
    return;
  }
  
  const data = await chrome.storage.local.get(['rules_payload', 'daily_usage']);
  const payload = data.rules_payload;
  
  const blockData = shouldBlock(window.location.hostname, payload, data.daily_usage);
  if (blockData) {
    showOverlayBlocker(blockData.title, blockData.message, blockData.extraHtml);
  }
}

function showOverlayBlocker(title, message, extraHtml = '') {
  // Prevent scrolling on the underlying page
  document.documentElement.style.overflow = 'hidden';
  
  // Create persistent full-screen overlay
  const overlay = document.createElement('div');
  overlay.id = 'oikos-block-overlay';
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: linear-gradient(135deg, #1c1c1e, #000000) !important;
    color: white !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 2147483647 !important;
    text-align: center !important;
    font-family: system-ui, -apple-system, sans-serif !important;
  `;

  overlay.innerHTML = `
    <div style="max-width: 500px; padding: 40px; background: rgba(255, 255, 255, 0.05); border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 40px rgba(0,0,0,0.5); backdrop-filter: blur(10px);">
      <div style="font-size: 64px; margin-bottom: 20px; color: #FF3B30;">🔒</div>
      <h1 style="margin: 0 0 10px 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">${title}</h1>
      <p style="font-size: 16px; color: #A1A1A6; line-height: 1.6; margin: 0;">${message}</p>
      <div id="oikos-extra-html">${extraHtml}</div>
    </div>
  `;

  // Attach immediately, and use MutationObserver to ensure it isn't removed by SPAs
  if (document.body) {
    document.body.appendChild(overlay);
  } else {
    document.documentElement.appendChild(overlay);
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById('oikos-block-overlay')) {
      if (document.body) document.body.appendChild(overlay);
      else document.documentElement.appendChild(overlay);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

enforceRules();

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.rules_payload) {
    const payload = changes.rules_payload.newValue;
    chrome.storage.local.get(['daily_usage', 'active_role'], (data) => {
      const active_role = data.active_role || 'child';
      if (active_role !== 'child') return;
      
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') return;

      const blockData = shouldBlock(hostname, payload, data.daily_usage);
      const overlay = document.getElementById('oikos-block-overlay');
      
      if (!blockData && overlay) {
        overlay.remove();
        document.documentElement.style.overflow = '';
      } else if (blockData && !overlay) {
        showOverlayBlocker(blockData.title, blockData.message, blockData.extraHtml);
      } else if (blockData && overlay) {
        const msgEl = overlay.querySelector('p');
        if (msgEl && msgEl.innerText !== blockData.message) {
          msgEl.innerText = blockData.message;
        }
        const extraContainer = overlay.querySelector('#oikos-extra-html');
        if (extraContainer) {
          extraContainer.innerHTML = blockData.extraHtml || '';
        }
      }
      
      if (!blockData) {
        const trackerData = getActiveLimitTracker(hostname, data.rules_payload, data.daily_usage);
        updateTrackerUI(trackerData);
      } else {
        updateTrackerUI(null);
      }
    });
  }
});

// Heartbeat to automatically enforce/teardown time-based rules
setInterval(() => {
  chrome.storage.local.get(['rules_payload', 'daily_usage', 'active_role'], (data) => {
    const active_role = data.active_role || 'child';
    if (active_role !== 'child' || !data.rules_payload) return;
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return;

    const blockData = shouldBlock(hostname, data.rules_payload, data.daily_usage);
    const overlay = document.getElementById('oikos-block-overlay');
    
    if (!blockData && overlay) {
      overlay.remove();
      document.documentElement.style.overflow = '';
    } else if (blockData && !overlay) {
      showOverlayBlocker(blockData.title, blockData.message, blockData.extraHtml);
    } else if (blockData && overlay) {
      const msgEl = overlay.querySelector('p');
      if (msgEl && msgEl.innerText !== blockData.message) {
        msgEl.innerText = blockData.message;
      }
      const extraContainer = overlay.querySelector('#oikos-extra-html');
      if (extraContainer) {
        extraContainer.innerHTML = blockData.extraHtml || '';
      }
    }
    
    if (!blockData) {
      const trackerData = getActiveLimitTracker(hostname, data.rules_payload, data.daily_usage);
      updateTrackerUI(trackerData);
    } else {
      updateTrackerUI(null);
    }
  });
}, 1000);

})();
