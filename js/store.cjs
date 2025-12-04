// Test-friendly CommonJS Store used by Jest tests.
const LS_KEY = 'campus:bookings';

class Store {
  constructor(){
    this.events = [];
    this.clubs = [];
    this.bookings = this._loadBookings();
    this.listeners = new Set();
  }

  _loadBookings(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      return [];
    }
  }

  _saveBookings(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(this.bookings)); }catch(e){}
  }

  subscribe(cb){ this.listeners.add(cb); }
  unsubscribe(cb){ this.listeners.delete(cb); }
  _emit(){ this.listeners.forEach(cb=>cb(this)); }

  setData({events, clubs}){
    this.events = events || [];
    this.clubs = clubs || [];
    this._emit();
  }

  // book(eventId, user, postBooking) - postBooking injected for testability
  async book(eventId, user, postBooking){
    const booking = {id: 'temp-'+Date.now(), eventId, user, created: new Date().toISOString()};
    this.bookings.push(booking);
    this._saveBookings();
    this._emit();
    try{
      const res = await postBooking(booking);
      this.bookings = this.bookings.map(b => b.id===booking.id ? Object.assign({}, b, {id: res.id}) : b);
      this._saveBookings();
      this._emit();
      return res;
    }catch(err){
      // rollback optimistic update
      this.bookings = this.bookings.filter(b => b.id !== booking.id);
      this._saveBookings();
      this._emit();
      throw err;
    }
  }
}

module.exports = { Store };
