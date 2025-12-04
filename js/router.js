// Minimal hash-based router
export function navigateTo(hash){
  location.hash = hash;
}

export function mountRouter(render){
  function route(){
    const path = location.hash.replace('#','') || '/';
    render(path);
  }
  window.addEventListener('hashchange', route);
  // initial
  route();
}
