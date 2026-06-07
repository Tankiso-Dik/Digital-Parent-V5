import { api } from '/api.js';
import { openModal as openSharedModal, closeModal, confirmModal } from '/components/modal.js';
import { stagger, deleteWithUndo } from '/utils/ux.js';
import { t, formatDate, dateInputPlaceholder, formatDateInput, parseDateInput, isDateInputValid } from '/i18n.js';
import { esc } from '/utils/html.js';

let state = {
  birthdays: [],
  upcoming: [],
  query: '',
};
let _container = null;

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

const REMINDER_OFFSETS = () => [
  { value: '',     label: t('reminders.offsetNone')   },
  { value: '0',    label: t('reminders.offsetAtTime') },
  { value: '15',   label: t('reminders.offset15min')  },
  { value: '60',   label: t('reminders.offset1hour')  },
  { value: '1440', label: t('reminders.offset1day')   },
  { value: '2880', label: t('reminders.offset2days')  },
  { value: '10080', label: t('reminders.offset1week') },
  { value: '20160', label: t('reminders.offset2weeks') },
  { value: 'custom', label: t('reminders.offsetCustom') },
];

function renderBirthdayReminderSection(birthday = null) {
  const currentOffset = birthday?.reminder_offset ?? '0';
  const customAmount = birthday?.reminder_custom_amount || 1;
  const customUnit = birthday?.reminder_custom_unit || 'days';
  return `
    <div class="reminder-section">
      <div class="form-group" style="margin:0">
        <label class="form-label" for="bd-reminder-offset">${t('reminders.offsetLabel')}</label>
        <select class="form-input" id="bd-reminder-offset" style="min-height:44px">
          ${REMINDER_OFFSETS().map((o) =>
            `<option value="${o.value}" ${currentOffset === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="modal-grid modal-grid--2 reminder-custom" id="bd-reminder-custom" ${currentOffset === 'custom' ? '' : 'hidden'}>
        <div class="form-group" style="margin:0">
          <label class="form-label" for="bd-reminder-custom-amount">${t('reminders.customAmountLabel')}</label>
          <input class="form-input" type="number" id="bd-reminder-custom-amount" min="1" max="999" value="${customAmount}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" for="bd-reminder-custom-unit">${t('reminders.customUnitLabel')}</label>
          <select class="form-input" id="bd-reminder-custom-unit">
            <option value="minutes" ${customUnit === 'minutes' ? 'selected' : ''}>${t('reminders.customMinutes')}</option>
            <option value="hours" ${customUnit === 'hours' ? 'selected' : ''}>${t('reminders.customHours')}</option>
            <option value="days" ${customUnit === 'days' ? 'selected' : ''}>${t('reminders.customDays')}</option>
            <option value="weeks" ${customUnit === 'weeks' ? 'selected' : ''}>${t('reminders.customWeeks')}</option>
          </select>
        </div>
      </div>
    </div>`;
}

function ageNote(birthday) {
  if (birthday.days_until === 0) return t('birthdays.ageNoteToday', { age: birthday.next_age });
  if (birthday.days_until === 1) return t('birthdays.ageNoteTomorrow', { age: birthday.next_age });
  return t('birthdays.ageNoteDays', { age: birthday.next_age, days: birthday.days_until });
}

function photoAvatar(birthday, extraClass = '') {
  if (birthday.photo_data) {
    return `<img class="birthday-avatar ${extraClass}" src="${birthday.photo_data}" alt="${esc(birthday.name)}">`;
  }
  return `<span class="birthday-avatar birthday-avatar--fallback ${extraClass}">${esc(initials(birthday.name))}</span>`;
}

function filteredBirthdays() {
  const q = state.query.trim().toLowerCase();
  const list = !q ? state.birthdays : state.birthdays.filter((birthday) =>
    birthday.name.toLowerCase().includes(q) ||
    (birthday.notes || '').toLowerCase().includes(q)
  );
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

function suggestions() {
  const q = state.query.trim().toLowerCase();
  if (!q) return [];
  return state.birthdays
    .filter((birthday) => birthday.name.toLowerCase().includes(q))
    .slice(0, 6);
}

async function loadData() {
  const [allRes, upcomingRes] = await Promise.all([
    api.get('/birthdays'),
    api.get('/birthdays/upcoming?limit=4'),
  ]);
  state.birthdays = allRes.data ?? [];
  state.upcoming = upcomingRes.data ?? [];
  updateBirthdayBadge();
}

function updateBirthdayBadge() {
  const soon = state.upcoming.filter((b) => b.days_until <= 3).length;
  document.querySelectorAll('[data-route="/birthdays"] .nav-badge').forEach((el) => el.remove());
  if (!soon) return;
  document.querySelectorAll('[data-route="/birthdays"]').forEach((navItem) => {
    let anchor = navItem.querySelector('.nav-item__icon-wrap');
    if (!anchor) {
      const icon = navItem.querySelector('.nav-item__icon');
      anchor = document.createElement('span');
      anchor.className = 'nav-item__icon-wrap';
      if (icon) { icon.replaceWith(anchor); anchor.appendChild(icon); }
      else navItem.prepend(anchor);
    }
    const badge = document.createElement('span');
    badge.className = 'nav-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = String(soon);
    anchor.appendChild(badge);
  });
}

function renderSuggestions() {
  const dropdown = _container.querySelector('#birthdays-autocomplete');
  if (!dropdown) return;
  const items = suggestions();
  if (!items.length) {
    dropdown.hidden = true;
    dropdown.replaceChildren();
    return;
  }
  dropdown.hidden = false;
  dropdown.replaceChildren();
  dropdown.insertAdjacentHTML('beforeend', items.map((birthday, idx) => `
    <button class="birthday-suggestion" type="button" data-index="${idx}" data-name="${esc(birthday.name)}">
      ${photoAvatar(birthday, 'birthday-avatar--xs')}
      <span>
        <strong>${esc(birthday.name)}</strong>
        <small>${esc(ageNote(birthday))}</small>
      </span>
    </button>
  `).join(''));
}

function renderUpcoming() {
  const host = _container.querySelector('#birthdays-upcoming');
  if (!host) return;
  if (!state.upcoming.length) {
    host.replaceChildren();
    host.insertAdjacentHTML('beforeend', `<div class="empty-state empty-state--compact">
      <div class="empty-state__title">${t('birthdays.emptyTitle')}</div>
      <div class="empty-state__description">${t('birthdays.emptyDescription')}</div>
    </div>`);
    return;
  }
  host.replaceChildren();
  host.insertAdjacentHTML('beforeend', state.upcoming.map((birthday) => `
    <article class="birthday-card">
      <div class="birthday-card__media">${photoAvatar(birthday)}</div>
      <div class="birthday-card__body">
        <div class="birthday-card__top">
          <div>
            <div class="birthday-card__name">${esc(birthday.name)}</div>
            <div class="birthday-card__date">${esc(formatDate(birthday.next_birthday))}</div>
          </div>
          <div class="birthday-card__pill">
            ${birthday.days_until === 0 ? esc(t('common.today')) : birthday.days_until === 1 ? esc(t('common.tomorrow')) : esc(`${birthday.days_until}d`)}
          </div>
        </div>
        <div class="birthday-card__note">${esc(ageNote(birthday))}</div>
      </div>
    </article>
  `).join(''));
}

function renderList() {
  const host = _container.querySelector('#birthdays-list');
  if (!host) return;
  const list = filteredBirthdays();
  if (!list.length) {
    host.replaceChildren();
    host.insertAdjacentHTML('beforeend', `<div class="empty-state">
      <div class="empty-state__title">${t('birthdays.emptyTitle')}</div>
      <div class="empty-state__description">${t('birthdays.emptyDescription')}</div>
      <p class="empty-state__hint">${t('emptyHint.birthdays')}</p>
    </div>`);
    return;
  }

  host.replaceChildren();
  host.insertAdjacentHTML('beforeend', list.map((birthday) => `
    <article class="birthday-item" data-id="${birthday.id}">
      <div class="birthday-item__media">${photoAvatar(birthday)}</div>
      <div class="birthday-item__body">
        <div class="birthday-item__row">
          <strong class="birthday-item__name">${esc(birthday.name)}</strong>
          <span class="birthday-item__next">${esc(formatDate(birthday.next_birthday))}</span>
        </div>
        <div class="birthday-item__meta">${esc(formatDate(birthday.birth_date))}</div>
        <div class="birthday-item__note">${esc(ageNote(birthday))}</div>
        ${birthday.notes ? `<div class="birthday-item__notes">${esc(birthday.notes)}</div>` : ''}
      </div>
      <div class="birthday-item__actions">
        <button class="contact-action-btn" type="button" data-action="edit" data-id="${birthday.id}" aria-label="${t('common.edit')}">
          <i data-lucide="pencil" style="width:16px;height:16px;" aria-hidden="true"></i>
        </button>
        <button class="contact-action-btn" type="button" data-action="delete" data-id="${birthday.id}" aria-label="${t('common.delete')}">
          <i data-lucide="trash-2" style="width:16px;height:16px;" aria-hidden="true"></i>
        </button>
      </div>
    </article>
  `).join(''));

  if (window.lucide) window.lucide.createIcons({ el: host });
  stagger(host.querySelectorAll('.birthday-item'));
}

function renderPage() {
  _container.replaceChildren();
  _container.insertAdjacentHTML('beforeend', `
    <div class="birthdays-page">
      <h1 class="sr-only">${t('birthdays.title')}</h1>
      <div class="birthdays-toolbar">
        <div class="birthdays-toolbar__title">
          <i data-lucide="cake" class="birthdays-toolbar__title-icon" aria-hidden="true"></i>
          <span>${t('birthdays.title')}</span>
        </div>
        <button class="btn btn--primary birthdays-header__action" id="birthdays-add-btn">
          <i data-lucide="plus" style="width:16px;height:16px;margin-right:4px;" aria-hidden="true"></i>
          ${t('birthdays.addButton')}
        </button>
      </div>
      <p class="birthdays-toolbar__subtitle">${t('birthdays.calendarHint')}</p>

      <div class="birthdays-grid">
        <aside class="birthdays-panel birthdays-panel--upcoming">
          <div class="birthdays-section__header">
            <h3>${t('birthdays.upcomingTitle')}</h3>
            <p>${t('birthdays.upcomingHint')}</p>
          </div>
          <div class="birthday-cards" id="birthdays-upcoming"></div>
        </aside>

        <section class="birthdays-panel birthdays-panel--list">
          <div class="birthdays-toolbar birthdays-toolbar--embedded">
            <div class="birthdays-toolbar__search">
              <i data-lucide="search" class="birthdays-toolbar__search-icon" aria-hidden="true"></i>
              <input type="search" class="birthdays-toolbar__search-input" id="birthdays-search"
                     placeholder="${t('birthdays.searchPlaceholder')}" autocomplete="off" value="${esc(state.query)}">
              <div class="autocomplete-dropdown birthdays-autocomplete" id="birthdays-autocomplete" hidden></div>
            </div>
          </div>
          <div class="birthdays-section__header birthdays-section__header--spaced">
            <h3>${t('birthdays.peopleTitle')}</h3>
            <p>${t('birthdays.peopleHint')}</p>
          </div>
          <div class="birthdays-list" id="birthdays-list"></div>
        </section>
      </div>

      <button class="page-fab" id="fab-new-birthday" aria-label="${t('birthdays.addButton')}">
        <i data-lucide="plus" style="width:24px;height:24px" aria-hidden="true"></i>
      </button>
    </div>
  `);

  renderUpcoming();
  renderList();
  renderSuggestions();
  if (window.lucide) window.lucide.createIcons({ el: _container });
}

function bindEvents() {
  const openCreate = () => openBirthdayModal({ mode: 'create' });
  _container.querySelector('#birthdays-add-btn').addEventListener('click', openCreate);
  _container.querySelector('#fab-new-birthday').addEventListener('click', openCreate);

  const search = _container.querySelector('#birthdays-search');
  search.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderSuggestions();
    renderList();
  });
  search.addEventListener('focus', renderSuggestions);
  search.addEventListener('blur', () => {
    setTimeout(() => {
      const dropdown = _container.querySelector('#birthdays-autocomplete');
      if (dropdown) dropdown.hidden = true;
    }, 100);
  });

  _container.querySelector('#birthdays-autocomplete').addEventListener('click', (e) => {
    const btn = e.target.closest('.birthday-suggestion');
    if (!btn) return;
    state.query = btn.dataset.name;
    search.value = state.query;
    renderList();
    renderSuggestions();
  });

  _container.querySelector('#birthdays-list').addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const id = Number(action.dataset.id);
    const birthday = state.birthdays.find((item) => item.id === id);
    if (!birthday) return;
    if (action.dataset.action === 'edit') {
      openBirthdayModal({ mode: 'edit', birthday });
      return;
    }
    if (action.dataset.action === 'delete') {
      await deleteBirthday(id, birthday.name);
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(file);
  });
}

function birthdayPreviewHtml(name, photoData) {
  if (photoData) return `<img class="birthday-preview__image" src="${photoData}" alt="${esc(name || '')}">`;
  return `<span class="birthday-preview__fallback">${esc(initials(name))}</span>`;
}

function openBirthdayModal({ mode, birthday = null }) {
  const isEdit = mode === 'edit';
  let photoData = birthday?.photo_data || null;

  openSharedModal({
    title: isEdit ? t('birthdays.editTitle') : t('birthdays.newTitle'),
    content: `
      <div class="birthday-modal">
        <div class="birthday-modal__identity">
          <div class="birthday-modal__photo-wrap">
            <button type="button" class="birthday-avatar-editor" id="birthday-preview" aria-label="${t('birthdays.photoLabel')}">
              ${birthdayPreviewHtml(birthday?.name || '', photoData)}
            </button>
            <input class="sr-only" id="bd-photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
            <div class="birthday-modal__photo-actions">
              <button type="button" class="birthday-modal__photo-action" id="bd-photo-edit" aria-label="${t('birthdays.photoLabel')}" title="${t('birthdays.photoLabel')}">
                <i data-lucide="pencil" aria-hidden="true"></i>
              </button>
              <button type="button" class="birthday-modal__photo-action birthday-modal__photo-action--danger" id="bd-remove-photo" aria-label="${t('birthdays.removePhoto')}" title="${t('birthdays.removePhoto')}">
                <i data-lucide="trash-2" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="birthday-modal__fields">
            <div class="form-group">
              <label class="form-label" for="bd-name">${t('birthdays.nameLabel')}</label>
              <input class="form-input" id="bd-name" type="text" value="${esc(birthday?.name || '')}" autocomplete="name">
            </div>
            <div class="form-group">
              <label class="form-label" for="bd-birth-date">${t('birthdays.birthDateLabel')}</label>
              <input class="form-input" id="bd-birth-date" type="date" value="${esc(birthday?.birth_date || '')}">
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="bd-notes">${t('birthdays.notesLabel')}</label>
          <textarea class="form-input" id="bd-notes" rows="3" placeholder="${t('birthdays.notesPlaceholder')}">${esc(birthday?.notes || '')}</textarea>
        </div>
        ${renderBirthdayReminderSection(birthday)}
        <div class="birthday-modal__hint">${t('birthdays.calendarHint')}</div>
        <div class="modal-panel__footer" style="border:none;padding:0;margin-top:var(--space-4)">
          ${isEdit ? `<button class="btn btn--danger" id="bd-delete">${t('common.delete')}</button>` : '<div></div>'}
          <div style="display:flex;gap:var(--space-3);">
            <button class="btn btn--secondary" type="button" id="bd-cancel">${t('common.cancel')}</button>
            <button class="btn btn--primary" type="button" id="bd-save">${isEdit ? t('common.save') : t('common.create')}</button>
          </div>
        </div>
      </div>
    `,
    size: 'md',
    onSave(panel) {
      const nameInput = panel.querySelector('#bd-name');
      const preview = panel.querySelector('#birthday-preview');
      const fileInput = panel.querySelector('#bd-photo');
      const photoEdit = panel.querySelector('#bd-photo-edit');
      const renderPreview = () => {
        preview.replaceChildren();
        preview.insertAdjacentHTML('beforeend', birthdayPreviewHtml(nameInput.value.trim(), photoData));
      };
      nameInput.addEventListener('input', renderPreview);
      preview.addEventListener('click', () => fileInput?.click());
      photoEdit?.addEventListener('click', () => fileInput?.click());
      fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          photoData = await readFileAsDataUrl(file);
          renderPreview();
        } catch (err) {
          window.oikos?.showToast(err.message, 'danger');
        }
      });
      panel.querySelector('#bd-remove-photo').addEventListener('click', () => {
        photoData = null;
        if (fileInput) fileInput.value = '';
        renderPreview();
      });

      const reminderOffset = panel.querySelector('#bd-reminder-offset');
      const reminderCustom = panel.querySelector('#bd-reminder-custom');
      reminderOffset?.addEventListener('change', () => {
        if (reminderCustom) reminderCustom.hidden = reminderOffset.value !== 'custom';
      });

      panel.querySelector('#bd-cancel').addEventListener('click', closeModal);
      panel.querySelector('#bd-delete')?.addEventListener('click', async () => {
        closeModal();
        await deleteBirthday(birthday.id, birthday.name);
      });
      panel.querySelector('#bd-save').addEventListener('click', async () => {
        const saveBtn = panel.querySelector('#bd-save');
        const birthDateRaw = panel.querySelector('#bd-birth-date').value;
        const birthDate = parseDateInput(birthDateRaw);
        const body = {
          name: panel.querySelector('#bd-name').value.trim(),
          birth_date: birthDate,
          notes: panel.querySelector('#bd-notes').value.trim(),
          photo_data: photoData,
          reminder_offset: panel.querySelector('#bd-reminder-offset').value,
          reminder_custom_amount: panel.querySelector('#bd-reminder-custom-amount').value,
          reminder_custom_unit: panel.querySelector('#bd-reminder-custom-unit').value,
        };

        if (!body.name || !body.birth_date || !isDateInputValid(birthDateRaw)) {
          window.oikos?.showToast(t('birthdays.requiredFields'), 'warning');
          return;
        }

        saveBtn.disabled = true;
        try {
          if (isEdit) {
            const res = await api.put(`/birthdays/${birthday.id}`, body);
            const idx = state.birthdays.findIndex((item) => item.id === birthday.id);
            if (idx !== -1) state.birthdays[idx] = res.data;
            window.oikos?.showToast(t('birthdays.updatedToast'), 'success');
          } else {
            const res = await api.post('/birthdays', body);
            state.birthdays.push(res.data);
            window.oikos?.showToast(t('birthdays.createdToast'), 'success');
          }
          state.birthdays.sort((a, b) => a.name.localeCompare(b.name));
          const upcomingRes = await api.get('/birthdays/upcoming?limit=4');
          state.upcoming = upcomingRes.data ?? [];
          renderUpcoming();
          renderSuggestions();
          renderList();
          closeModal({ force: true });
        } catch (err) {
          window.oikos?.showToast(err.message, 'danger');
          saveBtn.disabled = false;
        }
      });
    },
  });
}

async function deleteBirthday(id, name) {
  if (!await confirmModal(t('birthdays.deleteConfirm', { name }), { danger: true, confirmLabel: t('common.delete') })) return;
  const birthday = state.birthdays.find((b) => b.id === id);
  state.birthdays = state.birthdays.filter((b) => b.id !== id).sort((a, b) => a.name.localeCompare(b.name));
  state.upcoming = state.upcoming.filter((b) => b.id !== id);
  renderUpcoming();
  renderSuggestions();
  renderList();
  await deleteWithUndo({
    onDelete: async () => { await api.delete(`/birthdays/${id}`); },
    onUndo: async () => {
      if (birthday) {
        state.birthdays = [...state.birthdays, birthday].sort((a, b) => a.name.localeCompare(b.name));
        state.upcoming = [...state.upcoming, birthday];
        renderUpcoming();
        renderSuggestions();
        renderList();
      }
    },
    toastMessage: t('birthdays.deletedToast'),
    toastType: 'success',
  });
}

function renderChildPage() {
  const myBday = state.birthdays.find(b => b.family_user_id === state.currentUser?.id) || state.birthdays.find(b => b.name === state.currentUser?.display_name);
  
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
  const points = state.currentUser?.points || 0;
  const streak = state.currentUser?.current_streak || 0;

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
        <div class="cb-core-days">${daysUntil === 0 ? "IT'S TODAY!" : daysUntil === 1 ? '1 DAY LEFT!' : daysUntil + ' DAYS LEFT'}</div>
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

export async function render(container, props) {
  _container = container;
  state.currentUser = props?.user;
  await loadData();
  
  if (state.currentUser?.family_role === 'child') {
    renderChildPage();
  } else {
    renderPage();
    bindEvents();
  }
}
