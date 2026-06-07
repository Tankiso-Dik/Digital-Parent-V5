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

  const insightsContainer = document.createElement('div');
  insightsContainer.id = 'insights-container';
  insightsContainer.style.cssText = 'margin-top: 20px;';
  if (isParent) wrapper.appendChild(insightsContainer);

  container.replaceChildren(wrapper);

  // Dynamically load Leaflet if not present
  if (typeof window.L === 'undefined') {
    try {
      await new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = '/leaflet.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    } catch (e) {
      console.warn('Failed to dynamically load Leaflet');
    }
  }

  let map = null;
  if (typeof window.L !== 'undefined') {
    try {
      map = window.L.map(mapEl).setView([-23.8969939, 29.4488468], 15);
      const tiles = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      });
      tiles.on('tileerror', () => {
        showToast('Offline: Map images cannot be downloaded without internet.', 'danger');
      });
      tiles.addTo(map);
      
      // Fix for Leaflet grey tile issue when rendering inside dynamic containers
      const fixMap = () => {
        if (map) {
          map.invalidateSize(true);
        }
      };
      setTimeout(fixMap, 100);
      setTimeout(fixMap, 400);
      setTimeout(fixMap, 1000);
      setTimeout(() => {
        if (map) map.setView([-23.8969939, 29.4488468], 15, { animate: false });
      }, 1100);
    } catch (e) {
      console.error('Leaflet init error:', e);
    }
  } else {
    mapEl.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--text-secondary);text-align:center;padding:20px;">Map library could not be loaded. Please ensure leaflet.js is in the public folder.</div>';
  }

  let familyZones = [];
  const zoneMarkers = [];
  const childMarkers = new Map();
  let firstLoadCentered = false;

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

  async function loadInsights() {
    if (!isParent) return;
    try {
      const res = await apiFetch('/location/insights');
      const { mostVisited, recent } = res.data || {};
      
      let html = '<div style="display:flex; gap:20px; flex-wrap:wrap;">';
      
      // Most visited
      html += '<div class="card card--padded glass" style="flex:1; min-width:300px;">';
      html += '<h3>🔥 Most Visited Areas</h3>';
      html += '<ul style="list-style:none; padding:0; margin-top:10px;">';
      if (!mostVisited || mostVisited.length === 0) {
         html += '<li style="color:var(--text-muted); font-size:13px;">No data yet.</li>';
      } else {
         mostVisited.forEach(v => {
           html += `<li style="padding:8px 0; border-bottom:1px solid var(--color-border-subtle); display:flex; justify-content:space-between; align-items:center;">
             <span><b>${v.display_name}</b> <span style="color:var(--text-secondary); font-size:12px;">in ${v.zone_name}</span></span>
             <span class="badge badge--neutral">${v.visits} visits</span>
           </li>`;
         });
      }
      html += '</ul></div>';

      // Recent areas
      html += '<div class="card card--padded glass" style="flex:1; min-width:300px;">';
      html += '<h3>⏱️ Recently Seen In</h3>';
      html += '<ul style="list-style:none; padding:0; margin-top:10px;">';
      if (!recent || recent.length === 0) {
         html += '<li style="color:var(--text-muted); font-size:13px;">No data yet.</li>';
      } else {
         recent.forEach(r => {
           html += `<li style="padding:8px 0; border-bottom:1px solid var(--color-border-subtle); display:flex; justify-content:space-between; align-items:center;">
             <span><b>${r.display_name}</b> <span style="color:var(--text-secondary); font-size:12px;">in ${r.zone_name}</span></span>
             <span style="font-size:12px; color:var(--text-muted);">${timeAgo(r.last_seen)}</span>
           </li>`;
         });
      }
      html += '</ul></div>';

      html += '</div>';
      insightsContainer.innerHTML = html;
    } catch(e) {
      console.error('Failed to load insights', e);
    }
  }

  async function loadExpectedCheckins() {
    if (!isParent) return;
    try {
      const res = await apiFetch('/location/expected');
      const expectedListEl = container.querySelector('#expected-list');
      if (expectedListEl && res.data) {
        expectedListEl.innerHTML = '';
        if (res.data.length === 0) {
          expectedListEl.innerHTML = '<div style="color:var(--text-muted);">No expected check-ins set.</div>';
        } else {
          res.data.forEach(ec => {
            const el = document.createElement('div');
            el.className = 'glass';
            el.style.cssText = 'padding: 8px; border-radius: 6px; margin-bottom: 5px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;';
            
            let statusIcon = '⚪';
            if (ec.status === 'arrived') statusIcon = '✅';
            else if (ec.status === 'missed') statusIcon = '❌';
            else if (ec.status === 'not_today') statusIcon = '💤';
            
            el.innerHTML = `
              <div style="flex:1;">
                <b>${ec.display_name}</b> at <b>${ec.zone_name}</b><br>
                <span style="color:var(--text-muted); font-size: 11px;">By ${ec.expected_time} | Status: ${statusIcon}</span>
              </div>
            `;
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn--ghost btn--sm';
            delBtn.innerHTML = '🗑️';
            delBtn.style.color = 'var(--color-danger)';
            delBtn.onclick = async () => {
              if(confirm('Delete expected check-in?')) {
                try {
                  await apiFetch('/location/expected/' + ec.id, {method:'DELETE'});
                  loadExpectedCheckins();
                }catch(e){ showToast('Error deleting', 'error'); }
              }
            };
            el.appendChild(delBtn);
            expectedListEl.appendChild(el);
          });
        }
      }
    } catch(err) {
      console.error(err);
    }
  }

  function renderZones() {
    if(map) zoneMarkers.forEach(m => { if(map) map.removeLayer(m); });
    zoneMarkers.length = 0;
    
    familyZones.forEach(z => {
      let color = 'blue';
      if (z.zone_type === 'safe' || z.zone_type === 'park') color = 'green';
      if (z.zone_type === 'danger') color = 'red';
      
      if (window.L) {
        const circle = window.L.circle([z.lat, z.lng], { color, radius: Number(z.radius) || 250, fillOpacity: 0.2 });
        circle.addTo(map).bindPopup(`<b>${z.name}</b><br>${z.zone_type.toUpperCase()}`);
        zoneMarkers.push(circle);
      }
    });
  }

