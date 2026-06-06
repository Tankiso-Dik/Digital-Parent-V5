// blocker.js - Runs at document_start

/**
 * Single Truth Function for Rule Evaluation
 * @param {string} currentDomain 
 * @param {object} payload 
 * @returns {object|null} The block message and title if blocked, or null if allowed.
 */
function shouldBlock(currentDomain, payload, usageObj) {
  const usage = usageObj && usageObj.usage ? usageObj.usage : {};
  if (!payload || !payload.rules) return null; // Fallback safety: ALLOW

  // 1. Curfew Check (Highest Priority)
  if (payload.curfews && payload.curfews.length > 0) {
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay();
    const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    
    for (const c of payload.curfews) {
      if (c.days.includes(currentDay)) {
        if (currentTimeStr >= c.start_time || currentTimeStr < c.end_time) {
          if (c.strict_mode) {
            return {
              title: 'Curfew Active',
              message: c.message_override || payload.messages?.curfew_default || 'Device is locked for the night.'
            };
          }
        }
      }
    }
  }

  // 2. Domain Exact Match
  if (payload.rules.domains && payload.rules.domains[currentDomain]) {
    const rule = payload.rules.domains[currentDomain];
    if (rule.action === 'allow') return null; // whitelist bypass
    if (rule.action === 'block' || (rule.action === 'limit' && usage[currentDomain] >= rule.limit_mins)) {
      return {
        title: 'Website Blocked',
        message: payload.messages?.domain_default || 'This specific website has been blocked.'
      };
    }
  }

  // 3. Wildcard Match
  if (payload.rules.wildcards) {
    for (const w of payload.rules.wildcards) {
      const regexStr = '^' + w.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      const regex = new RegExp(regexStr);
      if (regex.test(currentDomain)) {
        if (w.action === 'allow') return null;
        if (w.action === 'block' || (w.action === 'limit' && usage[currentDomain] >= w.limit_mins)) {
          return {
            title: 'Website Blocked',
            message: payload.messages?.domain_default || 'This specific website has been blocked.'
          };
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
      if (rule.action === 'block' || (rule.action === 'limit' && usage[currentDomain] >= rule.limit_mins)) {
        return {
          title: 'Category Restricted',
          message: payload.messages?.category_default || 'This app category is restricted right now.'
        };
      }
    }
  }

  // Fallback safety: Default is ALLOW
  return null;
}

async function enforceRules() {
  const data = await chrome.storage.local.get(['rules_payload', 'daily_usage']);
  const payload = data.rules_payload;
  
  const blockData = shouldBlock(window.location.hostname, payload, data.daily_usage);
  if (blockData) {
    showOverlayBlocker(blockData.title, blockData.message);
  }
}

function showOverlayBlocker(title, message) {
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
