import {fetchData} from './api.js';
import {Store} from './store.js';
import {debounce, sanitizeInput} from './utils.js';
import {mountRouter, navigateTo} from './router.js';

const store = new Store();

const root = document.getElementById('view-root');
const searchInput = document.getElementById('search-input');
const template = document.getElementById('event-card-template');

// helper: are we in admin mode? (query string ?admin=1)
function isAdminMode(){
  try{ return new URLSearchParams(location.search).get('admin') === '1'; }catch(e){return false}
}

// Create admin panel DOM and return references to controls
function createAdminPanel(){
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return null;
  const panel = document.createElement('div');
  panel.id = 'admin-panel';
  panel.className = 'admin-panel';
  // Build inner HTML
  panel.innerHTML = `
    <h3>Admin: Add Event</h3>
    <label for="admin-id" class="visually-hidden">ID</label>
    <input id="admin-id" placeholder="id (unique)" />
    <label for="admin-title" class="visually-hidden">Title</label>
    <input id="admin-title" placeholder="Title" />
  <label for="admin-date" class="visually-hidden">Date and time</label>
  <input id="admin-date" type="datetime-local" placeholder="YYYY-MM-DDThh:mm" />
    <label for="admin-location" class="visually-hidden">Location</label>
    <input id="admin-location" placeholder="Location" />
    <label for="admin-desc" class="visually-hidden">Description</label>
    <textarea id="admin-desc" placeholder="Short description"></textarea>
    <label for="admin-dropzone" class="visually-hidden">Drag and drop an image for the event</label>
    <div id="admin-dropzone" class="admin-dropzone" aria-label="Drop image here" tabindex="0">
      <span class="dz-text">Drag & drop image here, or click to select</span>
      <input id="admin-image-file" type="file" accept="image/*" style="display:none" />
    </div>
    <!-- Hidden field stores the base64 data URL of the uploaded image -->
    <input id="admin-image-data" type="hidden" />
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      <button id="admin-add" class="btn">Add event</button>
      <button id="admin-clear" class="btn secondary">Clear</button>
    </div>
    <hr style="border:none;border-top:1px solid rgba(16,24,40,0.04);margin:0.6rem 0" />
    <h4 style="margin:0.4rem 0 0.25rem;font-size:0.95rem">Admin: Home timer</h4>
    <label for="admin-next-event" class="visually-hidden">Next event datetime</label>
    <input id="admin-next-event" type="datetime-local" />
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      <button id="admin-save-next" class="btn">Save timer</button>
      <button id="admin-clear-next" class="btn secondary">Clear timer</button>
    </div>
    <hr style="border:none;border-top:1px solid rgba(16,24,40,0.04);margin:0.6rem 0" />
    <p style="font-size:0.9rem;color:var(--muted);margin:0">Use the Delete button on event cards to remove events. The "Home timer" shows on the main page and can be overridden here.</p>
    
  `;
  sidebar.appendChild(panel);
  return panel;
}

// Home timer interval handle
let _homeTimerInterval = null;
// Home carousel interval handle & state
let _homeCarouselInterval = null;
let _homeCarouselIndex = 0;

function clearHomeCarousel(){ if (_homeCarouselInterval){ clearInterval(_homeCarouselInterval); _homeCarouselInterval = null; } _homeCarouselIndex = 0; }

function clearHomeTimer(){
  if (_homeTimerInterval) { clearInterval(_homeTimerInterval); _homeTimerInterval = null; }
}

