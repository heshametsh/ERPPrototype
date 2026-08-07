(() => {
    "use strict";

    const input = document.querySelector('.search-box input');
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') event.preventDefault();
        });
    }

    const openButton = document.getElementById('openBasketDetails');
    const closeButton = document.getElementById('closeBasketDetails');
    const panel = document.getElementById('basketDetailsPanel');
    const backdrop = document.getElementById('basketDetailsBackdrop');
    let lastFocusedElement = null;

    function openPanel() {
        if (!panel || !backdrop || !openButton) return;
        lastFocusedElement = document.activeElement;
        backdrop.hidden = false;
        requestAnimationFrame(() => {
            backdrop.classList.add('is-visible');
            panel.classList.add('is-open');
        });
        panel.setAttribute('aria-hidden', 'false');
        openButton.setAttribute('aria-expanded', 'true');
        document.body.classList.add('basket-panel-open');
        closeButton?.focus();
    }

    function closePanel() {
        if (!panel || !backdrop || !openButton) return;
        panel.classList.remove('is-open');
        backdrop.classList.remove('is-visible');
        panel.setAttribute('aria-hidden', 'true');
        openButton.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('basket-panel-open');
        window.setTimeout(() => { backdrop.hidden = true; }, 190);
        if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    }

    openButton?.addEventListener('click', openPanel);
    closeButton?.addEventListener('click', closePanel);
    backdrop?.addEventListener('click', closePanel);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel?.classList.contains('is-open')) closePanel();
    });
})();
