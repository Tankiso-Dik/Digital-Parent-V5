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
      
      const circle = L.circle([z.lat, z.lng], { color, radius: z.radius || 250, fillOpacity: 0.2 })
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
        <button id="request-location-btn" class="btn btn--secondary btn--sm" style="width: 100%; margin-bottom: 15px; font-size: 14px;">
          <i data-lucide="map-pin"></i> Request Location Update
        </button>
        <div id="child-status-list">Waiting for updates...</div>
      `;
      
      if (window.lucide) window.lucide.createIcons({ el: sidebar });

      const requestLocBtn = sidebar.querySelector('#request-location-btn');
      if (requestLocBtn) {
        requestLocBtn.onclick = () => {
          showToast('Location request sent to children', 'success');
        };
      }

      const zonesList = sidebar.querySelector('#zones-list');
      familyZones.forEach(z => {
        const item = document.createElement('div');
        item.className = 'glass';
        item.style.cssText = 'padding: 8px; border-radius: 6px; margin-bottom: 5px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;';
        item.innerHTML = `
          <div style="flex:1;">
            <b>${z.name}</b> (${z.zone_type})
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Radius: ${z.radius || 250}m</div>
          </div>
        `;
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:4px;';
        
        const gotoBtn = document.createElement('button');
        gotoBtn.className = 'btn btn--ghost btn--sm';
        gotoBtn.innerHTML = '🎯';
        gotoBtn.onclick = () => map.setView([z.lat, z.lng], 17);
        actions.appendChild(gotoBtn);
        
        const resizeBtn = document.createElement('button');
        resizeBtn.className = 'btn btn--ghost btn--sm';
        resizeBtn.innerHTML = '📏';
        resizeBtn.onclick = async () => {
          const r = prompt("Enter new radius in meters (e.g. 100, 500):", z.radius || 250);
          if(r && !isNaN(r)){
            try {
              await apiFetch('/location/zones/'+z.id, {method:'PATCH', body:JSON.stringify({radius: parseInt(r)})});
              loadZones();
            }catch(e){ showToast('Error resizing', 'error'); }
          }
        };
        actions.appendChild(resizeBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn--ghost btn--sm';
        delBtn.innerHTML = '🗑️';
        delBtn.style.color = 'var(--color-danger)';
        delBtn.onclick = async () => {
          if(confirm('Delete zone ' + z.name + '?')) {
            try {
              await apiFetch('/location/zones/'+z.id, {method:'DELETE'});
              loadZones();
            }catch(e){ showToast('Error deleting', 'error'); }
          }
        };
        actions.appendChild(delBtn);
        
        item.appendChild(actions);
        zonesList.appendChild(item);
      });
    } else {
      sidebar.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <h3 style="margin-bottom: 10px;">🛡️ Safety Center</h3>
          <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 24px;">Your location is shared with your parents for safety.</p>

          <button id="locate-btn" class="btn btn--secondary" style="width: 100%; padding: 15px; font-size: 16px; margin-bottom: 15px;">
            <i data-lucide="crosshair"></i> 1. Find My Location
          </button>
          
          <div id="check-in-preview" style="display: none; background: var(--bg-body); padding: 15px; border-radius: 12px; border: 1px solid var(--color-border-subtle); margin-bottom: 15px;">
             <div id="preview-status" style="font-size: 13px; font-weight: 600; margin-bottom: 15px; color: var(--text-main); text-align: center;"></div>
             <button id="confirm-btn" class="btn btn--primary" style="width: 100%; padding: 12px; font-size: 15px;">
               <i data-lucide="send"></i> 2. Send to Parents
             </button>
          </div>
          
          <div id="check-in-status" style="font-size: 13px; color: var(--text-secondary); font-weight: 500; text-align: center; margin-bottom: 20px;"></div>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid var(--color-border-subtle);">
          
          <button id="sos-btn" class="btn" style="width: 100%; padding: 24px; background: #FF3B30; color: white; border: none; border-radius: 16px; font-weight: 900; font-size: 18px; box-shadow: 0 8px 20px rgba(255,59,48,0.3); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <i data-lucide="megaphone" style="width: 32px; height: 32px;"></i>
            SEND SOS SIGNAL
          </button>
          
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 16px;">Only use in case of actual emergency.</p>
        </div>
      `;

      if (window.lucide) window.lucide.createIcons({ el: sidebar });

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

      const locateBtn = sidebar.querySelector('#locate-btn');
      const confirmBtn = sidebar.querySelector('#confirm-btn');
      const previewDiv = sidebar.querySelector('#check-in-preview');
      const previewStatus = sidebar.querySelector('#preview-status');
      const status = sidebar.querySelector('#check-in-status');

      let pendingLocation = null;

      locateBtn.onclick = () => {
        locateBtn.disabled = true;
        locateBtn.innerHTML = '<span class="spinner" style="margin-right: 8px;"></span> Locating...';
        status.textContent = '';
        previewDiv.style.display = 'none';
        
        if (!navigator.geolocation) {
          status.textContent = 'Geolocation is not supported by your browser.';
          locateBtn.disabled = false;
          locateBtn.innerHTML = '<i data-lucide="crosshair"></i> 1. Find My Location';
          if (window.lucide) window.lucide.createIcons({ el: locateBtn });
          return;
        }

        navigator.geolocation.getCurrentPosition((pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          
          let locationType = 'unknown';
          let closestZone = null;
          let minDistance = Infinity;

          familyZones.forEach(z => {
            const distance = map.distance([lat, lng], [z.lat, z.lng]);
            if (distance < 250 && distance < minDistance) {
              minDistance = distance;
              closestZone = z;
            }
          });

          if (closestZone) {
            locationType = closestZone.zone_type;
          }

          previewDiv.style.display = 'block';
          previewStatus.textContent = `📍 Found near: ${closestZone ? closestZone.name : 'Unknown/Transit'}`;

          pendingLocation = { 
            lat, 
            lng, 
            location_type: locationType,
            zone_name: closestZone ? closestZone.name : null 
          };
          
          map.setView([lat, lng], 15);
          if (childMarkers.has('preview')) {
            childMarkers.get('preview').remove();
          }
          const m = L.marker([lat, lng], { opacity: 0.7 }).addTo(map).bindPopup(`You are here: ${closestZone ? closestZone.name : 'Transit'} (Unsent)`);
          m.openPopup();
          childMarkers.set('preview', m);
          
          locateBtn.disabled = false;
          locateBtn.innerHTML = '<i data-lucide="crosshair"></i> 1. Find My Location';
          if (window.lucide) window.lucide.createIcons({ el: locateBtn });
          
          previewDiv.style.display = 'block';
        }, (err) => {
          console.error(err);
          status.textContent = '❌ Could not get location. Please allow permissions or try again.';
          locateBtn.disabled = false;
          locateBtn.innerHTML = '<i data-lucide="crosshair"></i> 1. Find My Location';
          if (window.lucide) window.lucide.createIcons({ el: locateBtn });
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      };

      confirmBtn.onclick = async () => {
        if (!pendingLocation) return;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner" style="margin-right: 8px;"></span> Sending...';
        
        try {
          await apiFetch('/location', {
            method: 'POST',
            body: JSON.stringify(pendingLocation)
          });
          showToast('Location checked in successfully!', 'success');
          
          if (childMarkers.has('preview')) {
            childMarkers.get('preview').remove();
            childMarkers.delete('preview');
          }
          
          previewDiv.style.display = 'none';
          status.textContent = '✅ Location sent to parents.';
          refreshLocations();
        } catch(e) {
          showToast('Failed to send location', 'error');
          status.textContent = '❌ Error sending location.';
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<i data-lucide="send"></i> 2. Send to Parents';
          if (window.lucide) window.lucide.createIcons({ el: confirmBtn });
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
          body: JSON.stringify({ name, lat: e.latlng.lat, lng: e.latlng.lng, zone_type: typeStr, radius: 250 })
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
          item.style.cssText = 'padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid var(--color-border-subtle); cursor: pointer; transition: all 0.2s;';
          item.innerHTML = `
            <div style="display:flex; justify-content: space-between;">
              <b style="${isDanger ? 'color: var(--color-danger);' : ''}">${loc.display_name}</b>
              <small class="text-secondary">${new Date(loc.updated_at).toLocaleTimeString()}</small>
            </div>
            <div class="text-secondary" style="font-size: 12px; margin-top: 4px;">Zone: ${displayType}</div>
            <div style="font-size:11px; margin-top:4px; color:var(--color-primary);">Click to view location history</div>
          `;
          item.onmouseenter = () => item.style.transform = 'scale(1.02)';
          item.onmouseleave = () => item.style.transform = 'scale(1)';
          item.onclick = async () => {
            try {
              const histRes = await apiFetch('/location/history/' + loc.user_id);
              const history = histRes.data || [];
              if (history.length === 0) {
                showToast('No history found for ' + loc.display_name, 'info');
                return;
              }
              // Clear previous history layer if exists
              if (window.childHistoryLayer) {
                map.removeLayer(window.childHistoryLayer);
              }
              const group = L.featureGroup().addTo(map);
              
              const latlngs = [];
              history.forEach((h, idx) => {
                const ll = [h.lat, h.lng];
                latlngs.push(ll);
                const isLatest = idx === 0;
                L.circleMarker(ll, {
                  color: isLatest ? 'var(--color-primary)' : 'var(--color-secondary)',
                  radius: isLatest ? 8 : 4,
                  fillOpacity: isLatest ? 1 : 0.5
                }).bindPopup(`<b>${loc.display_name}</b><br>${new Date(h.timestamp).toLocaleString()}<br>Zone: ${h.zone_name || 'Unknown'}`)
                  .addTo(group);
              });
              
              if (latlngs.length > 1) {
                L.polyline(latlngs, {color: 'var(--color-primary)', dashArray: '5, 5', opacity: 0.5}).addTo(group);
              }
              
              map.fitBounds(group.getBounds(), { padding: [50, 50] });
              window.childHistoryLayer = group;
              showToast('Showing recent locations for ' + loc.display_name, 'success');
            } catch (e) {
              showToast('Failed to load history', 'error');
            }
          };
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
