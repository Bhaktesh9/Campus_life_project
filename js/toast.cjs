// CommonJS test-friendly toast utility for Jest environment.
// This mirrors the behavior of the browser showToast but simplifies removal
// so tests can assert removal using timers.
function showToast(message, type = 'info', assertive = false, timeout = 4500){
  try{
    const container = (typeof document !== 'undefined') ?
      document.getElementById(assertive? 'toast-container-assertive' : 'toast-container-polite') : null;
    if (!container) return null;
    const toast = document.createElement('div');
    toast.className = `toast ${type==='success'? 'success' : type==='error'? 'error' : ''}`;
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live', assertive? 'assertive' : 'polite');
    const msg = document.createElement('div'); msg.className = 'msg'; msg.textContent = message;
    const close = document.createElement('button'); close.className = 'close'; close.setAttribute('aria-label','Dismiss'); close.textContent = '×';
    close.addEventListener('click', ()=>{ removeToast(toast); });
    toast.appendChild(msg); toast.appendChild(close);
    container.appendChild(toast);
    const tid = setTimeout(()=> removeToast(toast), timeout);
    function removeToast(node){
      if (!node || !node.parentNode) return;
      clearTimeout(tid);
      // remove immediately for test determinism
      node.parentNode.removeChild(node);
    }
    return toast;
  }catch(e){
    // non-blocking fallback
    if (typeof console !== 'undefined') console.warn('Toast failed:', message, e);
    return null;
  }
}

module.exports = { showToast };
