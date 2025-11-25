// Simple mock API client that fetches local JSON files. Demonstrates async/parallel fetch and error handling.
export async function fetchData() {
  // fetch events fixture only. Projects that need clubs should provide a real backend.
  try {
    const eventsRes = await fetch('data/events.json');
    if (!eventsRes.ok) throw new Error('Network response was not ok');
    const eventsJson = await eventsRes.json();
    // some fixtures wrap arrays in an object { events: [...] } — unwrap if necessary
    let events = Array.isArray(eventsJson) ? eventsJson : (eventsJson.events || eventsJson);

    // If developer added events via admin UI, merge persistent localStorage events (admin override)
    try{
      const raw = localStorage.getItem('campus:events');
      if (raw){
        const localEvents = JSON.parse(raw);
        if (Array.isArray(localEvents) && localEvents.length) {
          // prepend local events so they appear first
          events = localEvents.concat(events || []);
        }
      }
    }catch(e){
      // ignore localStorage parse errors
      console.warn('Could not read local admin events', e);
    }

    // clubs fixture removed — return empty array to keep API shape stable
    const clubs = [];
    return {events, clubs};
  } catch (err) {
    console.error('fetchData error', err);
    throw err;
  }
}

export async function postBooking(booking){
  // mock posting — simulate a delay and sometimes fail to demo failure modes
  await new Promise(r=>setTimeout(r, 400));
  if (Math.random() < 0.12) {
    // random failure
    const err = new Error('Booking service unavailable');
    err.code = 503;
    throw err;
  }
  return {status:'ok', id:Date.now(), ...booking};
}
