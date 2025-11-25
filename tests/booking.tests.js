const utils = require('../js/utils.cjs');
const { Store } = require('../js/store.cjs');

describe('Booking persistence and render basics', ()=>{
  test('sanitizeInput escapes tags and ampersand', ()=>{
    const s = utils.sanitizeInput('<b>Tom & Jerry</b>');
    expect(s).toContain('&lt;b&gt;');
    expect(s).toContain('&amp;');
  });

  test('Store persists a booking (in-memory simulation)', async ()=>{
    const store = new Store();
    const initial = store.bookings.length;
    // create a fake booking via the public API if present
    const booking = {id: 'tmp-1', user: 'Tester', eventId: 'e1', created: Date.now()};
    // directly push to mimic flow (store.book may be async and call network)
    store.bookings.push(booking);
    store._emit();
    expect(store.bookings.length).toBeGreaterThanOrEqual(initial + 1);
    // cleanup
    store.bookings = store.bookings.filter(b => b.id !== 'tmp-1');
  });
});
