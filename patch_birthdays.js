function renderChildPage() {
  const myBday = state.birthdays.find(b => b.family_user_id === state.currentUser.id) || state.birthdays.find(b => b.name === state.currentUser.display_name);
  
  if (!myBday) {
    _container.replaceChildren();
    _container.insertAdjacentHTML('beforeend', `
      <div class="birthdays-page" style="text-align: center; padding: 40px;">
        <h1 style="font-size: 24px; color: var(--color-primary);">🎂 Your Birthday</h1>
        <p style="color: var(--text-secondary);">Your parent hasn't linked your birthday yet!</p>
      </div>
    `);
    return;
  }

  const daysUntil = myBday.days_until;
  const progressPct = Math.max(0, Math.min(100, 100 - (daysUntil / 365) * 100));
  const points = state.currentUser.points || 0;
  const streak = state.currentUser.current_streak || 0;

  _container.replaceChildren();
  _container.insertAdjacentHTML('beforeend', `
    <div class="child-birthday-dashboard">
      <style>
        .child-birthday-dashboard {
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
          font-family: system-ui, sans-serif;
          animation: fade-in 0.4s ease-out;
        }
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        /* 1. Core Panel */
        .cb-core-panel {
          background: linear-gradient(135deg, var(--color-primary), var(--color-accent, #FF9500));
          border-radius: 24px;
          padding: 40px 20px;
          text-align: center;
          color: white;
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
          position: relative;
          overflow: hidden;
          margin-bottom: 24px;
        }
        .cb-core-panel::before {
          content: '🎉';
          position: absolute;
          font-size: 100px;
          opacity: 0.1;
          top: -20px;
          left: -10px;
          transform: rotate(-15deg);
        }
        .cb-core-title { font-size: 18px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; opacity: 0.9; margin-bottom: 8px; }
        .cb-core-days { font-size: 64px; font-weight: 900; line-height: 1; text-shadow: 0 4px 10px rgba(0,0,0,0.2); margin-bottom: 20px; }
        .cb-progress-wrap { background: rgba(255,255,255,0.2); height: 12px; border-radius: 6px; overflow: hidden; margin: 0 auto; max-width: 80%; }
        .cb-progress-fill { background: white; height: 100%; width: ${progressPct}%; transition: width 1s ease-in-out; border-radius: 6px; box-shadow: 0 0 10px rgba(255,255,255,0.8); }

        /* Generic Section */
        .cb-section {
          background: var(--color-surface, #fff);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 24px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          border: 1px solid var(--color-border-subtle, #eee);
        }
        .cb-section-title { font-size: 18px; font-weight: 700; color: var(--text-main, #333); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        
        /* 2. Milestones */
        .cb-milestone-track { display: flex; flex-direction: column; gap: 12px; }
        .cb-milestone {
          display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 12px;
          background: var(--bg-wash, #f9f9f9);
          border: 1px solid var(--color-border-subtle, #eee);
        }
        .cb-milestone.unlocked { background: rgba(52, 199, 89, 0.1); border-color: #34C759; }
        .cb-milestone-icon { font-size: 24px; background: white; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .cb-milestone-text { flex: 1; }
        .cb-milestone-text strong { display: block; font-size: 15px; color: var(--text-main, #333); }
        .cb-milestone-text span { font-size: 13px; color: var(--text-secondary, #666); }

        /* 3. Progress Stats */
        .cb-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .cb-stat-card { background: var(--bg-wash, #f9f9f9); padding: 16px; border-radius: 12px; text-align: center; }
        .cb-stat-value { font-size: 28px; font-weight: 800; color: var(--color-primary); margin-bottom: 4px; }
        .cb-stat-label { font-size: 13px; color: var(--text-secondary, #666); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }

        /* 4. Family & Timeline */
        .cb-family-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
        .cb-family-avatar { width: 50px; height: 50px; border-radius: 50%; background: var(--color-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        
        .cb-timeline { border-left: 2px solid var(--color-border-subtle, #eee); margin-left: 10px; padding-left: 20px; display: flex; flex-direction: column; gap: 16px; }
        .cb-timeline-item { position: relative; font-size: 14px; color: var(--text-secondary, #666); }
        .cb-timeline-item::before { content: ''; position: absolute; left: -26px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--color-border-subtle, #eee); border: 2px solid white; box-shadow: 0 0 0 1px var(--color-border-subtle, #eee); }
        .cb-timeline-item.active { color: var(--text-main, #333); font-weight: 600; }
        .cb-timeline-item.active::before { background: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); border-color: white; }
      </style>

      <!-- 1. Countdown Core Panel -->
      <div class="cb-core-panel">
        <div class="cb-core-title">The Big Day Is Coming!</div>
        <div class="cb-core-days">${daysUntil === 0 ? 'IT\\'S TODAY!' : daysUntil === 1 ? '1 DAY LEFT!' : daysUntil + ' DAYS LEFT'}</div>
        <div class="cb-progress-wrap">
          <div class="cb-progress-fill"></div>
        </div>
      </div>

      <!-- 3. Personal Progress Layer -->
      <div class="cb-section">
        <div class="cb-section-title">⭐ Your Progress Tracker</div>
        <div class="cb-stats-grid">
          <div class="cb-stat-card">
            <div class="cb-stat-value">${points}</div>
            <div class="cb-stat-label">Total Points</div>
          </div>
          <div class="cb-stat-card">
            <div class="cb-stat-value">${streak} 🔥</div>
            <div class="cb-stat-label">Day Streak</div>
          </div>
        </div>
      </div>

      <!-- 2. Reward Milestone Track -->
      <div class="cb-section">
        <div class="cb-section-title">🎁 Birthday Reward Path</div>
        <div class="cb-milestone-track">
          <div class="cb-milestone ${points >= 100 ? 'unlocked' : ''}">
            <div class="cb-milestone-icon">${points >= 100 ? '🔓' : '🔒'}</div>
            <div class="cb-milestone-text">
              <strong>${points >= 100 ? 'Bronze Gift Unlocked!' : 'Reach 100 Points'}</strong>
              <span>Small birthday surprise guaranteed</span>
            </div>
          </div>
          <div class="cb-milestone ${points >= 300 ? 'unlocked' : ''}">
            <div class="cb-milestone-icon">${points >= 300 ? '🔓' : '🔒'}</div>
            <div class="cb-milestone-text">
              <strong>${points >= 300 ? 'Silver Gift Unlocked!' : 'Reach 300 Points'}</strong>
              <span>Medium birthday surprise guaranteed</span>
            </div>
          </div>
          <div class="cb-milestone ${points >= 500 ? 'unlocked' : ''}">
            <div class="cb-milestone-icon">${points >= 500 ? '🔓' : '🔒'}</div>
            <div class="cb-milestone-text">
              <strong>${points >= 500 ? 'Gold Gift Unlocked!' : 'Reach 500 Points'}</strong>
              <span>The ultimate birthday surprise!</span>
            </div>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;">
        <!-- 4. Birthday Preview Card -->
        <div class="cb-section" style="margin-bottom: 0;">
          <div class="cb-section-title">🎉 Celebrating With You</div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 0; margin-bottom: 12px;">These family members are getting ready to celebrate!</p>
          <div class="cb-family-row">
            ${state.birthdays.filter(b => b.id !== myBday.id).slice(0, 4).map(b => `
              <div class="cb-family-avatar" title="${b.name}">
                ${b.name.charAt(0).toUpperCase()}
              </div>
            `).join('')}
            ${state.birthdays.length <= 1 ? '<span style="font-size: 13px; color: var(--text-muted); align-self: center;">Your whole family!</span>' : ''}
          </div>
          <div style="margin-top: 16px; padding: 12px; background: var(--bg-wash); border-radius: 8px; border: 1px dashed var(--color-primary); text-align: center;">
            <div style="font-size: 20px; margin-bottom: 4px;">🤫</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--color-primary);">Gift hint: It's a secret!</div>
          </div>
        </div>

        <!-- 5. Reminder Timeline -->
        <div class="cb-section" style="margin-bottom: 0;">
          <div class="cb-section-title">🔔 Countdown Timeline</div>
          <div class="cb-timeline">
            <div class="cb-timeline-item ${daysUntil <= 3 ? 'active' : ''}">3 days left: Family gets notified</div>
            <div class="cb-timeline-item ${daysUntil <= 1 ? 'active' : ''}">1 day left: Final preparations!</div>
            <div class="cb-timeline-item ${daysUntil === 0 ? 'active' : ''}">Today: The Big Celebration 🎈</div>
          </div>
        </div>
      </div>
    </div>
  `);
}
