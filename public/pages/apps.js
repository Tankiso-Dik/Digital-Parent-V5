import { apiFetch } from '../api.js';
const showToast = (msg, type) => window.oikos?.showToast(msg, type);

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export async function render(container, { user }) {
  const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);

  const wrapper = document.createElement('div');
  wrapper.className = 'app-usage-page';
  wrapper.style.cssText = 'max-width: 800px; margin: 0 auto; padding-bottom: 40px;';

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;';
  header.innerHTML = `
    <div>
      <h1 style="font-size: 28px; font-weight: 800; margin: 0; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); -webkit-background-clip: text; color: transparent;">App Usage Analytics</h1>
      <p style="color: var(--text-secondary); margin: 4px 0 0 0;">${isParent ? 'Monitor your child\\'s screen time' : 'View your daily activity'}</p>
    </div>
  `;
  wrapper.appendChild(header);

  try {
    const res = await apiFetch('/app-usage/analytics');
    const { topApps, categoryStats, dailyStats } = res.data;

    // Calculate total today (using first item in dailyStats if it matches today)
    const today = new Date().toISOString().slice(0, 10);
    const todayData = dailyStats.find(d => d.log_date === today);
    const totalTodaySeconds = todayData ? todayData.total_duration : 0;

    // Overall Summary Card
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
      <div>
        <h3 style="margin:0; font-size: 16px; color: var(--text-secondary);">Today's Total Screen Time</h3>
        <div style="font-size: 36px; font-weight: 800; color: var(--color-primary); margin-top: 8px;">
          ${formatDuration(totalTodaySeconds)}
        </div>
      </div>
    `;
    wrapper.appendChild(dashCard);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;';
    
    // Category Breakdown Card
    const catCard = document.createElement('div');
    catCard.style.cssText = 'background: var(--bg-card); border-radius: 16px; padding: 20px; border: 1px solid var(--color-border-subtle);';
    let catHtml = '<h3 style="margin: 0 0 16px 0; font-size: 16px;">Category Breakdown</h3>';
    
    const maxCat = categoryStats.reduce((max, c) => Math.max(max, c.total_duration), 0);
    if (categoryStats.length === 0) catHtml += '<p style="color: var(--text-muted); font-size: 14px;">No data yet.</p>';
    
    categoryStats.forEach(cat => {
      const pct = maxCat ? (cat.total_duration / maxCat) * 100 : 0;
      let color = 'var(--color-primary)';
      if (cat.category_name === 'Social Media') color = '#E1306C';
      if (cat.category_name === 'Gaming') color = '#FF4B2B';
      if (cat.category_name === 'Education') color = '#2ecc71';

      catHtml += `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
            <span>${cat.category_name || 'Other'}</span>
            <span style="font-weight: 600;">${formatDuration(cat.total_duration)}</span>
          </div>
          <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 3px;"></div>
          </div>
        </div>
      `;
    });
    catCard.innerHTML = catHtml;
    grid.appendChild(catCard);

    // Top Apps Card
    const topCard = document.createElement('div');
    topCard.style.cssText = 'background: var(--bg-card); border-radius: 16px; padding: 20px; border: 1px solid var(--color-border-subtle);';
    let topHtml = '<h3 style="margin: 0 0 16px 0; font-size: 16px;">Top Used Apps</h3>';
    
    if (topApps.length === 0) topHtml += '<p style="color: var(--text-muted); font-size: 14px;">No data yet.</p>';
    
    topApps.forEach((app, i) => {
      topHtml += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 24px; height: 24px; border-radius: 6px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${i+1}</div>
            <span style="font-weight: 500;">${app.app_name}</span>
          </div>
          <span style="font-weight: 600; font-size: 14px; color: var(--color-primary);">${formatDuration(app.total_duration)}</span>
        </div>
      `;
    });
    topCard.innerHTML = topHtml;
    grid.appendChild(topCard);

    wrapper.appendChild(grid);

    // Recent Logs List
    const logsWrap = document.createElement('div');
    logsWrap.style.cssText = 'background: var(--bg-card); border-radius: 16px; padding: 20px; border: 1px solid var(--color-border-subtle);';
    
    const logsRes = await apiFetch('/app-usage/logs');
    const logs = logsRes.data || [];
    
    let logsHtml = '<h3 style="margin: 0 0 16px 0; font-size: 16px;">Recent Activity Logs</h3>';
    if (logs.length === 0) logsHtml += '<p style="color: var(--text-muted); font-size: 14px;">No recent logs.</p>';
    
    logs.slice(0, 10).forEach(log => {
      const d = new Date(log.start_time);
      const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      logsHtml += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <div>
            <div style="font-weight: 500; margin-bottom: 4px;">${log.app_name}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">${log.category_name || 'Uncategorized'} • ${timeStr}</div>
          </div>
          <div style="font-family: monospace; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; font-size: 12px;">
            ${formatDuration(log.duration)}
          </div>
        </div>
      `;
    });
    logsWrap.innerHTML = logsHtml;
    wrapper.appendChild(logsWrap);

  } catch(e) {
    wrapper.innerHTML += `<div style="color: var(--color-danger); padding: 20px;">Failed to load analytics: ${e.message}</div>`;
  }

  container.replaceChildren(wrapper);
  if (window.lucide) window.lucide.createIcons();
}