function getNextEventTime(){
  // admin override stored in localStorage as JSON {iso,title,id}
  try{
    const raw = localStorage.getItem('campus:nextEventTime');
    if (raw){
      try{
        const parsed = JSON.parse(raw);
        if (parsed && parsed.iso) {
          console.log('[DEBUG-timer] using admin override', parsed);
          return {iso: parsed.iso, title: parsed.title || null, id: parsed.id || null};
        }
        // fallback to a plain string value for older persisted data
        if (typeof raw === 'string' && raw.trim()) return {iso: raw.trim(), title: null, id: null};
      }catch(e){
        // if it's not JSON, treat as plain ISO string
        if (raw.trim()){
          console.log('[DEBUG-timer] using plain-string admin override', raw.trim());
          return {iso: raw.trim(), title: null, id: null};
        }
      }
    }
  }catch(e){}
  // fallback: pick the earliest future event from merged events (store + persisted admin events)
  try{
    // start with in-memory store events
    let events = Array.isArray(store.events) ? store.events.slice() : [];
    // debug: show what's in the in-memory store when computing next event
    try{ console.log('[DEBUG-timer] store.events.length=', Array.isArray(store.events)? store.events.length : 0); }catch(e){}
    // merge persisted admin events from localStorage (if any)
    let persistedAdminEvents = [];
    try{
      const rawAdmin = localStorage.getItem('campus:events');
      if (rawAdmin){
        console.log('[DEBUG-timer] raw campus:events present');
        const adminArr = JSON.parse(rawAdmin);
        console.log('[DEBUG-timer] parsed campus:events count=', Array.isArray(adminArr)? adminArr.length : 0);
        if (Array.isArray(adminArr) && adminArr.length){
          persistedAdminEvents = adminArr.slice();
          const ids = new Set(events.map(e=>e.id));
          // prepend admin events so they are considered first in rendering order
          adminArr.forEach(ae=>{ if (!ids.has(ae.id)) events.unshift(ae); });
        }
      } else {
        console.log('[DEBUG-timer] no raw campus:events key');
      }
    }catch(e){ /* ignore parse errors */ }
    // No longer filter by a separate deleted-list. Admin-deleted events are removed from persisted
    // `campus:events` directly, so we simply use the merged events list here.

    // Detailed debug: print each candidate event's id, stored date string and parsed value
    try{
      console.log('[DEBUG-timer] candidate events detail:');
      events.forEach(ev=>{
        try{
          const parsed = new Date(ev.date);
          console.log('[DEBUG-timer] ev=', ev.id, 'date=', ev.date, 'parsed=', isNaN(parsed)? 'Invalid' : parsed.toISOString());
        }catch(e){ console.log('[DEBUG-timer] ev=', ev.id, 'date=', ev.date, 'parsed=ERROR'); }
      });
    }catch(e){}
    const now = new Date();
    // Prefer admin-persisted events if any future ones exist there
    try{
      if (Array.isArray(persistedAdminEvents) && persistedAdminEvents.length){
        const futureAdmin = persistedAdminEvents.map(ev=>({ev, d: new Date(ev.date)})).filter(x=>!isNaN(x.d) && x.d > now).sort((a,b)=>a.d - b.d);
        if (futureAdmin.length){
          const sel = {iso: futureAdmin[0].d.toISOString(), title: futureAdmin[0].ev.title || null, id: futureAdmin[0].ev.id || null};
          console.log('[DEBUG-timer] selected next event (from persisted admin events)', sel);
          return sel;
        }
      }
    }catch(e){/* ignore */}

    const future = events.map(ev=>({ev, d: new Date(ev.date)})).filter(x=>!isNaN(x.d) && x.d > now).sort((a,b)=>a.d - b.d);
    if (future.length) {
      const sel = {iso: future[0].d.toISOString(), title: future[0].ev.title || null, id: future[0].ev.id || null};
      console.log('[DEBUG-timer] selected next event', sel);
      return sel;
    }
  }catch(e){/* ignore */}
  console.log('[DEBUG-timer] no upcoming events found');
  return null;
}

