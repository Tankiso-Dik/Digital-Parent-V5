import { apiFetch } from '../api.js';
const showToast = (msg, type) => window.oikos?.showToast(msg, type);

export async function render(container, { user }) {
  const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);

  const wrapper = document.createElement('div');
  wrapper.className = 'dashboard-page';
  wrapper.style.cssText = 'max-width: 900px; margin: 0 auto; padding-bottom: 40px; padding-top: 20px;';

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom: 30px;';
  
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  header.innerHTML = `
    <h1 style="font-size: 32px; font-weight: 800; margin: 0; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); -webkit-background-clip: text; color: transparent;">${greeting}, ${user.display_name}</h1>
    <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: 16px;">${isParent ? 'Here is your family overview today.' : 'Ready to crush your goals today?'}</p>
  `;
  wrapper.appendChild(header);

  const grid = document.createElement('div');
  grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;';
  wrapper.appendChild(grid);
  container.replaceChildren(wrapper);

  if (isParent) {
    // PARENT DASHBOARD
    await renderParentDashboard(grid, user);
    if (!localStorage.getItem('dp_setup_wizard')) {
      showOnboardingWizard(wrapper);
    }
  } else {
    // CHILD DASHBOARD
    await renderChildDashboard(grid, user);
  }

  if (window.lucide) window.lucide.createIcons();
}

