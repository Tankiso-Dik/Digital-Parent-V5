import { apiFetch } from '../api.js';

export async function render(container, { user }) {
  const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);

  const wrapper = document.createElement('div');
  wrapper.className = 'reports-page';
  wrapper.style.cssText = 'max-width: 1000px; margin: 0 auto; padding-bottom: 40px;';

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom: 30px;';
  header.innerHTML = `
    <h1 style="font-size: 28px; font-weight: 800; margin: 0; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); -webkit-background-clip: text; color: transparent;">Family Intelligence</h1>
    <p style="color: var(--text-secondary); margin: 4px 0 0 0;">Real-time insights on your children's digital and physical activity.</p>
  `;
  wrapper.appendChild(header);

  const contentWrap = document.createElement('div');
  wrapper.appendChild(contentWrap);
  container.replaceChildren(wrapper);

  try {
    const usersRes = await apiFetch('/auth/users');
    let children = (usersRes.data || []).filter(u => u.family_role === 'child');
    if (!isParent) {
      children = children.filter(u => u.id === user.id);
    }

    if (!children.length) {
      contentWrap.innerHTML = `<div class="empty-state"><p>No children accounts found in your family.</p></div>`;
      return;
    }

    // EMERGENCY REQUESTS
    if (isParent) {
    try {
      const emRes = await apiFetch('/reports/emergency');
      const requests = (emRes.data || []).filter(r => r.status === 'pending');
      
      if (requests.length > 0) {
        const emContainer = document.createElement('div');
        emContainer.style.cssText = 'margin-bottom: 30px; background: linear-gradient(135deg, rgba(255,59,48,0.1), rgba(255,149,0,0.1)); border-radius: 16px; padding: 20px; border: 1px solid rgba(255,59,48,0.2);';
        
        emContainer.innerHTML = `
          <h3 style="margin: 0 0 16px 0; color: var(--color-danger); display: flex; align-items: center; gap: 8px;">
            <i data-lucide="alert-triangle"></i> Pending Emergency Requests (${requests.length})
          </h3>
          <div style="display: grid; gap: 12px;" id="em-grid"></div>
        `;
        
        const emGrid = emContainer.querySelector('#em-grid');
        requests.forEach(req => {
          const isSos = req.request_type === 'sos';
          const reqCard = document.createElement('div');
          
          if (isSos) {
            reqCard.style.cssText = 'background: #FFF5F5; border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 20px rgba(255,0,0,0.1); border: 2px solid #FF3B30; animation: pulse-red 2s infinite;';
          } else {
            reqCard.style.cssText = 'background: var(--bg-card); border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid var(--color-border-subtle);';
          }

          const label = isSos 
            ? `<span style="color: #FF3B30; font-weight: 800; font-size: 14px; text-transform: uppercase; display: flex; align-items: center; gap: 4px;"><i data-lucide="megaphone" style="width:16px; height:16px;"></i> EMERGENCY SOS</span>` 
            : `<span style="text-transform: uppercase; font-size: 12px; background: var(--bg-body); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--color-border);">${req.app_type}</span>`;

          reqCard.innerHTML = `
            <div>
              <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">
                ${isSos ? '<span style="color: #FF3B30;">URGENT: </span>' : ''}
                <span style="color: var(--color-primary);">${req.display_name}</span> 
                ${isSos ? 'triggered a safety alert' : `wants to use ${label}`}
              </div>
              <div style="color: var(--text-secondary); font-size: 13px; font-style: italic;">"${req.reason}"</div>
              ${isSos ? '' : `<div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">Sent: ${new Date(req.created_at).toLocaleString()}</div>`}
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn approve-em-btn" data-id="${req.id}" style="background: ${isSos ? '#FF3B30' : 'var(--color-success)'}; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;">${isSos ? 'Acknowledge' : 'Approve'}</button>
              ${isSos ? '' : `<button class="btn deny-em-btn" data-id="${req.id}" style="background: var(--bg-body); color: var(--color-danger); border: 1px solid var(--color-danger); padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;">Deny</button>`}
            </div>
          `;
          emGrid.appendChild(reqCard);
        });
        
        contentWrap.appendChild(emContainer);

        emContainer.querySelectorAll('.approve-em-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            try {
              await apiFetch(`/reports/emergency/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
              window.oikos?.showToast('Request Approved', 'success');
              window.oikos?.navigate('/reports');
            } catch (err) {
              window.oikos?.showToast('Failed to approve request', 'error');
            }
          });
        });

        emContainer.querySelectorAll('.deny-em-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            try {
              await apiFetch(`/reports/emergency/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'denied' }) });
              window.oikos?.showToast('Request Denied', 'success');
              window.oikos?.navigate('/reports');
            } catch (err) {
              window.oikos?.showToast('Failed to deny request', 'error');
            }
          });
        });
      }
    } catch(e) {}
    } // end isParent check

    // --- INDIVIDUAL CHILD DASHBOARDS ---
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; gap: 30px;';
    contentWrap.appendChild(grid);

    // Sort children by display name for consistency
    children.sort((a, b) => a.display_name.localeCompare(b.display_name));

    children.forEach(child => {
      const card = document.createElement('div');
      card.className = 'child-report-card glass';
      card.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.05);
      `;
      card.id = `report-${child.id}`;
      
      card.innerHTML = `
        <div style="background: linear-gradient(135deg, ${child.avatar_color || 'var(--color-primary)'}22, transparent); padding: 24px; border-bottom: 1px solid var(--color-border-subtle); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="width: 56px; height: 56px; border-radius: 28px; background: ${child.avatar_color || 'var(--color-primary)'}; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; box-shadow: 0 4px 12px ${child.avatar_color || 'var(--color-primary)'}44;">
              ${child.display_name.charAt(0)}
            </div>
            <div>
              <h2 style="margin: 0; font-size: 22px;">${child.display_name}</h2>
              <div style="display: flex; gap: 12px; margin-top: 4px;">
                <span style="font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;"><i data-lucide="star" style="width: 14px; height: 14px; color: #FF9500;"></i> ${child.points || 0} pts</span>
                <span style="font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;"><i data-lucide="flame" style="width: 14px; height: 14px; color: #FF3B30;"></i> ${child.current_streak || 0} day streak</span>
              </div>
            </div>
          </div>
          <button class="btn btn--secondary btn--sm schedule-btn" data-child-id="${child.id}">View Schedule</button>
        </div>
        <div id="stats-${child.id}" style="padding: 24px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
            <div class="skeleton" style="height: 120px; border-radius: 16px;"></div>
            <div class="skeleton" style="height: 120px; border-radius: 16px;"></div>
          </div>
        </div>
      `;

      card.querySelector('.schedule-btn').addEventListener('click', () => {
        window.oikos?.navigate(`/calendar?assigned_to=${child.id}`);
      });
      
      grid.appendChild(card);
    });

    // Load stats for each child
    children.forEach(async child => {
      try {
        const statsRes = await apiFetch(`/reports/child/${child.id}`);
        const stats = statsRes.data;
        const statsEl = document.getElementById(`stats-${child.id}`);
        
        if (stats && statsEl) {
          statsEl.innerHTML = '';
          
          // 1. Alert Banner if in Danger Zone
          if (stats.location?.location_type === 'danger') {
            const dangerAlert = document.createElement('div');
            dangerAlert.innerHTML = `
              <div style="background: rgba(255,59,48,0.1); border: 1px solid var(--color-danger); border-radius: 16px; padding: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h3 style="margin: 0 0 4px 0; color: var(--color-danger); display: flex; align-items: center; gap: 8px;"><i data-lucide="siren"></i> DANGER ZONE ALERT</h3>
                  <p style="margin: 0; color: var(--text-main); font-size: 14px;">Last seen in a restricted area at ${new Date(stats.location.updated_at).toLocaleTimeString()}.</p>
                </div>
                <button class="btn btn--danger track-now-btn">Track Now</button>
              </div>
            `;
            dangerAlert.querySelector('.track-now-btn').addEventListener('click', () => {
              window.oikos?.navigate('/location');
            });
            statsEl.appendChild(dangerAlert.firstElementChild);
          }

          const evPercent = stats.events.total ? Math.round((stats.events.finished / stats.events.total) * 100) : 0;
          const appStats = stats.apps || [];
          const totalAppMinutes = appStats.reduce((sum, a) => sum + a.total_minutes, 0);

          const contentHtml = document.createElement('div');
          contentHtml.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
              
              <!-- Column 1: Daily Plan -->
              <div style="background: var(--bg-body); padding: 20px; border-radius: 20px; border: 1px solid var(--color-border-subtle);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                  <h4 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 16px;"><i data-lucide="calendar-check" style="color: var(--color-primary);"></i> Daily Plan Adherence</h4>
                  <span style="background: ${evPercent >= 70 ? 'var(--color-success)' : (evPercent >= 40 ? 'var(--color-warning)' : 'var(--color-danger)')}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 800;">${evPercent}%</span>
                </div>
                
                <div style="height: 10px; background: var(--color-border); border-radius: 5px; margin-bottom: 16px; overflow: hidden;">
                  <div style="height: 100%; width: ${evPercent}%; background: ${evPercent >= 70 ? 'var(--color-success)' : (evPercent >= 40 ? 'var(--color-warning)' : 'var(--color-danger)')}; transition: width 1s ease-out;"></div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div style="background: var(--bg-card); padding: 12px; border-radius: 12px; text-align: center; border: 1px solid var(--color-border-subtle);">
                    <div style="font-size: 20px; font-weight: 800; color: var(--color-success);">${stats.events.finished}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; font-weight: bold;">Done</div>
                  </div>
                  <div style="background: var(--bg-card); padding: 12px; border-radius: 12px; text-align: center; border: 1px solid var(--color-border-subtle);">
                    <div style="font-size: 20px; font-weight: 800; color: var(--text-muted);">${stats.events.total - stats.events.finished}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; font-weight: bold;">Remaining</div>
                  </div>
                </div>
              </div>

              <!-- Column 2: App Usage -->
              <div style="background: var(--bg-body); padding: 20px; border-radius: 20px; border: 1px solid var(--color-border-subtle);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                  <h4 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 16px;"><i data-lucide="smartphone" style="color: var(--color-accent);"></i> Screen Time Today</h4>
                  <span style="font-weight: 800; color: var(--text-main);">${Math.floor(totalAppMinutes/60)}h ${totalAppMinutes%60}m</span>
                </div>

                ${appStats.length === 0 ? `
                  <div style="text-align: center; padding: 20px; color: var(--text-muted); font-style: italic; font-size: 14px;">No activity recorded yet.</div>
                ` : `
                  <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${appStats.map(app => {
                      const appPercent = Math.round((app.total_minutes / (totalAppMinutes || 1)) * 100);
                      let appInfo = { name: app.app_type, icon: 'box', color: '#888' };
                      if (app.app_type === 'school') appInfo = { name: 'Khan Academy', icon: 'graduation-cap', color: '#00B4DB' };
                      if (app.app_type === 'games') appInfo = { name: 'Roblox', icon: 'gamepad-2', color: '#FF4B2B' };
                      if (app.app_type === 'social') appInfo = { name: 'TikTok', icon: 'smartphone', color: '#1DA1F2' };
                      if (app.app_type === 'emergency') appInfo = { name: 'SOS Active', icon: 'siren', color: '#FF3B30' };

                      return `
                        <div>
                          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 4px;">
                            <span style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                              <i data-lucide="${appInfo.icon}" style="width: 14px; height: 14px; color: ${appInfo.color};"></i>
                              ${appInfo.name}
                            </span>
                            <span style="color: var(--text-secondary);">${app.total_minutes} min (${appPercent}%)</span>
                          </div>
                          <div style="height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden;">
                            <div style="height: 100%; width: ${appPercent}%; background: ${appInfo.color};"></div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `}
              </div>

            </div>
          `;
          statsEl.appendChild(contentHtml.firstElementChild);
          if (window.lucide) window.lucide.createIcons({ el: statsEl });
        }
      } catch (err) {
        console.error(err);
        const statsEl = document.getElementById(`stats-${child.id}`);
        if (statsEl) statsEl.innerHTML = '<p style="color:var(--color-danger);">Failed to load child intelligence data.</p>';
      }
    });

    if (window.lucide) window.lucide.createIcons({ el: wrapper });
  } catch (err) {
    contentWrap.innerHTML = '<div class="empty-state">Failed to load family members.</div>';
  }
}
