import {postBooking} from './api.js';

// Simple class-based store for app state. Persists bookings to localStorage.
export class Store {
  // Accept an optional postBooking function for easier testing/DI
  constructor(options = {}) {
    this.events = [];
    this.clubs = [];
    this.bookings = this._loadBookings();
    this.listeners = new Set();
    // dependency injection: default to imported postBooking, but tests can override
    this._postBooking = options.postBooking || postBooking;
  }

  _loadBookings(){
    try{
      const raw = localStorage.getItem('campus:bookings');
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      console.warn('Could not parse bookings', e);
      return [];
    }
  }

  _saveBookings(){
    localStorage.setItem('campus:bookings', JSON.stringify(this.bookings));
  }

  subscribe(cb){ this.listeners.add(cb); }
  unsubscribe(cb){ this.listeners.delete(cb); }
  _emit(){ this.listeners.forEach(cb=>cb(this)); }

  setData({events, clubs}){
    // defensive: accept either an array or an object wrapping the array
    this.events = Array.isArray(events) ? events : (events && events.events) ? events.events : [];
    this.clubs = Array.isArray(clubs) ? clubs : (clubs && clubs.clubs) ? clubs.clubs : [];
    this._emit();
  }

  async book(eventId, user){
    // optimistic update
    const booking = {id: 'temp-'+Date.now(), eventId, user, created: new Date().toISOString()};
    this.bookings.push(booking);
    this._saveBookings();
    this._emit();
    try{
      const res = await this._postBooking(booking);
      // replace temp id with real id
      this.bookings = this.bookings.map(b => b.id===booking.id ? {...b, id: res.id} : b);
      this._saveBookings();
      this._emit();
      return res;
    }catch(err){
      // rollback optimistic booking on error
      this.bookings = this.bookings.filter(b=>b.id!==booking.id);
      this._saveBookings();
      this._emit();
      throw err;
    }
  }

  // remove a booking by id
  removeBooking(id){
    if (!id) return false;
    const before = this.bookings.length;
    this.bookings = this.bookings.filter(b=>b.id !== id);
    if (this.bookings.length !== before){
      try{ this._saveBookings(); }catch(e){}
      this._emit();
      return true;
    }
    return false;
  }
}