function timeAgo(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  return `${Math.floor(hrs / 24)} days ago`;
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
        
        <h3>👀 Safety Status</h3>
        <button id="request-location-btn" class="btn btn--secondary btn--sm" style="width: 100%; margin-bottom: 15px; font-size: 14px;">
          <i data-lucide="map-pin"></i> Request Location Update
        </button>
        <div id="child-status-list">Waiting for updates...</div>
        
        <hr style="margin: 15px 0; border: none; border-top: 1px solid var(--color-border-subtle);">

        <h3>⏰ Expected Check-ins</h3>
        <p class="text-secondary" style="font-size: var(--text-sm); margin-bottom: 10px;">
          Get alerted if your child misses an expected arrival time.
        </p>
        <button id="add-expected-btn" class="btn btn--secondary btn--sm" style="width: 100%; margin-bottom: 10px;">
          <i data-lucide="clock"></i> Add Expected Check-in
        </button>
        <div id="expected-list" style="margin-bottom: 15px; font-size: 13px;">Loading expected check-ins...</div>

        <hr style="margin: 15px 0; border: none; border-top: 1px solid var(--color-border-subtle);">
        
        <h3>⏱️ Recent Events</h3>
        <div id="events-list" style="font-size: 13px;">Loading events...</div>
      `;
      
      if (window.lucide) window.lucide.createIcons({ el: sidebar });

      const addExpectedBtn = sidebar.querySelector('#add-expected-btn');
      if (addExpectedBtn) {
        addExpectedBtn.onclick = async () => {
          if (familyZones.length === 0) {
             alert('Please define a Family Zone first!');
             return;
          }
          try {
             const membersRes = await apiFetch('/family/members');
             const children = (membersRes.data || []).filter(m => m.family_role === 'child');
             if (children.length === 0) {
                alert('No children found in the family.');
                return;
             }
             
             let childOptions = children.map((c, i) => `${i}: ${c.display_name}`).join('\n');
             const childIdxStr = prompt(`Select child by number:\n${childOptions}`);
             if (!childIdxStr) return;
             const childIdx = parseInt(childIdxStr);
             if (isNaN(childIdx) || !children[childIdx]) return;
             
             let zoneOptions = familyZones.map((z, i) => `${i}: ${z.name}`).join('\n');
             const zoneIdxStr = prompt(`Select zone by number:\n${zoneOptions}`);
             if (!zoneIdxStr) return;
             const zoneIdx = parseInt(zoneIdxStr);
             if (isNaN(zoneIdx) || !familyZones[zoneIdx]) return;
             
             const expectedTime = prompt('Expected time (HH:MM) e.g. 15:30:');
             if (!expectedTime || !/^\d\d:\d\d$/.test(expectedTime)) return;
             
             await apiFetch('/location/expected', {
                method: 'POST',
                body: JSON.stringify({
                  user_id: children[childIdx].id,
                  zone_name: familyZones[zoneIdx].name,
                  expected_time: expectedTime,
                  days_of_week: [1,2,3,4,5]
                })
             });
             showToast('Expected check-in added!', 'success');
             loadExpectedCheckins();
          } catch(e) {
             showToast('Error adding check-in', 'error');
          }
        };
      }

      const requestLocBtn = sidebar.querySelector('#request-location-btn');
      if (requestLocBtn) {
        requestLocBtn.onclick = async () => {
          requestLocBtn.disabled = true;
          try {
             await apiFetch('/location/request', { method: 'POST' });
             showToast('Location request sent to children', 'success');
          } catch(e) {
             showToast('Failed to send request', 'error');
          } finally {
             requestLocBtn.disabled = false;
          }
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
        gotoBtn.onclick = () => map?.setView([z.lat, z.lng], 17);
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
          
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
              await apiFetch('/location', {
                method: 'POST',
                body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, location_type: 'danger' })
              }).catch(()=>{});
            }, ()=>{}, { enableHighAccuracy: true });
          }
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
            const distance = map ? map.distance([lat, lng], [z.lat, z.lng]) : Infinity;
            if (distance < (z.radius || 250) && distance < minDistance) {
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
          
          if(map) map.setView([lat, lng], 15);
          if (childMarkers.has('preview')) {
            childMarkers.get('preview').remove();
          }
          if (window.L) {
            const m = window.L.marker([lat, lng], { opacity: 0.7 });
            m.addTo(map).bindPopup(`You are here: ${closestZone ? closestZone.name : 'Transit'} (Unsent)`);
            m.openPopup();
            childMarkers.set('preview', m);
          }
          
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
    if(map) map.on('click', async (e) => {
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
          const isSafe = loc.location_type === 'safe' || loc.location_type === 'school' || loc.location_type === 'home';
          const isUnknown = loc.location_type === 'unknown' || !loc.location_type || loc.location_type === 'transit';
          const displayType = loc.zone_name || (isUnknown ? 'Transit / Unknown' : loc.location_type);
          
          let icon = '⚪';
          if (isSafe) icon = '🟢';
          if (isUnknown) icon = '🟡';
          if (isDanger) icon = '🔴';

          const minsAgo = Math.floor((Date.now() - new Date(loc.updated_at).getTime()) / 60000);
          const timeColor = minsAgo > 60 ? 'var(--color-danger)' : (minsAgo > 15 ? 'var(--color-warning)' : 'var(--color-success)');

          const item = document.createElement('div');
          item.className = `child-status-item glass ${isDanger ? 'child-status-item--danger' : ''}`;
          item.style.cssText = 'padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid var(--color-border-subtle); cursor: pointer; transition: all 0.2s;';
          item.innerHTML = `
            <div style="display:flex; justify-content: space-between; align-items: center;">
              <b style="font-size: 15px; ${isDanger ? 'color: var(--color-danger);' : ''}">${loc.display_name}</b>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span>${icon}</span>
                <span style="font-size: 14px; font-weight: 500;">${displayType}</span>
              </div>
            </div>
            <div style="display:flex; justify-content: space-between; margin-top: 8px; align-items: center;">
              <small style="font-weight: 600; color: ${timeColor};">Last verified: ${timeAgo(loc.updated_at)}</small>
              <div style="font-size:11px; color:var(--color-primary);">Route History 🗺️</div>
            </div>
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
                if(map) map.removeLayer(window.childHistoryLayer);
              }
              if (window.L) {
                const group = window.L.featureGroup();
                group.addTo(map);
                
                const latlngs = [];
                history.forEach((h, idx) => {
                  const ll = [h.lat, h.lng];
                  latlngs.push(ll);
                  const isLatest = idx === 0;
                  const circle = window.L.circleMarker(ll, {
                    color: isLatest ? 'var(--color-primary)' : 'var(--color-secondary)',
                    radius: isLatest ? 8 : 4,
                    fillOpacity: isLatest ? 1 : 0.5
                  });
                  circle.bindPopup(`<b>${loc.display_name}</b><br>${new Date(h.timestamp).toLocaleString()}<br>Zone: ${h.zone_name || 'Unknown'}`);
                  circle.addTo(group);
                });
                
                if (latlngs.length > 1) {
                  const poly = window.L.polyline(latlngs, {color: 'var(--color-primary)', dashArray: '5, 5', opacity: 0.5});
                  poly.addTo(group);
                }
                
                if(map) map.fitBounds(group.getBounds(), { padding: [50, 50] });
                window.childHistoryLayer = group;
              }
              showToast('Showing recent locations for ' + loc.display_name, 'success');
            } catch (e) {
              showToast('Failed to load history', 'error');
            }
          };
          statusListEl.appendChild(item);
        });
      }

      const boundsCoords = [];
      data.forEach(loc => {
        if (loc.lat && loc.lng) {
          boundsCoords.push([loc.lat, loc.lng]);
          if (childMarkers.has(loc.user_id)) {
            childMarkers.get(loc.user_id).remove();
          }
          const isUnknown = loc.location_type === 'unknown' || !loc.location_type;
          const displayType = loc.zone_name || (isUnknown ? 'Transit' : loc.location_type);
          
          if (window.L) {
            const m = window.L.marker([loc.lat, loc.lng]);
            m.addTo(map).bindPopup(`<b>${loc.display_name || 'Child'}</b><br>Location: ${displayType}<br><small>${new Date(loc.updated_at).toLocaleTimeString()}</small>`);
            childMarkers.set(loc.user_id, m);
            
            if (loc.location_type === 'danger' && isParent) {
              m.openPopup();
              showToast(`ALERT: ${loc.display_name} is in a DANGER ZONE!`, 'danger');
            }
          }
        }
      });

      if (!firstLoadCentered && boundsCoords.length > 0 && map && isParent) {
        map.fitBounds(window.L.latLngBounds(boundsCoords), { padding: [50, 50], maxZoom: 16 });
        firstLoadCentered = true;
      }
      
      if (isParent) {
        const eventsRes = await apiFetch('/location/events').catch(()=>null);
        if (eventsRes && eventsRes.data) {
          const eventsListEl = container.querySelector('#events-list');
          if (eventsListEl) {
            eventsListEl.innerHTML = '';
            if (eventsRes.data.length === 0) {
              eventsListEl.innerHTML = '<div style="color:var(--text-muted);">No recent events</div>';
            } else {
              eventsRes.data.slice(0, 10).forEach(ev => {
                const el = document.createElement('div');
                el.style.cssText = 'padding: 8px 0; border-bottom: 1px solid var(--glass-border-subtle); display:flex; justify-content:space-between; align-items:center;';
                
                const icon = ev.event_type === 'arrived' ? '📥' : '📤';
                const actionText = ev.event_type === 'arrived' ? 'Arrived at' : 'Left';
                
                el.innerHTML = `
                  <div>
                    <span style="margin-right: 6px;">${icon}</span>
                    <b>${ev.display_name}</b> ${actionText} <span style="color: var(--color-primary); font-weight: 500;">${ev.zone_name}</span>
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted);">${new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                `;
                eventsListEl.appendChild(el);
              });
            }
          }
        }
        
        const sosRes = await apiFetch('/reports/emergency').catch(()=>null);
        if (sosRes && sosRes.data) {
          const sos = sosRes.data.filter(e => e.status === 'pending');
          let existingAlert = container.querySelector('#map-sos-alert');
          if (sos.length > 0) {
            if (!existingAlert) {
              existingAlert = document.createElement('div');
              existingAlert.id = 'map-sos-alert';
              existingAlert.style.cssText = 'position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #FF3B30; color: white; padding: 15px 30px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 20px rgba(255,59,48,0.5); animation: pulse-red 1s infinite; display: flex; align-items: center; gap: 10px; cursor: pointer;';
              const mapEl = container.querySelector('#map');
              if (mapEl) mapEl.parentElement.style.position = 'relative';
              if (mapEl) mapEl.parentElement.appendChild(existingAlert);
            }
            existingAlert.innerHTML = `⚠️ SOS SIGNAL FROM: ${sos.map(e => e.display_name).join(', ')} <button id="dismiss-sos-map" style="margin-left:15px; padding:5px 10px; border-radius:15px; border:none; color:#FF3B30; background:white; cursor:pointer; font-weight:bold;">Dismiss</button>`;
            
            existingAlert.querySelector('#dismiss-sos-map').onclick = async (e) => {
              e.stopPropagation();
              for (const req of sos) {
                await apiFetch('/reports/emergency/' + req.id, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }).catch(()=>{});
              }
              existingAlert.remove();
            };
          } else if (existingAlert) {
            existingAlert.remove();
          }
        }
      }
    } catch(err) {
      console.error(err);
    }
  }

  await loadZones();
  await loadInsights();
  await refreshLocations();
  await loadExpectedCheckins();
  
  const interval = setInterval(() => {
     refreshLocations();
     loadInsights();
     loadExpectedCheckins();
  }, 10000);
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      clearInterval(interval);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
