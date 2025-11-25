describe('toasts', ()=>{
  beforeEach(()=>{
    // set up DOM containers provided by Jest's jsdom environment
    document.body.innerHTML = `
      <div id="toast-container-polite"></div>
      <div id="toast-container-assertive"></div>
    `;
  });

  afterEach(()=>{
    jest.clearAllTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
    jest.resetModules();
  });

  test('showToast adds a toast to polite container and auto-removes', ()=>{
    jest.useFakeTimers();
    const { showToast } = require('../js/toast.cjs');
    const container = document.getElementById('toast-container-polite');
    expect(container.children.length).toBe(0);
    showToast('Hello world', 'success', false, 1000);
    expect(container.children.length).toBe(1);
    const toast = container.children[0];
    expect(toast.textContent).toContain('Hello world');
    // advance time and assert removal
    jest.advanceTimersByTime(1000);
    expect(container.children.length).toBe(0);
  });

  test('assertive toast goes to assertive container', ()=>{
    const { showToast } = require('../js/toast.cjs');
    const container = document.getElementById('toast-container-assertive');
    showToast('Error happened', 'error', true, 2000);
    expect(container.children.length).toBe(1);
    expect(container.children[0].textContent).toContain('Error happened');
  });
});
