(() => {
    "use strict";
    const input = document.querySelector('.search-box input');
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') event.preventDefault();
        });
    }
})();


(() => {
  "use strict";
  const trigger = document.querySelector('.search-trigger');
  const popover = document.querySelector('.search-popover');
  const close = document.querySelector('.search-close');
  const input = popover?.querySelector('input');
  const openSearch = () => { if (!popover) return; popover.hidden = false; requestAnimationFrame(() => input?.focus()); };
  const closeSearch = () => { if (!popover) return; popover.hidden = true; };
  trigger?.addEventListener('click', () => popover?.hidden ? openSearch() : closeSearch());
  close?.addEventListener('click', closeSearch);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape') closeSearch();
  });
})();
