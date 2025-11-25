function sanitizeInput(str){
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`]/g, (c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;","`":"&#96;"
  }[c]));
}

function debounce(fn, wait=250){
  let t;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(()=>fn.apply(this,args), wait);
  };
}

module.exports = { sanitizeInput, debounce };
