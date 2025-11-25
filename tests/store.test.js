const { Store } = require('../js/store.cjs');

describe('Store optimistic booking', ()=>{
  beforeEach(()=>{
    localStorage.clear();
  });
  afterEach(()=>{
    localStorage.clear();
    jest.resetAllMocks();
  });

  test('successful booking replaces temp id', async ()=>{
    const store = new Store();
    const mockPost = jest.fn().mockResolvedValue({status:'ok', id: 9999});
    const p = store.book('e1','Alice', mockPost);
    // optimistic update should have happened
    expect(store.bookings.length).toBe(1);
    expect(String(store.bookings[0].id)).toMatch(/^temp-/);
    await p;
    // after success, id replaced
    expect(store.bookings.length).toBe(1);
    expect(store.bookings[0].id).toBe(9999);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test('failed booking rolls back optimistic entry', async ()=>{
    const store = new Store();
    const mockPost = jest.fn().mockRejectedValue(new Error('network'));
    await expect(store.book('e2','Bob', mockPost)).rejects.toThrow('network');
    // booking should have been rolled back
    expect(store.bookings.length).toBe(0);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
