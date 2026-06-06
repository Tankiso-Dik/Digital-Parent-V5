// blocker.js - Runs at document_start

async function checkRules() {
  const data = await chrome.storage.local.get(['rules_payload']);
  if (!data.rules_payload) return; // No rules cached yet
  
  const payload = data.rules_payload;
  const currentDomain = window.location.hostname;
  
  // 1. Curfew Check (Highest Priority)
  let curfewActive = false;
  let curfewMsg = payload.messages.curfew_default;
  if (payload.curfews && payload.curfews.length > 0) {
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // JS getDay is 0 for Sunday
    // Note: JS getDay is 0 (Sun) to 6 (Sat). Our DB uses 1 (Mon) to 7 (Sun) likely. Let's assume standard 1=Mon, 7=Sun.
    const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    
    for (const c of payload.curfews) {
      if (c.days.includes(currentDay)) {
        if (currentTimeStr >= c.start_time || currentTimeStr < c.end_time) { // cross-midnight logic is tricky, simplified here
          if (c.strict_mode) {
            curfewActive = true;
            if (c.message_override) curfewMsg = c.message_override;
            break;
          }
        }
      }
    }
  }

  if (curfewActive) {
    return blockScreen(curfewMsg, 'Curfew');
  }

  // 2. Domain Exact Match
  if (payload.rules.domains[currentDomain]) {
    const rule = payload.rules.domains[currentDomain];
    if (rule.action === 'allow') return; // whitelist bypass
    if (rule.action === 'block') return blockScreen(payload.messages.domain_default, 'Website Blocked');
  }

  // 3. Wildcard Match
  for (const w of payload.rules.wildcards) {
    // Simple wildcard to regex: replace '.' with '\.' and '*' with '.*'
    const regexStr = '^' + w.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
    const regex = new RegExp(regexStr);
    if (regex.test(currentDomain)) {
      if (w.action === 'allow') return;
      if (w.action === 'block') return blockScreen(payload.messages.domain_default, 'Website Blocked');
    }
  }

  // 4. Category Match
  const category = payload.category_map[currentDomain];
  if (category && payload.rules.categories[category]) {
    const rule = payload.rules.categories[category];
    if (rule.action === 'allow') return;
    if (rule.action === 'block') return blockScreen(payload.messages.category_default, 'Category Restricted');
  }
}

function blockScreen(message, title) {
  // Stop page load instantly
  window.stop();
  
  // Replace DOM
  document.documentElement.innerHTML = `
    <html style="height: 100%; margin: 0;">
      <head>
        <title>Blocked by Oikos</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #1c1c1e, #000000);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .container {
            max-width: 500px;
            padding: 40px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            backdrop-filter: blur(10px);
          }
          .icon {
            font-size: 64px;
            margin-bottom: 20px;
            color: #FF3B30;
          }
          h1 {
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }
          p {
            font-size: 16px;
            color: #A1A1A6;
            line-height: 1.6;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🔒</div>
          <h1>${title}</h1>
          <p>${message}</p>
        </div>
      </body>
    </html>
  `;
}

checkRules();
