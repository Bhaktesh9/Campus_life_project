// Canvas-based month mini-calendar — dynamic import (code-splitting)
import {fetchData} from './api.js';

function isoDate(d){
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0,10);
  try{ return new Date(d).toISOString().slice(0,10); }catch(e){ return null }
}

export async function createCalendar(container){
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label','Calendar dialog');
  dialog.innerHTML = `
    <div style="padding:1rem;max-width:720px;width:100%">
      <h2 style="margin:0 0 0.5rem">Mini Calendar</h2>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
        <div>
          <button id="cal-prev" class="btn secondary">◀</button>
          <button id="cal-next" class="btn secondary">▶</button>
        </div>
        <div id="cal-title" style="font-weight:700"></div>
        <div style="width:120px;text-align:right"><button class="btn close">Close</button></div>
      </div>
      <canvas id="mini-canvas" width="700" height="420" style="width:100%;height:auto;border:1px solid #eee;border-radius:6px"></canvas>
      <div id="cal-events" style="margin-top:0.5rem;max-height:220px;overflow:auto;padding:0.5rem;border-radius:6px;background:#fff;border:1px solid #f1f5f9"></div>
    </div>`;
  container.appendChild(dialog);
  const canvas = dialog.querySelector('#mini-canvas');
  const ctx = canvas.getContext('2d');
  const title = dialog.querySelector('#cal-title');
  const eventsList = dialog.querySelector('#cal-events');

  // load events
  let events = [];
  try{
    const data = await fetchData();
    events = (data && data.events) ? data.events : [];
  }catch(e){ console.warn('Calendar: could not load events', e); }

  // normalize events by ISO date
  const eventsByDate = new Map();
  events.forEach(ev=>{
    const d = isoDate(ev.date);
    if (!d) return;
    if (!eventsByDate.has(d)) eventsByDate.set(d, []);
    eventsByDate.get(d).push(ev);
  });

  // current view
  let view = new Date();
  view.setDate(1);

  let hoverCell = null;
  function render(){
    renderMonth(ctx, view.getFullYear(), view.getMonth(), eventsByDate, title, eventsList, hoverCell);
  }

  dialog.querySelector('.close').addEventListener('click', ()=>dialog.close());
  dialog.querySelector('#cal-prev').addEventListener('click', ()=>{ view.setMonth(view.getMonth()-1); render(); });
  dialog.querySelector('#cal-next').addEventListener('click', ()=>{ view.setMonth(view.getMonth()+1); render(); });

  // mouse handling: highlight date under cursor; click shows events
  canvas.addEventListener('mousemove', (ev)=>{
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
    const picked = hitTestCell(canvas, view.getFullYear(), view.getMonth(), x, y);
    if (picked){
      canvas.style.cursor = 'pointer';
      // if different from current hover, update and redraw
      if (!hoverCell || hoverCell.day !== picked.day || hoverCell.month !== picked.month || hoverCell.year !== picked.year){
        hoverCell = picked;
        render();
      }
    } else {
      canvas.style.cursor = 'default';
      if (hoverCell) { hoverCell = null; render(); }
    }
  });
  canvas.addEventListener('mouseout', ()=>{ if (hoverCell) { hoverCell = null; render(); } });

  // click handling: map click to date cell
  canvas.addEventListener('click', (ev)=>{
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
    const picked = hitTestCell(canvas, view.getFullYear(), view.getMonth(), x, y);
    if (picked){
      const key = `${picked.year}-${String(picked.month+1).padStart(2,'0')}-${String(picked.day).padStart(2,'0')}`;
      showEventsForDate(key, eventsByDate, eventsList);
    }
  });

  render();
  dialog.showModal();
}

function showEventsForDate(key, eventsByDate, eventsList){
  const evs = eventsByDate.get(key) || [];
  eventsList.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = `${key} — ${evs.length} event${evs.length!==1?'s':''}`;
  eventsList.appendChild(h);
  if (evs.length===0){
    const p = document.createElement('p'); p.textContent = 'No events on this date.'; eventsList.appendChild(p); return;
  }
  evs.forEach(e=>{
    const el = document.createElement('div');
    el.style.padding = '0.45rem 0';
    el.style.borderBottom = '1px solid #f0f4f8';
    const t = document.createElement('div'); t.style.fontWeight='700'; t.textContent = e.title;
    const m = document.createElement('div'); m.style.color='#6b7280'; m.textContent = `${e.location || ''}`;
    const d = document.createElement('div'); d.textContent = e.description || '';
    el.appendChild(t); el.appendChild(m); el.appendChild(d);
    eventsList.appendChild(el);
  });
}

