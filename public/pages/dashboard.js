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
    // PARENT DASHBOARD (Screen Control Setup)
    await renderScreenControlDashboard(grid, user);
    if (!localStorage.getItem('dp_setup_wizard')) {
      showOnboardingWizard(wrapper);
    }
  } else {
    // CHILD DASHBOARD
    await renderChildDashboard(grid, user);
  }

  if (window.lucide) window.lucide.createIcons();
}

async function renderScreenControlDashboard(grid, user) {
  let rulesData = { blocked_rules: [], curfews: [] };
  try {
    const res = await apiFetch('/rules');
    if (res && res.data) rulesData = res.data;
  } catch (e) {
    console.error('Failed to load rules', e);
  }

  const getRule = (type, value) => rulesData.blocked_rules.find(r => r.type === type && r.value === value);

  const saveRule = async (type, value, action, limit = null) => {
    try {
      await apiFetch('/rules/rule', {
        method: 'POST',
        body: JSON.stringify({ type, value, action, limit_minutes: limit })
      });
      showToast('Rule saved', 'success');
    } catch(e) {
      showToast('Error saving rule', 'danger');
    }
  };

  const deleteRule = async (id) => {
    try {
      await apiFetch('/rules/rule/' + id, { method: 'DELETE' });
      showToast('Rule deleted', 'success');
      // reload
      grid.innerHTML = '';
      await renderScreenControlDashboard(grid, user);
    } catch(e) {
      showToast('Error deleting rule', 'danger');
    }
  };

  // 2. Category Controls
  const categoryCard = createCard('Category Controls', 'layers', 'var(--color-primary)');
  grid.appendChild(categoryCard);
  
  const cats = [
    { id: 'social', name: 'Social Media', desc: 'TikTok, Instagram, Snapchat' },
    { id: 'gaming', name: 'Gaming', desc: 'Roblox, Minecraft, Steam' },
    { id: 'education', name: 'Education', desc: 'Wikipedia, Khan Academy' }
  ];

  let catHtml = `<p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 14px;">Manage broad app categories across all devices.</p>`;
  cats.forEach(c => {
    const rule = getRule('category', c.id) || { action: 'allow' };
    catHtml += `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border-subtle); padding-bottom: 12px; margin-bottom: 12px;">
        <div>
          <strong style="display: block;">${c.name}</strong>
          <span style="font-size: 12px; color: var(--text-muted);">${c.desc}</span>
        </div>
        <select class="input cat-select" data-cat="${c.id}" style="width: 120px; padding: 6px;">
          <option value="allow" ${rule.action==='allow'?'selected':''}>Allow</option>
          <option value="limit" ${rule.action==='limit'?'selected':''}>Limit (1h)</option>
          <option value="block" ${rule.action==='block'?'selected':''}>Block</option>
        </select>
      </div>
    `;
  });
  categoryCard.innerHTML += catHtml;
  categoryCard.querySelectorAll('.cat-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      saveRule('category', e.target.dataset.cat, e.target.value, e.target.value === 'limit' ? 60 : null);
    });
  });

  // 3. Manual URL Blocking
  const urlCard = createCard('Manual URL Blocking', 'globe', '#FF3B30');
  grid.appendChild(urlCard);
  
  const urlRules = rulesData.blocked_rules.filter(r => r.type === 'domain' || r.type === 'wildcard');
  let urlListHtml = urlRules.map(r => `
    <div style="display: flex; justify-content: space-between; background: var(--bg-body); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--color-border-subtle);">
      <span style="font-family: monospace;">${r.value}</span>
      <button class="del-url-btn" data-id="${r.id}" style="background: none; border: none; color: var(--color-danger); cursor: pointer;"><i data-lucide="trash-2" style="width:16px;"></i></button>
    </div>
  `).join('');

  urlCard.innerHTML += `
    <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 14px;">Precision control for specific websites.</p>
    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
      <input type="text" id="new-url-input" class="input" placeholder="e.g. *.discord.com" style="flex: 1;">
      <button class="btn btn--primary" id="add-url-btn">Block</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${urlListHtml}
    </div>
  `;

  urlCard.querySelector('#add-url-btn').onclick = async () => {
    const val = urlCard.querySelector('#new-url-input').value.trim();
    if(!val) return;
    const type = val.includes('*') ? 'wildcard' : 'domain';
    await saveRule(type, val, 'block');
    grid.innerHTML = '';
    await renderScreenControlDashboard(grid, user);
  };
  urlCard.querySelectorAll('.del-url-btn').forEach(btn => {
    btn.onclick = () => deleteRule(btn.dataset.id);
  });

  // 4. Curfews
  const curfewCard = createCard('Device Curfews', 'clock', '#FF9500');
  grid.appendChild(curfewCard);
  
  let curfewsHtml = rulesData.curfews.map(c => `
    <div style="background: var(--bg-body); padding: 16px; border-radius: 12px; border: 1px solid var(--color-border-subtle); margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <strong>${c.start_time} - ${c.end_time}</strong>
        <button class="del-curfew-btn" data-id="${c.id}" style="background:none;border:none;color:var(--color-danger);cursor:pointer;"><i data-lucide="trash-2" style="width:16px;"></i></button>
      </div>
      <div style="font-size:12px; color:var(--text-muted);">Active Days: ${JSON.parse(c.days_of_week||'[]').join(', ')}</div>
    </div>
  `).join('');

  
  curfewCard.innerHTML += `
    <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 14px;">Set Offline Hours. Devices will lock during these times.</p>
    ${curfewsHtml}
    
    <div style="background: var(--bg-body); padding: 16px; border-radius: 12px; border: 1px solid var(--color-border-subtle); margin-bottom: 16px; margin-top: 16px;">
      <div style="font-weight: bold; margin-bottom: 8px;">New Curfew</div>
      <div style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div style="flex: 1;"><label style="font-size:12px; color:var(--text-muted);">Lock Time</label><input type="time" id="new-curfew-start" class="input" value="21:00"></div>
        <div style="flex: 1;"><label style="font-size:12px; color:var(--text-muted);">Unlock Time</label><input type="time" id="new-curfew-end" class="input" value="07:00"></div>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom: 4px;">Days of Week (1=Mon, 7=Sun)</div>
      <input type="text" id="new-curfew-days" class="input" value="1,2,3,4,5" placeholder="1,2,3,4,5" style="width: 100%; margin-bottom: 12px;">
      <label style="display:flex; align-items:center; gap:8px; font-size: 14px; margin-bottom: 12px;">
        <input type="checkbox" id="new-curfew-strict" checked> Strict Mode
      </label>
      <button class="btn btn--secondary" id="add-curfew-btn" style="width: 100%;"><i data-lucide="plus"></i> Add Curfew</button>
    </div>
  `;

  curfewCard.querySelectorAll('.del-curfew-btn').forEach(btn => {
    btn.onclick = async () => {
      await apiFetch('/rules/curfew/' + btn.dataset.id, { method: 'DELETE' });
      grid.innerHTML = '';
      await renderScreenControlDashboard(grid, user);
    };
  });
  curfewCard.querySelector('#add-curfew-btn').onclick = async () => {
    const start = curfewCard.querySelector('#new-curfew-start').value;
    const end = curfewCard.querySelector('#new-curfew-end').value;
    const daysStr = curfewCard.querySelector('#new-curfew-days').value;
    const strict = curfewCard.querySelector('#new-curfew-strict').checked;
    const days = daysStr.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    
    await apiFetch('/rules/curfew', {
      method: 'POST',
      body: JSON.stringify({ start_time: start, end_time: end, days_of_week: days, strict_mode: strict })
    });
    grid.innerHTML = '';
    await renderScreenControlDashboard(grid, user);
  };


  // 5. Live Summary Panel
  const summaryCard = createCard('Policy Summary', 'shield-check', 'var(--color-success)');
  grid.appendChild(summaryCard);
  
  summaryCard.innerHTML += `
    <div style="background: rgba(52, 199, 89, 0.1); padding: 20px; border-radius: 16px; border: 1px solid rgba(52, 199, 89, 0.3);">
      <h4 style="margin: 0 0 16px 0; color: var(--color-success); display: flex; align-items: center; gap: 8px;"><i data-lucide="activity"></i> Active Enforcement</h4>
      <ul style="margin: 0; padding-left: 20px; color: var(--text-main); font-size: 14px; line-height: 1.8;">
        <li><strong>${rulesData.blocked_rules.filter(r=>r.type==='category').length}</strong> Category rules</li>
        <li><strong>${urlRules.length}</strong> URL rules</li>
        <li><strong>${rulesData.curfews.length}</strong> active Curfews</li>
      </ul>
      <button class="btn btn--success" id="sync-rules-btn" style="width: 100%; margin-top: 20px; box-shadow: 0 4px 12px rgba(52,199,89,0.3);">Sync Rules to Extension</button>
    </div>
  `;

  summaryCard.querySelector('#sync-rules-btn').onclick = async (e) => {
    e.preventDefault();
    const btn = e.target;
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Syncing...';
    btn.disabled = true;
    try {
      const res = await fetch('/api/v1/rules/sync');
      if (res.ok) {
        showToast('Rules compiled and synced successfully!', 'success');
      } else {
        throw new Error('Sync failed');
      }
    } catch(err) {
      showToast('Error syncing rules. Is the extension connected?', 'danger');
    }
    btn.innerHTML = oldText;
    btn.disabled = false;
    if (window.lucide) window.lucide.createIcons();
  };

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