async function renderParentDashboard(grid, user) {
  // 1. Pending Emergency Requests
  const emCard = createCard('Emergency Requests', 'shield-alert', 'var(--color-danger)');
  grid.appendChild(emCard);

  try {
    const res = await apiFetch('/reports/emergency');
    const pending = res.data || [];
    const openRequests = pending.filter(r => r.status === 'pending');
    const hasSos = openRequests.some(r => r.request_type === 'sos');
    
    if (openRequests.length === 0) {
      emCard.innerHTML += `<div style="padding: 20px 0; text-align: center; color: var(--text-muted);"><i data-lucide="check-circle" style="width: 32px; height: 32px; margin-bottom: 8px;"></i><br>All clear! No pending requests.</div>`;
    } else {
      if (hasSos) {
        emCard.style.border = '2px solid #FF3B30';
        emCard.style.animation = 'pulse-red 2s infinite';
        emCard.innerHTML += `<div style="color: #FF3B30; font-weight: 900; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><i data-lucide="megaphone"></i> CRITICAL: SOS ALERT ACTIVE</div>`;
      } else {
        emCard.innerHTML += `<div style="color: var(--color-danger); font-weight: bold; margin-bottom: 12px;">You have ${openRequests.length} pending request(s).</div>`;
      }
      const btn = document.createElement('button');
      btn.className = 'btn btn--primary';
      btn.style.width = '100%';
      btn.textContent = 'Review Requests';
      btn.onclick = (e) => {
        e.preventDefault();
        window.oikos?.navigate('/reports');
      };
      emCard.appendChild(btn);
    }
  } catch(e) {
    emCard.innerHTML += `<div style="color: var(--text-muted);">Failed to load requests.</div>`;
  }

  // 2. Child Locations
  const locCard = createCard('Family Locations', 'map-pin', 'var(--color-primary)');
  grid.appendChild(locCard);

  try {
    const res = await apiFetch('/location');
    const locations = res.data || [];
    
    if (locations.length === 0) {
      locCard.innerHTML += `<div style="color: var(--text-muted);">No recent location data.</div>`;
    } else {
      const list = locations.map(l => {
        const zoneDisplay = l.zone_name || (l.location_type === 'unknown' ? 'Transit' : l.location_type);
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--color-border-subtle);">
            <div style="font-weight: 500;">${l.display_name}</div>
            <div style="color: ${l.location_type === 'danger' ? 'var(--color-danger)' : 'var(--text-secondary)'}; font-size: 13px; text-transform: capitalize;">
              <i data-lucide="${l.location_type === 'danger' ? 'alert-triangle' : 'map'}" style="width: 14px; height: 14px; margin-right: 4px;"></i>${zoneDisplay}
            </div>
          </div>
        `;
      }).join('');
      locCard.innerHTML += list;
    }
    const btn = document.createElement('button');
    btn.className = 'btn btn--secondary';
    btn.style.width = '100%';
    btn.style.marginTop = '16px';
    btn.textContent = 'View Live Map';
    btn.onclick = (e) => {
      e.preventDefault();
      window.oikos?.navigate('/location');
    };
    locCard.appendChild(btn);
  } catch(e) {
    locCard.innerHTML += `<div style="color: var(--text-muted);">Failed to load locations.</div>`;
  }

  // 3. Children Rewards Overview
  const rewardsCard = createCard('Children Rewards & Chores', 'star', '#FF9500');
  grid.appendChild(rewardsCard);
  try {
    const usersRes = await apiFetch('/auth/users');
    const children = (usersRes.data || []).filter(u => u.family_role === 'child');
    if (children.length === 0) {
      rewardsCard.innerHTML += `<div style="padding: 20px 0; color: var(--text-muted);">No child accounts found.</div>`;
    } else {
      for (const child of children) {
        rewardsCard.innerHTML += `
          <div style="padding: 12px 0; border-bottom: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 600; font-size: 15px;">${child.display_name}</div>
            <div style="display: flex; gap: 16px; font-size: 13px; font-weight: bold;">
              <span style="color: #FF9500; display:flex; align-items:center; gap:4px;"><i data-lucide="star" style="width:16px; height:16px;"></i> ${child.points || 0} pts</span>
              <span style="color: #FF3B30; display:flex; align-items:center; gap:4px;"><i data-lucide="flame" style="width:16px; height:16px;"></i> ${child.current_streak || 0} days</span>
            </div>
          </div>
        `;
      }
    }
  } catch(e) {
    rewardsCard.innerHTML += `<div style="color: var(--text-muted);">Failed to load rewards.</div>`;
  }

  // 3. Quick Links
  const linksCard = createCard('Quick Actions', 'zap', 'var(--color-accent)');
  grid.appendChild(linksCard);
  
  linksCard.innerHTML += `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <button class="btn btn--secondary" id="dash-link-calendar" style="justify-content: flex-start;"><i data-lucide="calendar"></i> Manage Daily Plan</button>
      <button class="btn btn--secondary" id="dash-link-reports" style="justify-content: flex-start;"><i data-lucide="pie-chart"></i> View App Usage</button>
    </div>
  `;
  
  linksCard.querySelector('#dash-link-calendar').onclick = (e) => { e.preventDefault(); window.oikos?.navigate('/calendar'); };
  linksCard.querySelector('#dash-link-reports').onclick = (e) => { e.preventDefault(); window.oikos?.navigate('/reports'); };
}

async function renderChildDashboard(grid, user) {
  // 1. Rewards Balance
  const rwCard = createCard('My Rewards', 'star', '#FF9500');
  grid.appendChild(rwCard);

  try {
    const res = await apiFetch(`/reports/child/${user.id}`);
    const points = res.data?.points || 0;
    const streak = res.data?.current_streak || 0;
    
    rwCard.innerHTML += `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="text-align: center; padding: 20px 0; flex: 1;">
          <div style="font-size: 48px; font-weight: 900; color: #FF9500; text-shadow: 0 4px 15px rgba(255, 149, 0, 0.3);">${points}</div>
          <div style="color: var(--text-secondary); font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Total Points</div>
        </div>
        ${streak > 0 ? `
        <div style="background: linear-gradient(135deg, #FF3B30, #FF9500); color: white; padding: 8px 16px; border-radius: 12px; display: flex; align-items: center; gap: 8px; font-weight: bold; box-shadow: 0 4px 12px rgba(255,59,48,0.3); margin-top: 20px;">
          <i data-lucide="flame" style="width: 18px; height: 18px;"></i> ${streak} Day Streak!
        </div>` : ''}
      </div>
      <div style="margin: 15px 0; padding: 15px; background: rgba(255, 149, 0, 0.05); border-radius: 12px; border: 1px dashed rgba(255, 149, 0, 0.3);">
        <div style="font-size: 12px; color: var(--text-secondary); font-weight: bold; margin-bottom: 12px; text-transform: uppercase;">🎯 Next Milestones</div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span><i data-lucide="gamepad-2" style="width:14px; height:14px; vertical-align:-2px; color:#FF4B2B; margin-right:4px;"></i> 30m Gaming</span>
            <b style="color: var(--text-main);">30 pts</b>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span><i data-lucide="smartphone" style="width:14px; height:14px; vertical-align:-2px; color:#1DA1F2; margin-right:4px;"></i> 1h Social Media</span>
            <b style="color: var(--text-main);">60 pts</b>
          </div>
          <div style="height: 6px; background: var(--bg-body); border-radius: 3px; overflow: hidden; margin-top: 6px;">
            <div style="height: 100%; width: ${Math.min(100, (points/60)*100)}%; background: linear-gradient(90deg, #FFD700, #FF9500); border-radius: 3px;"></div>
          </div>
          <div style="text-align: right; font-size: 11px; color: var(--text-muted); font-weight: 500;">${points} / 60 pts</div>
        </div>
      </div>
      <button class="btn" id="spend-points-btn" style="width: 100%; background: #FF9500; color: white; border: none; margin-top: 10px; box-shadow: 0 4px 15px rgba(255,149,0,0.3);">
        Spend Points on Apps
      </button>
    `;
    rwCard.querySelector('#spend-points-btn').onclick = (e) => { e.preventDefault(); window.oikos?.navigate('/apps'); };
  } catch(e) {
    rwCard.innerHTML += `<div style="color: var(--text-muted);">Failed to load points.</div>`;
  }

  // 2. Today's Routines
  const routineCard = createCard('Today\'s Routines', 'list-checks', 'var(--color-primary)');
  grid.appendChild(routineCard);
  
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await apiFetch(`/calendar?from=${today}&to=${today}&assigned_to=${user.id}`);
    const routines = (res.data || []).filter(r => r.category === 'chore' || r.category === 'study' || r.category === 'medication' || r.category === 'routine');
    
    if (routines.length === 0) {
      routineCard.innerHTML += `<div style="padding: 20px 0; text-align: center; color: var(--text-muted);"><i data-lucide="calendar-check" style="width: 32px; height: 32px; margin-bottom: 8px;"></i><br>No tasks for today. Enjoy!</div>`;
    } else {
      const list = document.createElement('div');
      list.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
      
      routines.forEach(r => {
        const isDone = r.status === 'done';
        const item = document.createElement('div');
        item.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 10px; border-radius: 12px; background: var(--bg-body); border: 1px solid var(--color-border-subtle); opacity: ${isDone ? 0.6 : 1}; position: relative; z-index: 2;`;
        
        item.innerHTML = `
          <div>
            <div style="font-weight: 600; font-size: 14px; text-decoration: ${isDone ? 'line-through' : 'none'};">${r.title}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">${r.start_time ? r.start_time.slice(0,5) : 'Anytime'}</div>
          </div>
        `;
        
        if (!isDone) {
          const btn = document.createElement('button');
          btn.className = 'btn btn--success btn--sm';
          btn.style.padding = '4px 10px';
          btn.style.position = 'relative';
          btn.style.zIndex = '10';
          btn.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px;"></i>';
          btn.onclick = async (e) => {
            console.log('[DEBUG] Dashboard Routine click for event:', r.id);
            e.preventDefault();
            e.stopPropagation();
            btn.disabled = true;
            try {
              await apiFetch(`/calendar/${r.id}`, { 
                method: 'PATCH', 
                body: JSON.stringify({ 
                  status: 'done',
                  date: today
                }) 
              });
              showToast('Task marked as done!', 'success');
              
              const triggerConfetti = () => {
                if (window.confetti) {
                  window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                }
              };

              if (!window.confetti) {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
                script.onload = triggerConfetti;
                document.head.appendChild(script);
              } else {
                triggerConfetti();
              }
              
              // Simple refresh: re-render the whole grid
              grid.innerHTML = '';
              await renderChildDashboard(grid, user);
            } catch(err) {
              showToast('Error marking task', 'danger');
              btn.disabled = false;
            }
          };
          item.appendChild(btn);
        } else {
          item.innerHTML += `<div style="color: var(--color-success);"><i data-lucide="check-circle" style="width: 20px; height: 20px;"></i></div>`;
        }
        list.appendChild(item);
      });
      routineCard.appendChild(list);
      if (window.lucide) window.lucide.createIcons({ el: list });
    }
  } catch(e) {
    routineCard.innerHTML += `<div style="color: var(--text-muted);">Failed to load routines.</div>`;
  }

  // 3. Safety Check-in
  const safeCard = createCard('Safety Check-In', 'shield-check', 'var(--color-success)');
  grid.appendChild(safeCard);
  
  safeCard.innerHTML += `
    <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 20px;">Arrived at school or home? Check in to let your parents know you are safe.</p>
    <button class="btn btn--success" id="check-in-dash-btn" style="width: 100%;">
      Check In Now
    </button>
  `;
  safeCard.querySelector('#check-in-dash-btn').onclick = (e) => { e.preventDefault(); window.oikos?.navigate('/location'); };
}

