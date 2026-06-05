import { apiFetch } from '../api.js';
const showToast = (msg, type) => window.oikos?.showToast(msg, type);

function formatTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':');
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  return d.getTime();
}

export async function render(container, { user }) {
  const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);

  const wrapper = document.createElement('div');
  wrapper.className = 'apps-page';
  wrapper.style.cssText = 'max-width: 800px; margin: 0 auto; padding-bottom: 40px;';

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;';
  header.innerHTML = `
    <div>
      <h1 style="font-size: 28px; font-weight: 800; margin: 0; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); -webkit-background-clip: text; color: transparent;">App Launcher</h1>
      <p style="color: var(--text-secondary); margin: 4px 0 0 0;">Manage your screen time responsibly.</p>
    </div>
  `;
  wrapper.appendChild(header);

  // FETCH STATS & POINTS
  let points = 0;
  let totalAppMins = 0;
  let statsHtml = '';
  
  try {
    const statsRes = await apiFetch(`/reports/child/${user.id}`);
    points = statsRes.data?.points || 0;
    
    const appStats = statsRes.data?.apps || [];
    totalAppMins = appStats.reduce((acc, curr) => acc + curr.total_minutes, 0);
    
    statsHtml = appStats.map(a => `
      <div style="display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px;">
        <span style="font-size: 20px; font-weight: bold;">${a.total_minutes}m</span>
        <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">${a.app_type}</span>
      </div>
    `).join('');
  } catch(e) {
    console.error('Failed to load stats', e);
  }

  // Dashboard Overview Card
  const dashCard = document.createElement('div');
  dashCard.style.cssText = `
    background: linear-gradient(135deg, var(--bg-card) 0%, rgba(0,0,0,0.2) 100%);
    border-radius: 20px;
    padding: 24px;
    margin-bottom: 30px;
    border: 1px solid var(--color-border-subtle);
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    backdrop-filter: blur(10px);
  `;
  
  dashCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h3 style="margin:0; font-size: 16px; color: var(--text-secondary);">Today's Screen Time</h3>
        <div style="font-size: 32px; font-weight: 800; color: var(--color-primary);">${totalAppMins} <span style="font-size: 16px; color: var(--text-secondary); font-weight: normal;">minutes</span></div>
      </div>
      <div style="text-align: right; background: linear-gradient(135deg, #FFD700, #FFA500); padding: 12px 20px; border-radius: 16px; color: white; box-shadow: 0 4px 15px rgba(255, 165, 0, 0.3);">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; opacity: 0.9;">Rewards Balance</div>
        <div style="font-size: 24px; font-weight: 800; display: flex; align-items: center; justify-content: flex-end; gap: 6px;"><i data-lucide="star" style="width:20px; height:20px;"></i> ${points}</div>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 12px;">
      ${statsHtml || '<div style="color: var(--text-secondary); font-size: 14px;">No app activity today.</div>'}
    </div>
  `;
  wrapper.appendChild(dashCard);

  // LOCKING LOGIC
  let approvedApps = new Set();
  try {
    const emRes = await apiFetch('/reports/emergency');
    const requests = emRes.data || [];
    const todayStr = formatTodayDate();
    requests.forEach(req => {
      if (req.status === 'approved' && req.created_at.startsWith(todayStr)) {
        approvedApps.add(req.app_type);
      }
    });
  } catch(e) {}

  let isLocked = false;
  let lockReason = '';
  
  try {
    const today = formatTodayDate();
    const res = await apiFetch(`/calendar?from=${today}&to=${today}`);
    const events = res.data || [];
    const now = new Date().getTime();
    
    for (const ev of events) {
      if (ev.category === 'study' || ev.category === 'curfew') {
        const start = parseTime(ev.start_time);
        const end = parseTime(ev.end_time);
        if (ev.all_day || (start && end && now >= start && now <= end)) {
           isLocked = true;
           lockReason = ev.category === 'curfew' ? '🌙 Curfew is active.' : '📚 School/Study time is active.';
           break;
        }
      }
    }
  } catch(e) {}

  if (isLocked) {
    const alert = document.createElement('div');
    alert.style.cssText = `
      background: rgba(255, 59, 48, 0.1);
      border: 1px solid var(--color-danger);
      color: var(--color-danger);
      padding: 16px 20px;
      border-radius: 12px;
      margin-bottom: 30px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 500;
    `;
    alert.innerHTML = `<i data-lucide="shield-alert"></i> <div><strong>RESTRICTED ACCESS:</strong> ${lockReason}<br><span style="font-size: 13px; opacity: 0.8;">Social media and games are currently locked.</span></div>`;
    wrapper.appendChild(alert);
  }

  const grid = document.createElement('div');
  grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px;';

  const apps = [
    { type: 'social', label: 'Social Media', desc: 'Chat and share', icon: 'message-circle', color: '#1DA1F2', bg: 'rgba(29, 161, 242, 0.1)' },
    { type: 'games', label: 'Games', desc: 'Fun and play', icon: 'gamepad-2', color: '#FF4B2B', bg: 'rgba(255, 75, 43, 0.1)' },
    { type: 'school', label: 'School Apps', desc: 'Learning & homework', icon: 'graduation-cap', color: '#00B4DB', bg: 'rgba(0, 180, 219, 0.1)' }
  ];

  apps.forEach(app => {
    const card = document.createElement('div');
    const appIsBlocked = isLocked && ['social', 'games'].includes(app.type) && !approvedApps.has(app.type);
    
    card.style.cssText = `
      background: var(--bg-card);
      border: 1px solid var(--color-border-subtle);
      border-radius: 20px;
      padding: 24px;
      text-align: center;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    `;
    if (appIsBlocked) {
      card.style.opacity = '0.8';
      card.style.border = '2px solid var(--color-danger)';
      card.style.background = 'linear-gradient(to bottom, var(--bg-card), rgba(255,0,0,0.05))';
    } else {
      card.onmouseover = () => { card.style.transform = 'translateY(-5px)'; card.style.boxShadow = '0 10px 20px rgba(0,0,0,0.1)'; };
      card.onmouseout = () => { card.style.transform = 'none'; card.style.boxShadow = 'none'; };
    }

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = `
      width: 64px; height: 64px;
      margin: 0 auto 16px auto;
      border-radius: 18px;
      display: flex; align-items: center; justify-content: center;
      background: ${appIsBlocked ? 'rgba(255, 59, 48, 0.1)' : app.bg};
      color: ${appIsBlocked ? 'var(--color-danger)' : app.color};
    `;
    iconWrap.innerHTML = `<i data-lucide="${appIsBlocked ? 'lock' : app.icon}" style="width: 32px; height: 32px;"></i>`;
    card.appendChild(iconWrap);
    
    card.innerHTML += `
      <h3 style="margin: 0 0 4px 0; font-size: 18px;">${app.label}</h3>
      <p style="margin: 0 0 20px 0; font-size: 13px; color: var(--text-secondary);">${appIsBlocked ? 'Access Restricted' : app.desc}</p>
    `;
    
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 8px; justify-content: center;';
    
    if (!isParent) {
      if (appIsBlocked) {
        const emBtn = document.createElement('button');
        emBtn.style.cssText = 'width: 100%; background: var(--color-danger); color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s;';
        emBtn.textContent = 'Request Access';
        emBtn.onmouseover = () => emBtn.style.opacity = '0.9';
        emBtn.onmouseout = () => emBtn.style.opacity = '1';
        emBtn.onclick = async () => {
          const reason = prompt('Why do you need emergency access to this app right now?');
          if (!reason) return;
          try {
            await apiFetch('/reports/emergency', { method: 'POST', body: JSON.stringify({ app_type: app.type, reason }) });
            showToast('Emergency request sent to parents.', 'success');
          } catch (err) { showToast('Failed to send request.', 'danger'); }
        };
        actions.appendChild(emBtn);
      } else if (app.type === 'school') {
        const btn = document.createElement('button');
        btn.style.cssText = `
          width: 100%; background: var(--bg-body); border: 1px solid var(--color-border); color: var(--text-main);
          padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;
        `;
        btn.innerHTML = `<span><i data-lucide="play" style="width:14px; height:14px; margin-right:4px;"></i> Open School Apps</span>`;
        btn.onmouseover = () => { btn.style.background = app.color; btn.style.color = 'white'; btn.style.borderColor = app.color; };
        btn.onmouseout = () => { btn.style.background = 'var(--bg-body)'; btn.style.color = 'var(--text-main)'; btn.style.borderColor = 'var(--color-border)'; };
        btn.onclick = async () => {
          try {
            await apiFetch('/reports/apps', { method: 'POST', body: JSON.stringify({ app_type: app.type, minutes: 30 }) });
            showToast(`Opened School Apps (Tracking time...)`, 'success');
            setTimeout(() => window.oikos?.navigate('/apps'), 500);
          } catch (err) { showToast('Failed to track app time', 'danger'); }
        };
        actions.appendChild(btn);
      } else {
        ['15', '30', '60'].forEach(m => {
          const cost = parseInt(m, 10);
          const btn = document.createElement('button');
          btn.style.cssText = `
            flex: 1; background: var(--bg-body); border: 1px solid var(--color-border); color: var(--text-main);
            padding: 8px 0; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 12px;
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
          `;
          const timeLabel = m === '60' ? '1h' : `${m}m`;
          btn.innerHTML = `<span>Unlock ${timeLabel}</span><span style="font-size: 10px; opacity: 0.8; font-weight: normal;"><i data-lucide="star" style="width: 10px; height: 10px;"></i> ${cost}</span>`;
          
          btn.onmouseover = () => { btn.style.background = app.color; btn.style.color = 'white'; btn.style.borderColor = app.color; };
          btn.onmouseout = () => { btn.style.background = 'var(--bg-body)'; btn.style.color = 'var(--text-main)'; btn.style.borderColor = 'var(--color-border)'; };
          btn.onclick = async () => {
            if (points < cost) {
              showToast(`You need ${cost} points to unlock ${timeLabel}. Complete chores!`, 'danger');
              return;
            }
            try {
              await apiFetch('/reports/spend', { method: 'POST', body: JSON.stringify({ cost }) });
              await apiFetch('/reports/apps', { method: 'POST', body: JSON.stringify({ app_type: app.type, minutes: parseInt(m, 10) }) });
              showToast(`Spent ${cost} points to unlock ${timeLabel} of ${app.label}!`, 'success');
              setTimeout(() => window.oikos?.navigate('/apps'), 500);
            } catch (err) { 
              showToast(err.message || 'Failed to unlock app time. Not enough points?', 'danger'); 
            }
          };
          actions.appendChild(btn);
        });
      }
      card.appendChild(actions);
    } else {
      const parentLabel = document.createElement('div');
      parentLabel.style.cssText = 'color: var(--text-muted); font-size: 12px; margin-top: 10px;';
      parentLabel.textContent = 'App usage is reported in the Reports tab.';
      card.appendChild(parentLabel);
    }
    grid.appendChild(card);
  });

  wrapper.appendChild(grid);
  container.replaceChildren(wrapper);
  if (window.lucide) window.lucide.createIcons();
}
