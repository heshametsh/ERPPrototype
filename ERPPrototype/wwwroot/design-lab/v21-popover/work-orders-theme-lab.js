(() => {
  "use strict";
  const input=document.querySelector('.search-box input');
  input?.addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault();});
  const btn=document.getElementById('openBasketDetails');
  const close=document.getElementById('closeBasketDetails');
  const panel=document.getElementById('basketDetailsPanel');
  function setOpen(open){
    panel?.classList.toggle('is-open',open);
    panel?.setAttribute('aria-hidden',open?'false':'true');
    btn?.setAttribute('aria-expanded',open?'true':'false');
  }
  btn?.addEventListener('click',e=>{e.stopPropagation();setOpen(!panel?.classList.contains('is-open'));});
  close?.addEventListener('click',e=>{e.stopPropagation();setOpen(false);});
  panel?.addEventListener('click',e=>e.stopPropagation());
  document.addEventListener('click',()=>setOpen(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});
})();
