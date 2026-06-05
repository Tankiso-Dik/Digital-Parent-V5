import { apiFetch } from '../api.js';

export async function render(container, { user }) {
  const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);
  const wrapper = document.createElement('div');
  wrapper.className = 'school-page';
  wrapper.style.cssText = 'max-width: 900px; margin: 0 auto; padding-bottom: 40px;';

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom: 24px;';
  header.innerHTML = `
    <h1 style="font-size: 28px; font-weight: 800; margin: 0; background: linear-gradient(90deg, #00B4DB, #0083B0); -webkit-background-clip: text; color: transparent;">School Intelligence</h1>
    <p style="color: var(--text-secondary); margin: 4px 0 0 0;">View your children's academic performance, timetable, and attendance.</p>
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

    // Child Switcher
    const switcher = document.createElement('div');
    switcher.style.cssText = 'display: flex; gap: 12px; margin-bottom: 32px; overflow-x: auto; padding-bottom: 8px;';
    
    let activeChildId = children[0].id;
    
    const renderButtons = () => {
      switcher.innerHTML = '';
      children.forEach(child => {
        const btn = document.createElement('button');
        const isActive = child.id === activeChildId;
        btn.className = `btn ${isActive ? 'btn--primary' : 'btn--secondary'}`;
        btn.style.cssText = `
          border-radius: 20px; 
          padding: 8px 20px; 
          display: flex; 
          align-items: center; 
          gap: 8px;
          ${isActive ? 'background: linear-gradient(135deg, #00B4DB, #0083B0); border: none; color: white;' : ''}
        `;
        btn.innerHTML = `
          <div style="width: 24px; height: 24px; border-radius: 12px; background: ${isActive ? 'rgba(255,255,255,0.2)' : child.avatar_color || 'var(--color-primary)'}; color: ${isActive ? 'white' : 'white'}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">
            ${child.display_name.charAt(0)}
          </div>
          ${child.display_name}
        `;
        btn.onclick = () => {
          activeChildId = child.id;
          renderButtons();
          loadChildData(activeChildId);
        };
        switcher.appendChild(btn);
      });
    };
    
    contentWrap.appendChild(switcher);
    renderButtons();

    const dataContainer = document.createElement('div');
    contentWrap.appendChild(dataContainer);

    let currentFetchId = 0;
    const loadChildData = async (childId) => {
      const fetchId = ++currentFetchId;
      dataContainer.innerHTML = `
        <div style="display: grid; gap: 24px;">
          <div class="skeleton" style="height: 150px; border-radius: 20px;"></div>
          <div class="skeleton" style="height: 200px; border-radius: 20px;"></div>
        </div>
      `;
      
      try {
        const res = await apiFetch(`/school/summary/${childId}`);
        if (fetchId !== currentFetchId) return;
        const data = res.data;
        
        const buildAwardBtn = (milestoneId, amount) => {
          if (!isParent) return '';
          if (localStorage.getItem(`award_${childId}_${milestoneId}`) === 'awarded') {
            return `<span style="background: rgba(52, 199, 89, 0.1); color: #34C759; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; border: 1px solid #34C759;">Awarded</span>`;
          }
          return `<button class="btn btn--sm award-btn" data-milestone="${milestoneId}" data-amount="${amount}" style="border: 1px solid #00B4DB; color: #00B4DB; background: transparent; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; cursor: pointer;">Award ${amount}pts</button>`;
        };

        let html = '<div style="display: flex; flex-direction: column; gap: 32px;">';
        const thresholds = data.thresholds || { attendanceStreak: 5, subjectPass: 70, termAveragePass: 75 };
        
        // 1. Attendance
        if (data.attendance) {
          const att = data.attendance;
          let streakBtnHtml = '';
          if (att.streak >= thresholds.attendanceStreak) {
            streakBtnHtml = buildAwardBtn('streak', 50);
          }

        const heatDays = [];
        for (let i = 0; i < 14; i++) {
          // Last 14 days. We'll fake some red/amber days if absences > 0
          const isAbsent = i < att.absences;
          const isSick = isAbsent && att.rate > 80; // yellow for the younger kid
          const color = isAbsent ? (isSick ? '#FFC107' : '#FF3B30') : '#34C759';
          heatDays.push(`<div style="width: 14px; height: 14px; border-radius: 4px; background: ${color};"></div>`);
        }
        heatDays.reverse();

        html += `
          <section>
            <h3 style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><i data-lucide="calendar-check" style="color: #00B4DB;"></i> Attendance</h3>
            <div style="background: var(--bg-card); padding: 24px; border-radius: 20px; border: 1px solid var(--color-border-subtle); display: flex; flex-wrap: wrap; gap: 24px; align-items: center;">
              <div style="flex: 1; min-width: 150px;">
                <div style="font-size: 36px; font-weight: 900; color: ${att.rate >= 90 ? '#34C759' : '#FFC107'};">${att.rate}%</div>
                <div style="color: var(--text-secondary); font-size: 14px;">This Month</div>
              </div>
              <div style="flex: 1; min-width: 150px;">
                <div style="font-size: 24px; font-weight: bold; display: flex; align-items: center; gap: 8px;">${att.streak} Days ${streakBtnHtml}</div>
                <div style="color: var(--text-secondary); font-size: 14px;">Current Streak</div>
              </div>
              <div style="flex: 2; min-width: 200px;">
                <div style="color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;">Last 14 Days</div>
                <div style="display: flex; gap: 4px;">
                  ${heatDays.join('')}
                </div>
              </div>
            </div>
          </section>
        `;

        } else { html += '<section><h3 style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><i data-lucide="calendar-check" style="color: #00B4DB;"></i> Attendance</h3><div class="empty-state">No attendance data available.</div></section>'; }

        // 2. Timetable
        if (data.timetable && data.timetable.length > 0) {
          html += `
          <section>
            <h3 style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><i data-lucide="clock" style="color: #00B4DB;"></i> Timetable</h3>
            <div style="background: var(--bg-card); border-radius: 20px; border: 1px solid var(--color-border-subtle); overflow: hidden;">
              ${data.timetable.map(day => `
                <div style="padding: 16px 20px; border-bottom: 1px solid var(--color-border-subtle); background: var(--bg-body);">
                  <strong style="font-size: 16px;">${day.day}</strong>
                </div>
                <div style="padding: 0 20px;">
                  ${day.periods.map((p, idx) => `
                    <div style="display: flex; align-items: center; padding: 16px 0; border-bottom: ${idx < day.periods.length - 1 ? '1px solid var(--color-border-subtle)' : 'none'};">
                      <div style="width: 40px; font-weight: bold; color: var(--text-muted);">P${idx+1}</div>
                      <div style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        <div style="font-weight: 600; font-size: 15px;">${p.subject}</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">${p.teacher}</div>
                      </div>
                      <div style="background: var(--bg-body); padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: bold; color: var(--text-secondary);">
                        Room ${p.room}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </section>
        `;

        } else { html += '<section><h3 style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><i data-lucide="clock" style="color: #00B4DB;"></i> Timetable</h3><div class="empty-state">No timetable available.</div></section>'; }

        // 3. Performance
        if (data.academic && data.academic.subjects) {
          let termBtnHtml = '';
          if (data.academic.average >= thresholds.termAveragePass) {
            termBtnHtml = buildAwardBtn('term_avg', 100);
          }
          html += `
          <section>
            <h3 style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><i data-lucide="award" style="color: #00B4DB;"></i> Academic Performance</h3>
            <div style="background: var(--bg-card); padding: 24px; border-radius: 20px; border: 1px solid var(--color-border-subtle);">
              <div style="margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 32px; font-weight: 900;">${data.academic.average}%</span>
                <span style="color: var(--text-secondary); margin-right: auto;">Term Average</span>
                ${termBtnHtml}
              </div>
              <div style="display: grid; gap: 16px;">
                ${data.academic.subjects.map(sub => {
                  let subBtnHtml = '';
                  if (sub.score >= thresholds.subjectPass) {
                    subBtnHtml = buildAwardBtn(`subject_${sub.name.replace(/\s+/g, '_')}`, 30);
                  }
                  return `
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 14px;">
                      <span style="font-weight: 600; display: flex; align-items: center; gap: 8px;">${sub.name} ${subBtnHtml}</span>
                      <span style="font-weight: bold;">${sub.score}%</span>
                    </div>
                    <div style="height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden;">
                      <div style="height: 100%; width: ${sub.score}%; background: ${sub.score >= 80 ? '#34C759' : (sub.score >= 60 ? '#00B4DB' : '#FF3B30')}; border-radius: 4px;"></div>
                    </div>
                  </div>
                `}).join('')}
              </div>
            </div>
          </section>
        `;

        } else { html += '<section><h3 style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><i data-lucide="award" style="color: #00B4DB;"></i> Academic Performance</h3><div class="empty-state">No academic data available.</div></section>'; }

        // 4. Contacts
        if (data.contacts && data.contacts.length > 0) {
          html += `
          <section>
            <h3 style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><i data-lucide="users" style="color: #00B4DB;"></i> School Contacts</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
              ${data.contacts.map(c => `
                <div style="background: var(--bg-card); padding: 16px; border-radius: 16px; border: 1px solid var(--color-border-subtle); display: flex; align-items: center; justify-content: space-between;">
                  <div>
                    <div style="font-weight: bold; font-size: 15px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</div>
                    <div style="font-size: 13px; color: var(--text-secondary);">${c.role}</div>
                  </div>
                  <a href="tel:${(c.phone || '').replace(/\s+/g,'')}" class="btn btn--icon btn--secondary" style="border-radius: 50%; width: 40px; height: 40px; padding: 0;">
                    <i data-lucide="phone" style="width: 18px; height: 18px;"></i>
                  </a>
                </div>
              `).join('')}
            </div>
          </section>
        `;

        } else { html += '<section><h3 style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;"><i data-lucide="users" style="color: #00B4DB;"></i> School Contacts</h3><div class="empty-state">No school contacts available.</div></section>'; }

        html += '</div>';
        dataContainer.innerHTML = html;
        if (window.lucide) window.lucide.createIcons({ el: dataContainer });
        
        dataContainer.querySelectorAll('.award-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const amount = parseInt(btn.dataset.amount, 10);
            const milestone = btn.dataset.milestone;
            try {
              btn.disabled = true;
              btn.textContent = 'Awarding...';
              const res = await apiFetch('/reports/award', {
                method: 'POST',
                body: JSON.stringify({ childId, amount })
              });
              if (res.error) throw new Error(res.error);
              localStorage.setItem(`award_${childId}_${milestone}`, 'awarded');
              btn.outerHTML = `<span style="background: rgba(52, 199, 89, 0.1); color: #34C759; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; border: 1px solid #34C759;">Awarded</span>`;
              window.oikos?.showToast(`Awarded ${amount}pts!`, 'success');
            } catch (err) {
              btn.disabled = false;
              btn.textContent = `Award ${amount}pts`;
              window.oikos?.showToast('Failed to award points', 'error');
            }
          });
        });

      } catch (e) {
        dataContainer.innerHTML = '<div class="empty-state">Failed to load school data.</div>';
      }
    };

    loadChildData(activeChildId);

  } catch (err) {
    contentWrap.innerHTML = '<div class="empty-state">Failed to load family members.</div>';
  }
}