function startHomeTimer(target){
  clearHomeTimer();
  const el = document.getElementById('home-timer');
  if (!el) return;
  let targetIso = null;
  let targetTitle = null;
  if (!target){ el.textContent = 'No upcoming event set'; return; }
  if (typeof target === 'string') targetIso = target;
  else if (target && target.iso) { targetIso = target.iso; targetTitle = target.title || null; }
  function update(){
    const now = new Date();
    const target = new Date(targetIso);
    const diff = target - now;
    if (isNaN(diff)) { el.textContent = 'Invalid date'; return; }
    if (diff <= 0){ el.textContent = 'Event starting now'; clearHomeTimer(); return; }
    const days = Math.floor(diff / (1000*60*60*24));
    const hours = Math.floor((diff / (1000*60*60)) % 24);
    const minutes = Math.floor((diff / (1000*60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    // update modern countdown pieces if present
    const dEl = document.getElementById('cd-days');
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-mins');
    const sEl = document.getElementById('cd-secs');
    if (dEl && hEl && mEl && sEl){
      dEl.textContent = String(days).padStart(2,'0');
      hEl.textContent = String(hours).padStart(2,'0');
      mEl.textContent = String(minutes).padStart(2,'0');
      sEl.textContent = String(seconds).padStart(2,'0');
      const titleEl = document.getElementById('home-next-title');
      if (titleEl) titleEl.textContent = targetTitle || 'Next event';
      // hide the generic description if an admin override is set
      const descEl = document.getElementById('home-desc');
      try{ const override = !!localStorage.getItem('campus:nextEventTime'); if (descEl) descEl.style.display = override ? 'none' : ''; }catch(e){}
    } else {
      el.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
  }
  update();
  _homeTimerInterval = setInterval(update, 1000);
}

function renderHome(){
  // Build a hero area with background image and overlay timer
  root.innerHTML = '';
  const hero = document.createElement('section');
  hero.className = 'home-hero';
  hero.style.backgroundImage = "url('Assets/image.jpg')";
  const overlay = document.createElement('div'); overlay.className = 'home-overlay';
  const title = document.createElement('h2'); title.textContent = 'Welcome to Campus Life';
  // give the description an id so startHomeTimer can hide it when admin override exists
  const desc = document.createElement('p'); desc.id = 'home-desc'; desc.textContent = 'Next event starts in:';
  const timer = document.createElement('div'); timer.id = 'home-timer'; timer.className = 'home-timer'; timer.setAttribute('aria-live','polite');
  // modern countdown pieces
  const nextTitle = document.createElement('div'); nextTitle.id = 'home-next-title'; nextTitle.className = 'home-next-title';
  const pieces = document.createElement('div'); pieces.className = 'countdown-pieces';
  const makePiece = (id,label)=>{
    const p = document.createElement('div'); p.className = 'cd-piece';
    const num = document.createElement('div'); num.className = 'cd-num'; num.id = id; num.textContent = '00';
    const lbl = document.createElement('div'); lbl.className = 'cd-label'; lbl.textContent = label;
    p.appendChild(num); p.appendChild(lbl); return p;
  };
  pieces.appendChild(makePiece('cd-days','Days'));
  pieces.appendChild(makePiece('cd-hours','Hours'));
  pieces.appendChild(makePiece('cd-mins','Minutes'));
  pieces.appendChild(makePiece('cd-secs','Seconds'));
  overlay.appendChild(title); overlay.appendChild(desc); overlay.appendChild(nextTitle); overlay.appendChild(pieces); overlay.appendChild(timer);
  const ctaRow = document.createElement('div'); ctaRow.style.marginTop='0.8rem';
  const viewBtn = document.createElement('button'); viewBtn.className='btn'; viewBtn.textContent='View events'; viewBtn.addEventListener('click', ()=>navigateTo('#/events'));
  ctaRow.appendChild(viewBtn);
  overlay.appendChild(ctaRow);
  hero.appendChild(overlay);
  root.appendChild(hero);
  // start timer
  const next = getNextEventTime();
  startHomeTimer(next);

    // build and init the event carousel (shows upcoming events; hidden when none)
  try{
    // clear any previous carousel timer
    clearHomeCarousel();
    // place the carousel below the hero overlay so the page looks "filled"
    // create a wrapper that matches the overlay visual size
    let carousel = document.getElementById('home-carousel');
    if (!carousel){
      const wrap = document.createElement('div'); wrap.className = 'home-carousel-wrap';
      const c = document.createElement('div'); c.className = 'home-carousel'; c.id = 'home-carousel';
      wrap.appendChild(c);
      // insert after the hero element
      try{ root.insertBefore(wrap, hero.nextSibling); }catch(e){ root.appendChild(wrap); }
      carousel = document.getElementById('home-carousel');
    }
    if (!carousel) return;
    // merge persisted admin events like other renderers (defensive)
    let events = Array.isArray(store.events) ? store.events.slice() : [];
    try{
      const raw = localStorage.getItem('campus:events');
      if (raw){
        const localEvents = JSON.parse(raw);
        if (Array.isArray(localEvents) && localEvents.length){
          const ids = new Set(events.map(e=>e.id));
          localEvents.forEach(le=>{ if (!ids.has(le.id)) events.unshift(le); });
        }
      }
    }catch(e){/* ignore */}

    // filter to future events only
    const now = new Date();
    const upcoming = events.map(ev=>({ev, d: new Date(ev.date)})).filter(x=>!isNaN(x.d) && x.d > now).sort((a,b)=>a.d - b.d).map(x=>x.ev);
    if (!upcoming || upcoming.length === 0){ carousel.setAttribute('hidden',''); return; }
    carousel.removeAttribute('hidden');

    // build DOM
    const track = document.createElement('div'); track.className = 'hc-track'; track.id = 'hc-track';
    upcoming.forEach((ev, idx)=>{
      const slide = document.createElement('div'); slide.className = 'hc-slide'; slide.setAttribute('data-index', idx);
      const thumb = document.createElement('div'); thumb.className = 'hc-thumb';
      const imagePath = ev.image || `Assets/events/${ev.id}.jpg`;
      if (imagePath) thumb.style.backgroundImage = `url('${imagePath}')`;
      const body = document.createElement('div'); body.className = 'hc-body';
      const t = document.createElement('div'); t.className = 'hc-title'; t.textContent = ev.title || 'Untitled';
      const meta = document.createElement('div'); meta.className = 'hc-meta';
      try{ const dt = new Date(ev.date); meta.textContent = isNaN(dt)? ev.date : ( /T\d/.test(String(ev.date)) ? dt.toLocaleString() : dt.toLocaleDateString() ); }catch(e){ meta.textContent = ev.date; }
      const desc = document.createElement('p'); desc.className = 'hc-desc'; desc.textContent = ev.description || '';
      body.appendChild(t); body.appendChild(meta); body.appendChild(desc);
      slide.appendChild(thumb); slide.appendChild(body);
      track.appendChild(slide);
    });
    carousel.appendChild(track);

  // Note: no prev/next controls — carousel auto-advances to keep the home area clean

    // dots
    const dots = document.createElement('div'); dots.className = 'hc-dots'; dots.id = 'hc-dots';
    upcoming.forEach((_,i)=>{ const d = document.createElement('button'); d.className='hc-dot'; d.setAttribute('data-index', i); d.setAttribute('aria-label', `Show event ${i+1}`); dots.appendChild(d); });
    carousel.appendChild(dots);

    // carousel behavior
    const slides = Array.from(track.children);
    const dotButtons = Array.from(dots.children);
    function showSlide(i){
      if (!track) return;
      i = (i + slides.length) % slides.length;
      _homeCarouselIndex = i;
      const offset = -i * 100;
      track.style.transform = `translateX(${offset}%)`;
      dotButtons.forEach((b,idx)=> b.classList.toggle('active', idx===i));
      // set carousel background to the active event image for immersive feel
      try{
        const active = upcoming[i];
        const imagePath = (active && (active.image || `Assets/events/${active.id}.jpg`)) || '';
        // apply background to the inner carousel element so border-radius clips the image
        const inner = carousel;
        if (imagePath){
          inner.style.backgroundImage = `linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.28)), url('${imagePath}')`;
          inner.style.backgroundSize = 'cover';
          inner.style.backgroundPosition = 'center';
        } else {
          inner.style.backgroundImage = '';
        }
      }catch(e){}
    }
    function nextSlide(){ showSlide(_homeCarouselIndex + 1); }
    function prevSlide(){ showSlide(_homeCarouselIndex - 1); }
    dotButtons.forEach(b=> b.addEventListener('click', (ev)=>{ const i = Number(ev.currentTarget.getAttribute('data-index')||0); showSlide(i); restartAuto(); }));

  // keyboard support: allow left/right arrows to change slides
  carousel.addEventListener('keydown', (e)=>{ if (e.key === 'ArrowLeft') { showSlide(_homeCarouselIndex - 1); restartAuto(); } else if (e.key === 'ArrowRight'){ showSlide(_homeCarouselIndex + 1); restartAuto(); } });

    function startAuto(){ clearHomeCarousel(); _homeCarouselInterval = setInterval(()=>{ nextSlide(); }, 4500); }
    function restartAuto(){ startAuto(); }
    // pause on hover/focus
    carousel.addEventListener('mouseenter', ()=>{ clearHomeCarousel(); });
    carousel.addEventListener('mouseleave', ()=>{ startAuto(); });
    carousel.addEventListener('focusin', ()=>{ clearHomeCarousel(); });
    carousel.addEventListener('focusout', ()=>{ startAuto(); });

    // make slides clickable to navigate to the events page and focus the event
    slides.forEach((slide, idx)=>{
      const ev = upcoming[idx];
      if (!ev) return;
      slide.style.cursor = 'pointer';
      slide.addEventListener('click', ()=>{
        try{ localStorage.setItem('campus:scrollToEvent', ev.id); }catch(e){}
        navigateTo('#/events');
      });
    });

    // initialize
    showSlide(0);
    startAuto();

  }catch(e){ console.warn('Could not initialize home carousel', e); }
}

// delete an event by id: update store, persist admin events and record deleted ids
function deleteEventById(id){
  if (!id) return;
  // remove from in-memory store
  store.events = (store.events || []).filter(ev => ev.id !== id);
  // remove from persisted admin events if present
  try{
    const raw = localStorage.getItem('campus:events');
    let arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)){
      arr = arr.filter(ev => ev.id !== id);
      localStorage.setItem('campus:events', JSON.stringify(arr));
    }
  }catch(e){ console.warn('Could not update campus:events', e); }
  // Note: we no longer maintain a separate campus:deleted list; removing the event
  // from campus:events is sufficient to persist deletions.
  // refresh authoritative data and UI
  (async ()=>{
    try{
      const data = await fetchData();
      store.setData(data);
      renderCurrent(searchInput.value);
      showToast('Event deleted', 'success');
      try{ startHomeTimer(getNextEventTime()); }catch(e){}
    }catch(e){
      // fallback to previous behavior
      renderCurrent(searchInput.value);
      showToast('Event deleted', 'success');
      try{ startHomeTimer(getNextEventTime()); }catch(e){}
    }
  })();
}

async function init(){
  // show loading state while fetching
  document.body.classList.add('loading');
  try{
    const data = await fetchData();
    store.setData(data);
    // render immediately after data is loaded so the UI shows events right away
    renderCurrent();
    // ensure the home timer is (re)started after data load — uses admin override if present
    try{ startHomeTimer(getNextEventTime()); }catch(e){}
  }catch(err){
    root.innerHTML = '<p role="alert">Unable to load data. Please try again later.</p>';
  }finally{
    // always remove loading
    document.body.classList.remove('loading');
  }

  // subscriptions
  store.subscribe(()=>renderCurrent());

  // listen for cross-tab localStorage changes and refresh data/timer when admin events or deletions change
  window.addEventListener('storage', async (e)=>{
    try{
      if (!e.key) return;
      if (e.key === 'campus:events'){
        const data = await fetchData();
        store.setData(data);
        renderCurrent(searchInput.value);
        try{ startHomeTimer(getNextEventTime()); }catch(err){}
      }
    }catch(err){ /* ignore */ }
  });

  // search
  const doSearch = debounce(()=>renderCurrent(searchInput.value), 250);
  searchInput.addEventListener('input', doSearch);

  // keyboard nav: focus main when route changes
  window.addEventListener('hashchange', ()=>{
    try{ document.getElementById('app').focus(); }catch(e){}
    // if navigating to home, recompute and (re)start the home timer
    try{ const path = location.hash.replace('#','') || '/'; if (path === '/') startHomeTimer(getNextEventTime()); }catch(e){}
  });

  // on full page load, also ensure timer is computed from current events if on home
  window.addEventListener('load', ()=>{
    try{ const path = location.hash.replace('#','') || '/'; if (path === '/') startHomeTimer(getNextEventTime()); }catch(e){}
  });

  // Admin panel: show only when ?admin=1 is present in the QUERY STRING
  try{
    const panel = document.getElementById('admin-panel');
    const params = new URLSearchParams(location.search);
    const isAdmin = params.get('admin') === '1';
    // diagnostic logs to debug host-specific behavior — remove after debugging
    try{
      console.log('[DEBUG-admin] init(): location.href=', location.href);
      console.log('[DEBUG-admin] init(): params=', String(location.search), 'isAdmin=', isAdmin);
      console.log('[DEBUG-admin] init(): document.body present?', !!document.body);
      try{ console.log('[DEBUG-admin] init(): body.classList before=', Array.from(document.body.classList)); }catch(e){}
      const sidebarExists = !!document.querySelector('.sidebar');
      console.log('[DEBUG-admin] init(): sidebar exists?', sidebarExists);
      // expose admin-mode as a body class so styles can target admin-only controls
      if (isAdmin) document.body.classList.add('admin-mode'); else document.body.classList.remove('admin-mode');
      try{ console.log('[DEBUG-admin] init(): body.classList after=', Array.from(document.body.classList)); }catch(e){}
    }catch(e){ console.warn('[DEBUG-admin] init(): diagnostic failed', e); }
    if (panel) {
      if (isAdmin) panel.removeAttribute('hidden'); else panel.setAttribute('hidden','');
    }

    // Only wire up admin controls when explicitly enabled via query string
    if (isAdmin){
      const panel = createAdminPanel();
      if (panel){
        const aId = panel.querySelector('#admin-id');
        const aTitle = panel.querySelector('#admin-title');
        const aDate = panel.querySelector('#admin-date');
        const aLoc = panel.querySelector('#admin-location');
        const aDesc = panel.querySelector('#admin-desc');
        const aDrop = panel.querySelector('#admin-dropzone');
        const aFileInput = panel.querySelector('#admin-image-file');
        const aImageData = panel.querySelector('#admin-image-data');
        const aAdd = panel.querySelector('#admin-add');
        const aClear = panel.querySelector('#admin-clear');
        if (aAdd){
          aAdd.addEventListener('click', async (ev)=>{
            ev.preventDefault();
            const id = (aId.value || ('evt-'+Date.now())).trim();
            const title = (aTitle.value || 'Untitled Event').trim();
            const rawDate = (aDate.value || '').trim();
            let dateIso = null;
            if (rawDate){
              // datetime-local returns local date/time without timezone. Convert to an absolute ISO string.
              // Example input: '2025-11-15T09:30'
              const dt = new Date(rawDate);
              if (!isNaN(dt)) dateIso = dt.toISOString();
            }
            const locationText = (aLoc.value || '').trim();
            const desc = (aDesc.value || '').trim();
            // prefer uploaded data URL if present
            const uploadedData = (aImageData && aImageData.value) ? aImageData.value : null;
            const image = uploadedData || null;
            if (!id || !title){
              showToast('Please provide at least an id and title', 'error', true);
              return;
            }
            const evObj = {id, title, date: dateIso || 'TBA', location: locationText || 'TBA', description: desc || '', image: image || null};
            // persist to localStorage so it survives reload
            try{
              const raw = localStorage.getItem('campus:events');
              const arr = raw ? JSON.parse(raw) : [];
              arr.push(evObj);
              localStorage.setItem('campus:events', JSON.stringify(arr));
            }catch(e){
              console.warn('Could not persist admin event', e);
            }
            // reload merged data so store.events is authoritative and consistent
            try{
              const data = await fetchData();
              store.setData(data);
            }catch(e){ console.warn('Could not refresh data after add', e); }
            renderCurrent(searchInput.value);
            showToast('Event added', 'success');
            // clear inputs
            aId.value=''; aTitle.value=''; aDate.value=''; aLoc.value=''; aDesc.value=''; if (aFileInput) aFileInput.value=''; if (aImageData) aImageData.value='';
            // update home timer in case the new event is earlier than the current next event
            try{ startHomeTimer(getNextEventTime()); }catch(e){}
          });
        }
        if (aClear){
          aClear.addEventListener('click', (ev)=>{ ev.preventDefault(); aId.value=''; aTitle.value=''; aDate.value=''; aLoc.value=''; aDesc.value=''; if (aFileInput) aFileInput.value=''; if (aImageData) aImageData.value=''; });
        }
        
        // wire up drag & drop / file select for the admin dropzone
        try{
          const dz = panel.querySelector('#admin-dropzone');
          const fileInput = panel.querySelector('#admin-image-file');
          const hiddenData = panel.querySelector('#admin-image-data');
          if (dz && fileInput && hiddenData){
            function showPreview(dataUrl){
              dz.style.backgroundImage = `url('${dataUrl}')`;
              dz.classList.add('has-preview');
              hiddenData.value = dataUrl;
            }
            dz.addEventListener('click', ()=>fileInput.click());
            dz.addEventListener('dragover', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
            dz.addEventListener('dragleave', ()=>{ dz.classList.remove('dragover'); });
            dz.addEventListener('drop', (e)=>{
              e.preventDefault(); dz.classList.remove('dragover');
              const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
              if (!f) return;
              if (!f.type.startsWith('image/')){ showToast('Please drop an image file', 'error', true); return; }
              const fr = new FileReader();
              fr.onload = ()=>{ try{ showPreview(fr.result); }catch(err){ console.warn(err); } };
              fr.readAsDataURL(f);
            });
            fileInput.addEventListener('change', ()=>{
              const f = fileInput.files && fileInput.files[0];
              if (!f) return;
              if (!f.type.startsWith('image/')){ showToast('Please select an image file', 'error', true); return; }
              const fr = new FileReader();
              fr.onload = ()=>{ try{ showPreview(fr.result); }catch(err){ console.warn(err); } };
              fr.readAsDataURL(f);
            });
          }
        }catch(e){/* ignore */}
        // wire admin home timer controls if present in the panel
        const aNext = panel.querySelector('#admin-next-event');
        const aSaveNext = panel.querySelector('#admin-save-next');
        const aClearNext = panel.querySelector('#admin-clear-next');
        const aNextTitle = document.createElement('input');
        aNextTitle.id = 'admin-next-title';
        aNextTitle.placeholder = 'Optional title for home timer';
        aNextTitle.style.marginTop = '0.4rem';
        aNextTitle.className = 'form-input';
        if (aNext && aSaveNext && aClearNext){
          // insert title input right after the datetime control for convenience
          aNext.parentNode.insertBefore(aNextTitle, aNext.nextSibling);
          // load existing override (if any)
          try{
            const raw = localStorage.getItem('campus:nextEventTime');
            if (raw){
              try{
                const parsed = JSON.parse(raw);
                if (parsed && parsed.iso) {
                  // set datetime-local value to local equivalent
                  const dt = new Date(parsed.iso);
                  if (!isNaN(dt)){
                    // produce a local datetime-local string yyyy-mm-ddThh:mm
                    const pad = n=>String(n).padStart(2,'0');
                    const vl = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
                    aNext.value = vl;
                  }
                  if (parsed.title) aNextTitle.value = parsed.title;
                }
              }catch(e){
                // if it's plain string, attempt to set as ISO-derived value
                try{ const dt = new Date(raw); if (!isNaN(dt)){ const pad = n=>String(n).padStart(2,'0'); aNext.value = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`; } }catch(e){}
              }
            }
          }catch(e){}

          aSaveNext.addEventListener('click', (ev)=>{
            ev.preventDefault();
            const val = (aNext.value || '').trim();
            if (!val){ showToast('Please choose a date & time', 'error', true); return; }
            // Normalize datetime-local (local time) to an absolute ISO in UTC
            try{
              const dt = new Date(val);
              if (isNaN(dt)) { showToast('Invalid date/time', 'error', true); return; }
              const iso = dt.toISOString();
              const payload = {iso, title: (aNextTitle.value || '').trim() || null};
              localStorage.setItem('campus:nextEventTime', JSON.stringify(payload));
              showToast('Home timer saved', 'success');
              // restart timer on page
              startHomeTimer(payload);
            }catch(e){ showToast('Could not save timer', 'error', true); }
          });

          aClearNext.addEventListener('click', (ev)=>{
            ev.preventDefault();
            try{ localStorage.removeItem('campus:nextEventTime'); showToast('Home timer cleared', 'success'); aNext.value=''; aNextTitle.value=''; startHomeTimer(getNextEventTime()); }catch(e){ showToast('Could not clear timer', 'error', true); }
          });
        }
      }
    }

    
  }catch(e){
    // ignore URL errors
  }

  document.getElementById('open-calendar').addEventListener('click', async ()=>{
    // dynamic import — code-splitting
    const mod = await import('./calendar.js');
    mod.createCalendar(document.body);
  });

  // delegate clicks for booking
  // booking flow: open accessible dialog instead of prompt
  const bookingDialog = document.getElementById('booking-dialog');
  const bookingForm = document.getElementById('booking-form');
  const bkName = document.getElementById('bk-name');
  const bkEmail = document.getElementById('bk-email');
  const bkEventId = document.getElementById('bk-event-id');
  const bkEventLabel = document.getElementById('booking-event');
  const bookingConfirm = document.getElementById('booking-confirm');
  const confirmDesc = document.getElementById('confirm-desc');
  const confirmClose = document.getElementById('confirm-close');

  let lastFocusedElement = null;

  function trapFocus(modal){
    const selector = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(modal.querySelectorAll(selector)).filter(el => el.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length-1];

    function keyHandler(e){
      if (e.key === 'Escape'){
        e.preventDefault();
        closeDialog();
        return;
      }
      if (e.key === 'Tab'){
        // shift+tab
        if (e.shiftKey){
          if (document.activeElement === first){
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last){
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    function backdropClick(e){
      // close when clicking on backdrop area (dialog element itself)
      if (e.target === modal) closeDialog();
    }

    // attach handlers and store so we can remove later
    modal._focusTrap = {keyHandler, backdropClick};
    modal.addEventListener('keydown', keyHandler);
    modal.addEventListener('click', backdropClick);
    // ensure first focusable is focused
    (first || modal).focus();
  }

  function removeTrap(modal){
    if (!modal._focusTrap) return;
    modal.removeEventListener('keydown', modal._focusTrap.keyHandler);
    modal.removeEventListener('click', modal._focusTrap.backdropClick);
    delete modal._focusTrap;
  }

  function closeDialog(){
    if (typeof bookingDialog.close === 'function') bookingDialog.close();
    else bookingDialog.removeAttribute('open');
    removeTrap(bookingDialog);
    // restore focus
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function'){
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  root.addEventListener('click', async (e)=>{
    const bookBtn = e.target.closest('.book-btn');
    const delBtn = e.target.closest('.delete-btn');
    if (delBtn){
      // admin delete from card
      const card = delBtn.closest('.event-card');
      const id = card?.dataset?.id;
      if (!id) return;
      if (!isAdminMode()){ showToast('Admin only', 'error', true); return; }
      if (!confirm(`Delete event ${id}? This will remove it for all users.`)) return;
      deleteEventById(id);
      return;
    }
    const btn = bookBtn;
    if (!btn) return;
    const card = btn.closest('.event-card');
    const id = card?.dataset?.id;
    if (!id) return;
    const title = card.querySelector('.event-title')?.textContent || 'Event';
    bkEventLabel.textContent = title;
    bkEventId.value = id;
    bkName.value = '';
    bkEmail.value = '';
    // remember the element that opened the dialog to restore focus later
    lastFocusedElement = btn;
    // show dialog and focus — use native dialog when available
    if (typeof bookingDialog.showModal === 'function') {
      bookingDialog.showModal();
    } else {
      // fallback: simple visible open
      bookingDialog.setAttribute('open','');
    }
    // trap focus inside dialog
    trapFocus(bookingDialog);
  });

  // cancel/reset closes dialog
  bookingForm.addEventListener('reset', (ev)=>{
    ev.preventDefault();
    closeDialog();
  });

  // enable confirm button only when name is present
  const bkSubmit = document.getElementById('bk-submit');
  function updateSubmitState(){
    const v = (bkName.value || '').trim();
    bkSubmit.disabled = !v;
  }
  bkName.addEventListener('input', updateSubmitState);
  updateSubmitState();

  bookingForm.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const name = sanitizeInput(bkName.value || '').trim();
    const email = sanitizeInput(bkEmail.value || '').trim();
    const eventId = bkEventId.value;
    if (!name) {
      bkName.focus();
      return;
    }
    // show loading state on button
    bkSubmit.classList.add('loading'); bkSubmit.disabled = true;
    try{
      const res = await store.book(eventId, name);
      // close booking dialog
      closeDialog();
      // show confirmation dialog with details
      try{
        confirmDesc.textContent = `${name} — booked for event ${eventId}`;
        if (typeof bookingConfirm.showModal === 'function') bookingConfirm.showModal(); else bookingConfirm.setAttribute('open','');
      }catch(e){ /* ignore */ }
      showToast('Booking saved', 'success');
      navigateTo('#/bookings');
    }catch(err){
      showToast('Booking failed: '+(err.message||'unknown'), 'error', true);
    }finally{
      bkSubmit.classList.remove('loading');
      updateSubmitState();
    }
  });

  if (confirmClose) confirmClose.addEventListener('click', ()=>{ try{ bookingConfirm.close(); }catch(e){ bookingConfirm.removeAttribute('open'); } });

  mountRouter((path)=>renderCurrent(searchInput.value));
}

// Toast utility — uses ARIA-live polite/assertive regions
export function showToast(message, type = 'info', assertive = false, timeout = 4500){
  try{
    const container = document.getElementById(assertive? 'toast-container-assertive' : 'toast-container-polite');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type==='success'? 'success' : type==='error'? 'error' : ''} toast-enter`;
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live', assertive? 'assertive' : 'polite');
    const msg = document.createElement('div'); msg.className = 'msg'; msg.textContent = message;
    const close = document.createElement('button'); close.className = 'close'; close.setAttribute('aria-label','Dismiss'); close.innerHTML = '\u2715';
    close.addEventListener('click', ()=>{ removeToast(toast); });
    toast.appendChild(msg); toast.appendChild(close);
    container.appendChild(toast);
    // auto-remove after timeout
    const tid = setTimeout(()=> removeToast(toast), timeout);
    function removeToast(node){
      if (!node) return;
      clearTimeout(tid);
      node.classList.remove('toast-enter'); node.classList.add('toast-exit');
      node.addEventListener('animationend', ()=>{ if (node.parentNode) node.parentNode.removeChild(node); });
    }
  }catch(e){
    // If toasts fail, log to console as a non-blocking fallback (avoid native alert())
    console.warn('Toast failed:', message, e);
  }
}
function renderCurrent(q=''){
  const path = location.hash.replace('#','') || '/';
  // update nav active state
  try{
    const links = document.querySelectorAll('.nav-list a[data-link]');
    links.forEach(a=>{
      const href = a.getAttribute('href') || '#/';
      const route = href.replace('#','') || '/';
      // Home ('/') should be active only when path is exactly '/'
      if (route === '/'){
        if (path === '/') a.classList.add('active'); else a.classList.remove('active');
      } else {
        if (path.startsWith(route)) a.classList.add('active'); else a.classList.remove('active');
      }
    });
  }catch(e){/* ignore */}
  if (path === '/') return renderHome();
  if (path.startsWith('/events')) return renderEvents(q);
  if (path.startsWith('/bookings')) return renderBookings();
  if (path.startsWith('/help')) return renderHelp();
  root.innerHTML = '<p>Not found</p>';
}

function renderEvents(q=''){
  // Merge persisted admin events from localStorage (in case they were added in another tab or after init)
  let merged = (store.events || []).slice();
  try{
    const raw = localStorage.getItem('campus:events');
    if (raw){
      const localEvents = JSON.parse(raw);
      if (Array.isArray(localEvents) && localEvents.length){
        // insert those that are not already present (by id)
        const ids = new Set(merged.map(e=>e.id));
        localEvents.forEach(le=>{ if (!ids.has(le.id)) merged.unshift(le); });
      }
    }
  }catch(e){/* ignore */}

  const events = (merged || []).filter(ev => {
    if (!q) return true;
    const txt = (ev.title + ' ' + ev.description).toLowerCase();
    return txt.includes(q.toLowerCase());
  });
  root.innerHTML = '';
  // Hero summary
  const hero = document.createElement('div');
  hero.className = 'hero';
  const h2 = document.createElement('h2');
  h2.textContent = 'Events';
  const p = document.createElement('p');
  p.textContent = events.length > 0 ? `Showing ${events.length} upcoming event${events.length>1? 's' : ''}` : 'No events found.';
  hero.appendChild(h2); hero.appendChild(p);
  root.appendChild(hero);

  const list = document.createElement('div');
  list.className = 'event-list';
  events.forEach((ev, idx)=>{
    const node = template.content.cloneNode(true);
    const article = node.querySelector('.event-card');
    article.dataset.id = ev.id;
    // stagger entrance
    article.style.setProperty('--delay', `${idx * 80}ms`);
    node.querySelector('.event-title').innerHTML = sanitizeInput(ev.title);
    // Format date for display: if ev.date is an ISO date, show locale date/time, otherwise show raw
    try{
      const dt = new Date(ev.date);
      let dateLabel = ev.date;
      if (!isNaN(dt)){
        const hasTime = /T\d/.test(String(ev.date));
        dateLabel = hasTime ? dt.toLocaleString() : dt.toLocaleDateString();
      }
      node.querySelector('.event-meta').textContent = `${dateLabel} — ${ev.location}`;
    }catch(e){
      node.querySelector('.event-meta').textContent = `${ev.date} — ${ev.location}`;
    }
    node.querySelector('.event-desc').innerHTML = sanitizeInput(ev.description);
    // set background image if provided or fallback to Assets/events/{id}.jpg
    try{
      const imagePath = ev.image || `Assets/events/${ev.id}.jpg`;
      if (imagePath) {
        article.style.backgroundImage = `url('${imagePath}')`;
        article.classList.add('has-image');
      }
    }catch(e){}
    // if admin mode, show a delete button on the card
    if (isAdminMode()){
      const actions = node.querySelector('.event-actions');
      const delBtn = document.createElement('button');
      delBtn.className = 'btn secondary delete-btn';
      delBtn.textContent = 'Delete';
      delBtn.setAttribute('aria-label', `Delete event ${ev.id}`);
      // insert before book button
      actions.appendChild(delBtn);
    }
    list.appendChild(node);
  });
  root.appendChild(list);
  // If navigation requested from the home carousel, scroll to that event card
  try{
    const focus = localStorage.getItem('campus:scrollToEvent');
    if (focus){
      localStorage.removeItem('campus:scrollToEvent');
      // give the DOM a tick to ensure nodes are attached
      setTimeout(()=>{
        try{
          const card = root.querySelector(`.event-card[data-id="${focus}"]`);
          if (card){
            card.scrollIntoView({behavior:'smooth', block:'center'});
            card.classList.add('hc-focus');
            setTimeout(()=> card.classList.remove('hc-focus'), 2400);
          }
        }catch(e){}
      }, 60);
    }
  }catch(e){}
}

function renderBookings(){
  root.innerHTML = '';
  const heading = document.createElement('h2'); heading.textContent = 'My Bookings';
  root.appendChild(heading);
  if (store.bookings.length===0) {
    root.appendChild(Object.assign(document.createElement('p'),{textContent:'No bookings yet'}));
    return;
  }
  const list = document.createElement('div');
  list.className = 'booking-list';
  store.bookings.slice().reverse().forEach(b=>{
    const card = document.createElement('div');
    card.className = 'booking-card';
    const left = document.createElement('div');
    const user = document.createElement('div'); user.className = 'user'; user.textContent = b.user;
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `Event: ${b.eventId}`;
    const created = document.createElement('div'); created.className = 'created'; created.textContent = new Date(b.created).toLocaleString();
    left.appendChild(user); left.appendChild(meta); left.appendChild(created);
    card.appendChild(left);
    // cancel button
    const actions = document.createElement('div');
    actions.style.display = 'flex'; actions.style.flexDirection = 'column'; actions.style.alignItems = 'flex-end';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary cancel-booking';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', ()=>{
      if (!confirm('Cancel this booking?')) return;
      try{
        const ok = store.removeBooking(b.id);
        if (ok){
          showToast('Booking cancelled', 'success');
          renderCurrent();
        } else {
          showToast('Could not cancel booking', 'error', true);
        }
      }catch(e){ showToast('Could not cancel booking', 'error', true); }
    });
    actions.appendChild(cancelBtn);
    card.appendChild(actions);
    list.appendChild(card);
  });
  root.appendChild(list);
}

function renderHelp(){
  root.innerHTML = '<h2>Help desk</h2><p>Open a ticket via email: support@campus.example</p>';
}

init();