function hitTestCell(canvas, year, month, x, y){
  const headerH = 56; // px used for title
  const cols = 7;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const rows = Math.ceil((firstDay + daysInMonth)/7);
  const cellW = canvas.width / cols;
  const cellH = (canvas.height - headerH) / rows;
  if (y < headerH) return null;
  const col = Math.floor(x / cellW);
  const row = Math.floor((y - headerH) / cellH);
  const index = row*7 + col;
  const dayNum = index - firstDay + 1;
  if (dayNum < 1 || dayNum > daysInMonth) return null;
  return {year, month, day: dayNum};
}

function renderMonth(ctx, year, month, eventsByDate, titleEl, eventsList, hoverCell){
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0,0,w,h);
  // background
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
  // title
  const monthLabel = new Date(year, month, 1).toLocaleString(undefined,{month:'long',year:'numeric'});
  if (titleEl) titleEl.textContent = monthLabel;
  ctx.fillStyle = '#0b6efd'; ctx.font = '18px sans-serif';
  ctx.fillText(monthLabel, 12, 28);

  // grid
  const cols = 7;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const rows = Math.ceil((firstDay + daysInMonth)/7);
  const headerH = 56;
  const cellW = w / cols;
  const cellH = (h - headerH) / rows;

  // weekday header
  ctx.fillStyle = '#374151'; ctx.font = '12px sans-serif';
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  weekdays.forEach((d,i)=>{ ctx.fillText(d, i*cellW + 8, 44); });

  ctx.strokeStyle = '#eef3ff'; ctx.lineWidth = 1;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x = c*cellW, y = headerH + r*cellH;
      ctx.strokeRect(x, y, cellW, cellH);
    }
  }

  // draw days and event markers
  ctx.textBaseline = 'top'; ctx.font = '12px sans-serif';
  for(let i=0;i<daysInMonth;i++){
    const dayIndex = firstDay + i; const r = Math.floor(dayIndex/7); const c = dayIndex%7;
    const x = c*cellW, y = headerH + r*cellH;
    // day number
    ctx.fillStyle = '#0f1724'; ctx.fillText(String(i+1), x+8, y+6);
    // events
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
    const evs = eventsByDate.get(key) || [];
    const maxDots = 4;
    evs.slice(0,maxDots).forEach((ev, idx)=>{
      const dotX = x + 8 + (idx*10);
      const dotY = y + 26;
      ctx.fillStyle = idx % 2 === 0 ? '#6c5ce7' : '#00b894';
      ctx.beginPath(); ctx.arc(dotX, dotY, 4, 0, Math.PI*2); ctx.fill();
    });
    if (evs.length > maxDots){
      ctx.fillStyle = '#6b7280'; ctx.fillText('+' + (evs.length-maxDots), x + cellW - 28, y + 6);
    }
    // highlight today
    const today = isoDate(new Date());
    if (key === today){ ctx.fillStyle = 'rgba(11,110,253,0.08)'; ctx.fillRect(x+1, y+1, cellW-2, cellH-2); }
  }

  // hover highlight (draw after days so it sits above markers):
  if (hoverCell && hoverCell.year === year && hoverCell.month === month){
    const fd = new Date(year, month, 1).getDay();
    const idx = fd + (hoverCell.day - 1);
    const rr = Math.floor(idx/7); const cc = idx % 7;
    const hx = cc*cellW, hy = headerH + rr*cellH;
    ctx.fillStyle = 'rgba(108,92,231,0.08)';
    ctx.fillRect(hx+1, hy+1, cellW-2, cellH-2);
    // update title with hovered date
    if (titleEl) titleEl.textContent = monthLabel + ' — ' + `${hoverCell.year}-${String(hoverCell.month+1).padStart(2,'0')}-${String(hoverCell.day).padStart(2,'0')}`;
  }

  // clear event list when month changes
  if (eventsList) eventsList.innerHTML = '<p class="muted">Click a date to see events</p>';
}
