(() => {
    "use strict";
    const input = document.querySelector('.search-box input');
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') event.preventDefault();
        });
    }
})();
