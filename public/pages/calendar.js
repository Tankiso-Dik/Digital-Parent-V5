import { apiFetch } from '../api.js';
const showToast = (msg, type) => window.oikos?.showToast(msg, type);

function formatDateObj(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function render(container, { user }) {
  const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);

  let currentDate = new Date();
  
  const wrapper = document.createElement('div');
  wrapper.className = 'daily-plan-page';
  wrapper.style.cssText = 'max-width: 800px; margin: 0 auto; padding-bottom: 40px;';

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;';
  
  header.innerHTML = `
    <div>
      <h1 style="font-size: 28px; font-weight: 800; margin: 0; background: linear-gradient(90deg, var(--color-primary), var(--color-accent)); -webkit-background-clip: text; color: transparent;">${isParent ? 'Manage Daily Plan' : 'My Daily Plan'}</h1>
      <p style="color: var(--text-secondary); margin: 4px 0 0 0;">${isParent ? 'Schedule chores, study time, and curfews.' : 'Complete your tasks to earn rewards!'}</p>
    </div>
  `;

  if (isParent) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--primary';
    addBtn.innerHTML = '<i data-lucide="plus"></i> Add Routine';
    addBtn.onclick = () => openRoutineModal();
    header.appendChild(addBtn);
  }

  wrapper.appendChild(header);

  // Date Navigator
  const navBar = document.createElement('div');
  navBar.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 16px; margin-bottom: 30px; background: var(--bg-card); padding: 12px; border-radius: 16px; border: 1px solid var(--color-border-subtle);';
  
  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn btn--ghost btn--icon';
  prevBtn.innerHTML = '<i data-lucide="chevron-left"></i>';
  prevBtn.onclick = () => { currentDate.setDate(currentDate.getDate() - 1); updateDateDisplay(); loadData(); };
  
  const dateLabel = document.createElement('div');
  dateLabel.style.cssText = 'font-weight: bold; font-size: 16px; width: 140px; text-align: center;';
  
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn--ghost btn--icon';
  nextBtn.innerHTML = '<i data-lucide="chevron-right"></i>';
  nextBtn.onclick = () => { currentDate.setDate(currentDate.getDate() + 1); updateDateDisplay(); loadData(); };

  function updateDateDisplay() {
    const today = new Date();
    if (formatDateObj(currentDate) === formatDateObj(today)) {
      dateLabel.textContent = 'Today';
    } else {
      dateLabel.textContent = currentDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
  }
  updateDateDisplay();
  
  navBar.append(prevBtn, dateLabel, nextBtn);
  wrapper.appendChild(navBar);

  const timelineWrap = document.createElement('div');
  wrapper.appendChild(timelineWrap);
  container.replaceChildren(wrapper);

  let events = [];
  let children = [];

  async function loadData() {
    try {
      if (isParent && children.length === 0) {
        const usersRes = await apiFetch('/auth/users');
        children = (usersRes.data || []).filter(u => u.family_role === 'child');
      }
      
      const targetDate = formatDateObj(currentDate);
      const res = await apiFetch(`/calendar?from=${targetDate}&to=${targetDate}`);
      events = res.data || [];
      
      // Sort by start time
      events.sort((a, b) => {
        const tA = a.start_time || '24:00';
        const tB = b.start_time || '24:00';
        return tA.localeCompare(tB);
      });
      
      renderTimeline();
    } catch(e) {
      console.error(e);
      timelineWrap.innerHTML = '<div class="empty-state">Failed to load schedule.</div>';
    }
  }

  function getCategoryConfig(cat) {
    if (cat === 'learning') return { icon: 'book-open', color: '#007AFF', bg: 'rgba(0,122,255,0.1)', label: 'Learning' };
    if (cat === 'health') return { icon: 'heart-pulse', color: '#FF3B30', bg: 'rgba(255,59,48,0.1)', label: 'Health' };
    if (cat === 'routine') return { icon: 'clock', color: '#5856D6', bg: 'rgba(88,86,214,0.1)', label: 'Routine' };
    if (cat === 'optional') return { icon: 'coffee', color: '#34C759', bg: 'rgba(52,199,89,0.1)', label: 'Free Time' };
    return { icon: 'check-square', color: '#FF9500', bg: 'rgba(255,149,0,0.1)', label: 'Responsibility' };
  }

  function renderTimeline() {
    timelineWrap.innerHTML = '';
    
    if (events.length === 0) {
      timelineWrap.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: 20px; border: 1px dashed var(--color-border);">
          <div style="width: 64px; height: 64px; background: var(--bg-body); border-radius: 32px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; color: var(--text-muted);">
            <i data-lucide="calendar-x" style="width: 32px; height: 32px;"></i>
          </div>
          <h3 style="margin: 0 0 8px 0;">No plans today!</h3>
          <p style="color: var(--text-secondary); margin: 0;">${isParent ? 'Click "Add Routine" to schedule tasks.' : 'Enjoy your free time!'}</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ el: timelineWrap });
      return;
    }

    const timelineContainer = document.createElement('div');
    timelineContainer.style.cssText = 'position: relative; padding-left: 20px;';
    
    const line = document.createElement('div');
    line.style.cssText = 'position: absolute; left: 39px; top: 20px; bottom: 40px; width: 2px; background: var(--color-border-subtle); z-index: 0;';
    timelineContainer.appendChild(line);

    events.forEach(ev => {
      const config = getCategoryConfig(ev.category || 'responsibility');
      const isDone = ev.status === 'done';
      
      const item = document.createElement('div');
      item.style.cssText = `
        display: flex; gap: 20px; margin-bottom: 24px; position: relative; z-index: 1;
        opacity: ${isDone ? '0.6' : '1'}; transition: opacity 0.3s;
      `;
      
      const timeCol = document.createElement('div');
      timeCol.style.cssText = 'width: 60px; text-align: right; flex-shrink: 0; padding-top: 14px;';
      timeCol.innerHTML = `
        <div style="font-weight: 600; font-size: 14px; color: var(--text-main);">${ev.start_time ? ev.start_time.slice(0,5) : 'All Day'}</div>
        ${ev.end_time ? `<div style="font-size: 12px; color: var(--text-muted);">${ev.end_time.slice(0,5)}</div>` : ''}
      `;
      
      const node = document.createElement('div');
      node.style.cssText = `
        width: 40px; height: 40px; border-radius: 20px; flex-shrink: 0;
        background: ${isDone ? 'var(--color-success)' : config.bg}; 
        color: ${isDone ? 'white' : config.color};
        display: flex; align-items: center; justify-content: center;
        border: 4px solid var(--bg-body); box-shadow: 0 0 0 1px var(--color-border-subtle);
      `;
      node.innerHTML = `<i data-lucide="${isDone ? 'check' : config.icon}" style="width: 18px; height: 18px;"></i>`;
      
      const card = document.createElement('div');
      card.style.cssText = `
        flex: 1; background: var(--bg-card); border-radius: 16px; padding: 16px;
        border: 1px solid var(--color-border-subtle); box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        display: flex; justify-content: space-between; align-items: center;
        position: relative; z-index: 2;
      `;
      
      const isToday = formatDateObj(currentDate) === formatDateObj(new Date());
      const repeatBadge = ev.recurrence_rule ? `<span style="font-size: 10px; background: var(--bg-body); padding: 2px 6px; border-radius: 4px; margin-left: 6px;"><i data-lucide="repeat" style="width: 10px; height: 10px; margin-right: 2px;"></i>Repeats</span>` : '';

      card.innerHTML = `
        <div>
          <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${config.color}; margin-bottom: 4px; letter-spacing: 0.5px; display: flex; align-items: center;">
            ${config.label} ${isParent ? `· For ${ev.assigned_name || 'Everyone'}` : ''} ${repeatBadge}
          </div>
          <h4 style="margin: 0 0 4px 0; font-size: 16px; text-decoration: ${isDone ? 'line-through' : 'none'};">${ev.title}</h4>
          ${ev.description ? `<p style="margin: 0; font-size: 13px; color: var(--text-secondary);">${ev.description}</p>` : ''}
        </div>
      `;
      
      if (!isParent && !isDone && isToday) {
        const actBtn = document.createElement('button');
        actBtn.className = 'btn btn--success btn--sm';
        actBtn.style.position = 'relative';
        actBtn.style.zIndex = '10';
        actBtn.innerHTML = 'Mark Done (+10 pts)';
        actBtn.onclick = async (e) => {
          console.log('[DEBUG] Mark Done clicked for event:', ev.id);
          e.preventDefault();
          e.stopPropagation();
          actBtn.disabled = true;
          try {
            await apiFetch(`/calendar/${ev.id}`, { 
              method: 'PATCH', 
              body: JSON.stringify({ 
                status: 'done',
                date: formatDateObj(currentDate)
              }) 
            });
            showToast('Task completed! Awaiting parent confirmation.', 'success');
            
            // Trigger Confetti
            if (!window.confetti) {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
              script.onload = () => window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
              document.head.appendChild(script);
            } else {
              window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            }
            
            await loadData();
          } catch(err) { 
            showToast('Error', 'danger'); 
            actBtn.disabled = false;
          }
        };
        card.appendChild(actBtn);
      }
      
      if (isParent) {
        const actionWrap = document.createElement('div');
        actionWrap.style.cssText = 'display: flex; gap: 8px; align-items: center; position: relative; z-index: 10;';

        const isTask = true;

        if (isTask && isDone && !ev.is_confirmed) {
          const confirmBtn = document.createElement('button');
          confirmBtn.className = 'btn btn--primary btn--sm';
          confirmBtn.innerHTML = 'Confirm';
          confirmBtn.onclick = async (e) => {
            e.preventDefault(); e.stopPropagation();
            confirmBtn.disabled = true;
            try {
              await apiFetch(`/calendar/${ev.id}`, { 
                method: 'PATCH', 
                body: JSON.stringify({ status: 'confirmed', date: formatDateObj(currentDate) }) 
              });
              showToast('Task confirmed!', 'success');
              await loadData();
            } catch(err) { showToast('Error', 'danger'); confirmBtn.disabled = false; }
          };
          actionWrap.appendChild(confirmBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn--ghost btn--icon';
        delBtn.style.color = 'var(--text-muted)';
        delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        delBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if(!confirm('Delete this routine? (If it repeats, this deletes all occurrences)')) return;
          try {
            await apiFetch(`/calendar/${ev.id}`, { method: 'DELETE' });
            await loadData();
          } catch(err) {}
        };
        actionWrap.appendChild(delBtn);

        card.appendChild(actionWrap);
      }

      item.append(timeCol, node, card);
      timelineContainer.appendChild(item);
    });

    timelineWrap.appendChild(timelineContainer);
    if (window.lucide) window.lucide.createIcons({ el: timelineWrap });
  }

  function openRoutineModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const panel = document.createElement('div');
    panel.className = 'modal-panel modal-panel--md';
    panel.style.padding = '24px';
    
    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <h2 style="margin:0;">Add Daily Routine</h2>
        <button class="btn btn--ghost btn--icon" id="close-modal"><i data-lucide="x"></i></button>
      </div>
      
      <form id="routine-form" style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label class="form-label">Task / Title</label>
          <input type="text" id="r-title" class="form-input" list="task-suggestions" required placeholder="e.g. Do Math Homework" autocomplete="off" />
          <datalist id="task-suggestions">
            <option value="Morning Routine (Brush teeth, make bed)">
            <option value="Bedtime Routine">
            <option value="Do Math Homework">
            <option value="Read for 30 minutes">
            <option value="Practice Instrument">
            <option value="Clean Bedroom">
            <option value="Take out the Trash">
            <option value="Load / Unload Dishwasher">
            <option value="Walk the Dog">
            <option value="Take Medication">
            <option value="Exercise / Play outside">
          </datalist>
        </div>
        
        <div style="display: flex; gap: 16px;">
          <div style="flex: 1;">
            <label class="form-label">Category</label>
            <select id="r-cat" class="form-input" required>
              <option value="routine">🔁 Routine (Daily Habits)</option>
              <option value="learning">📚 Learning (Study & Practice)</option>
              <option value="responsibility">🧹 Responsibility (Chores & Errands)</option>
              <option value="health">💊 Health (Exercise & Medication)</option>
              <option value="optional">☕ Optional (Free Time)</option>
            </select>
          </div>
          <div style="flex: 1;">
            <label class="form-label">Assign To</label>
            <select id="r-child" class="form-input">
              ${children.map(c => `<option value="${c.id}">${c.display_name}</option>`).join('')}
            </select>
          </div>
        </div>
        
        <div style="display: flex; gap: 16px;">
          <div style="flex: 1;">
            <label class="form-label">Start Time</label>
            <input type="time" id="r-start" class="form-input" required />
          </div>
          <div style="flex: 1;">
            <label class="form-label">End Time</label>
            <input type="time" id="r-end" class="form-input" required />
          </div>
        </div>

        <div>
          <label class="form-label">Repeat Schedule</label>
          <select id="r-repeat" class="form-input">
            <option value="">Once (Today only)</option>
            <option value="FREQ=DAILY">Every Day</option>
            <option value="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">Weekdays Only (Mon-Fri)</option>
            <option value="FREQ=WEEKLY;BYDAY=SA,SU">Weekends Only (Sat-Sun)</option>
          </select>
        </div>
        
        <button type="submit" class="btn btn--primary" style="margin-top: 16px; padding: 12px; font-weight: bold;">Schedule Routine</button>
      </form>
    `;
    
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ el: panel });
    
    const close = () => overlay.remove();
    panel.querySelector('#close-modal').onclick = close;
    
    panel.querySelector('#routine-form').onsubmit = async (e) => {
      e.preventDefault();
      
      const repeatVal = document.getElementById('r-repeat').value;
      const targetDate = formatDateObj(currentDate);

      const payload = {
        title: document.getElementById('r-title').value,
        category: document.getElementById('r-cat').value,
        assigned_to: document.getElementById('r-child').value,
        start_datetime: `${targetDate}T${document.getElementById('r-start').value}:00Z`,
        end_datetime: `${targetDate}T${document.getElementById('r-end').value}:00Z`,
        calendar_id: 1, // Default
      };

      if (repeatVal) {
        payload.recurrence_rule = repeatVal;
      }
      
      try {
        await apiFetch('/calendar', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Routine scheduled!', 'success');
        close();
        loadData();
      } catch(err) {
        showToast('Error scheduling routine', 'danger');
      }
    };
  }

  await loadData();
}