function createCard(title, icon, color) {
  const div = document.createElement('div');
  div.style.cssText = `
    background: var(--bg-card);
    border-radius: 20px;
    padding: 24px;
    border: 1px solid var(--color-border-subtle);
    box-shadow: 0 4px 15px rgba(0,0,0,0.02);
    display: flex;
    flex-direction: column;
  `;
  
  div.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
      <div style="width: 40px; height: 40px; border-radius: 12px; background: ${color}20; color: ${color}; display: flex; align-items: center; justify-content: center;">
        <i data-lucide="${icon}"></i>
      </div>
      <h3 style="margin: 0; font-size: 18px;">${title}</h3>
    </div>
  `;
  return div;
}

function showOnboardingWizard(container) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background: var(--bg-card); width: 100%; max-width: 500px; border-radius: 24px; padding: 40px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.2); position: relative;';
  
  let step = 1;
  const steps = [
    { title: 'Welcome to Digital Parent', desc: 'Let\'s set up your family environment. This wizard will guide you through adding your children and linking their devices.', icon: 'home' },
    { title: 'Add a Child Account', desc: 'First, we need to create an account for your child. Enter their name and age to tailor their safety settings automatically.', icon: 'user-plus' },
    { title: 'Configure Safe Zones', desc: 'Next, set up geofenced Safe Zones (like Home or School). You will be notified if they wander into a Danger Zone.', icon: 'map' },
    { title: 'Set Up Screen Time', desc: 'Finally, establish their Daily Plan. Schedule study blocks, curfews, and assign chores so they can earn screen time.', icon: 'clock' }
  ];

  const renderStep = () => {
    const s = steps[step-1];
    modal.innerHTML = `
      <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(0,122,255,0.1); color: var(--color-primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px auto;">
        <i data-lucide="${s.icon}" style="width: 32px; height: 32px;"></i>
      </div>
      <h2 style="margin: 0 0 12px 0; font-size: 24px;">${s.title}</h2>
      <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 32px;">${s.desc}</p>
      
      <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 32px;">
        ${steps.map((_, i) => `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${i === step-1 ? 'var(--color-primary)' : 'var(--color-border)'}"></div>`).join('')}
      </div>
      
      <div style="display: flex; gap: 16px;">
        ${step > 1 ? `<button class="btn btn--ghost" id="wiz-prev" style="flex: 1;">Back</button>` : `<div style="flex:1"></div>`}
        <button class="btn btn--primary" id="wiz-next" style="flex: 2;">${step === steps.length ? 'Finish Setup' : 'Continue'}</button>
      </div>
    `;
    
    if (window.lucide) window.lucide.createIcons({ el: modal });
    
    if (step > 1) {
      modal.querySelector('#wiz-prev').onclick = (e) => { e.preventDefault(); step--; renderStep(); };
    }
    modal.querySelector('#wiz-next').onclick = (e) => {
      e.preventDefault();
      if (step === steps.length) {
        localStorage.setItem('dp_setup_wizard', 'done');
        overlay.remove();
        showToast('Family setup complete!', 'success');
      } else {
        step++;
        renderStep();
      }
    };
  };

  renderStep();
  overlay.appendChild(modal);
  container.appendChild(overlay);
}
