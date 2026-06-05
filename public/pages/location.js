import { apiFetch } from '../api.js';
const showToast = (msg, type) => window.oikos?.showToast(msg, type);

export async function render(container, { user }) {
  const isParent = user.role === 'admin' || ['dad', 'mom', 'parent', 'grandparent'].includes(user.family_role);

  const wrapper = document.createElement('div');
  wrapper.className = 'location-page';

  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page__title';
  title.textContent = isParent ? 'Manage Locations & Monitor' : 'My Current Location';
  header.appendChild(title);
  wrapper.appendChild(header);

  const layout = document.createElement('div');
  layout.style.cssText = 'display: flex; gap: 20px; flex-wrap: wrap;';
  
  const mapEl = document.createElement('div');
  mapEl.id = 'map';
  mapEl.className = 'glass';
  mapEl.style.cssText = 'height: 500px; flex: 1; min-width: 300px; border-radius: 12px; border: 1px solid var(--color-border-subtle);';
  
  const sidebar = document.createElement('div');
  sidebar.className = 'location-sidebar card card--padded glass';
  sidebar.style.cssText = 'width: 300px; flex-shrink: 0;';
  
  layout.appendChild(mapEl);
  layout.appendChild(sidebar);
  wrapper.appendChild(layout);

  container.replaceChildren(wrapper);

  const map = L.map(mapEl).setView([-23.8969939, 29.4488468], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  
  // Fix for Leaflet grey tile issue when rendering inside dynamic containers
  setTimeout(() => map.invalidateSize(), 100);

  let familyZones = [];
  const zoneMarkers = [];
  const childMarkers = new Map();

  async function loadZones() {
    try {
      const res = await apiFetch('/location/zones');
      familyZones = res.data || [];
      renderZones();
      renderSidebar();
    } catch(e) {
      console.error('Failed to load zones', e);
    }
  }

  function renderZones() {
    zoneMarkers.forEach(m => map.removeLayer(m));
    zoneMarkers.length = 0;
    
    familyZones.forEach(z => {
      let color = 'blue';
      if (z.zone_type === 'safe' || z.zone_type === 'park') color = 'green';
      if (z.zone_type === 'danger') color = 'red';
      
      const circle = L.circle([z.lat, z.lng], { color, radius: 250, fillOpacity: 0.2 })
        .addTo(map)
        .bindPopup(`<b>${z.name}</b><br>${z.zone_type.toUpperCase()}`);
      zoneMarkers.push(circle);
    });
  }

  function renderSidebar() {
    sidebar.innerHTML = '';
    
    if (isParent) {
      sidebar.innerHTML = `
        <h3>📍 Family Zones</h3>
        <p class="text-secondary" style="font-size: var(--text-sm); margin-bottom: 15px;">
          Click the map to add a School, Park or Danger Zone.
        </p>
        <div id="zones-list" style="margin-bottom: 20px;"></div>
        <hr style="margin: 15px 0; border: none; border-top: 1px solid var(--color-border-subtle);">
        <h3>👀 Children Status</h3>
        <div id="child-status-list">Waiting for updates...</div>
      `;
      
      const zonesList = sidebar.querySelector('#zones-list');
      familyZones.forEach(z => {
        const item = document.createElement('div');
        item.className = 'glass';
        item.style.cssText = 'padding: 8px; border-radius: 6px; margin-bottom: 5px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;';
        item.innerHTML = `
          <span><b>${z.name}</b> (${z.zone_type})</span>
        `;
        const gotoBtn = document.createElement('button');
        gotoBtn.className = 'btn btn--ghost btn--sm';
        gotoBtn.innerHTML = '🎯';
        gotoBtn.onclick = () => map.setView([z.lat, z.lng], 17);
        item.appendChild(gotoBtn);
        zonesList.appendChild(item);
      });
    } else {
      sidebar.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <h3 style="margin-bottom: 10px;">🛡️ Safety Center</h3>
          <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 24px;">Your location is shared with your parents for safety.</p>
          
          <button id="sos-btn" class="btn" style="width: 100%; padding: 24px; background: #FF3B30; color: white; border: none; border-radius: 16px; font-weight: 900; font-size: 18px; box-shadow: 0 8px 20px rgba(255,59,48,0.3); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <i data-lucide="megaphone" style="width: 32px; height: 32px;"></i>
            SEND SOS SIGNAL
          </button>
          
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 16px;">Only use in case of actual emergency.</p>
        </div>
      `;

      const sosBtn = sidebar.querySelector('#sos-btn');
      sosBtn.onclick = async () => {
        if (!confirm('Are you sure you want to send a CRITICAL SOS signal to your parents?')) return;
        try {
          await apiFetch('/reports/emergency', { 
            method: 'POST', 
            body: JSON.stringify({ 
              app_type: 'emergency', 
              reason: 'Child triggered manual SOS signal from location map.',
              request_type: 'sos'
            }) 
          });
          showToast('SOS SIGNAL SENT!', 'success');
          sosBtn.style.animation = 'pulse-red 1s infinite';
          sosBtn.innerHTML = '<i data-lucide="alert-triangle"></i> SOS ACTIVE';
          if (window.lucide) window.lucide.createIcons({ el: sosBtn });
        } catch (err) {
          showToast('Failed to send SOS', 'danger');
        }
      };
    }
  }

  // Parent clicking map to add zone
  if (isParent) {
    map.on('click', async (e) => {
      const name = prompt("Enter a name for this zone (e.g. High School, Uncle's House):");
      if (!name) return;
      
      const typeStr = prompt("Enter zone type ('school', 'safe', or 'danger'):", "safe");
      if (!['school', 'safe', 'danger'].includes(typeStr)) {
        alert("Invalid type. Must be school, safe, or danger.");
        return;
      }
      
      try {
        await apiFetch('/location/zones', {
          method: 'POST',
          body: JSON.stringify({ name, lat: e.latlng.lat, lng: e.latlng.lng, zone_type: typeStr })
        });
        showToast('Zone defined successfully!', 'success');
        loadZones();
      } catch(err) {
        showToast('Failed to save zone.', 'error');
      }
    });
  }

  async function refreshLocations() {
    try {
      const res = await apiFetch('/location');
      const data = res.data || [];
      
      const statusListEl = container.querySelector('#child-status-list');
      if (statusListEl && data.length > 0) {
        statusListEl.innerHTML = '';
        data.forEach(loc => {
          const isDanger = loc.location_type === 'danger';
          const isUnknown = loc.location_type === 'unknown' || !loc.location_type;
          const displayType = loc.zone_name || (isUnknown ? 'TRANSIT / OUTSIDE ZONES' : loc.location_type.toUpperCase());

          const item = document.createElement('div');
          item.className = `child-status-item glass ${isDanger ? 'child-status-item--danger' : ''}`;
          item.style.cssText = 'padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid var(--color-border-subtle);';
          item.innerHTML = `
            <div style="display:flex; justify-content: space-between;">
              <b style="${isDanger ? 'color: var(--color-danger);' : ''}">${loc.display_name}</b>
              <small class="text-secondary">${new Date(loc.updated_at).toLocaleTimeString()}</small>
            </div>
            <div class="text-secondary" style="font-size: 12px; margin-top: 4px;">Zone: ${displayType}</div>
          `;
          statusListEl.appendChild(item);
        });
      }

      data.forEach(loc => {
        if (loc.lat && loc.lng) {
          if (childMarkers.has(loc.user_id)) {
            childMarkers.get(loc.user_id).remove();
          }
          const isUnknown = loc.location_type === 'unknown' || !loc.location_type;
          const displayType = loc.zone_name || (isUnknown ? 'Transit' : loc.location_type);
          
          const m = L.marker([loc.lat, loc.lng]).addTo(map)
            .bindPopup(`<b>${loc.display_name || 'Child'}</b><br>Location: ${displayType}<br><small>${new Date(loc.updated_at).toLocaleTimeString()}</small>`);
          childMarkers.set(loc.user_id, m);
          
          if (loc.location_type === 'danger' && isParent) {
            m.openPopup();
            showToast(`ALERT: ${loc.display_name} is in a DANGER ZONE!`, 'danger');
          }
        }
      });
    } catch(err) {
      console.error(err);
    }
  }

  await loadZones();
  await refreshLocations();
  
  const interval = setInterval(refreshLocations, 10000);
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      clearInterval(interval);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
