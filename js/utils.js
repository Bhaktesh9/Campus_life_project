// Small utilities (pure functions where possible)
export function sanitizeInput(str){
  // very small sanitizer to prevent markup injection in UI
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`]/g, (c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;","`":"&#96;"
  }[c]));
}

export function debounce(fn, wait=250){
  let t;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(()=>fn.apply(this,args), wait);
  };
}
