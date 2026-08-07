(() => {
    "use strict";

    const storageKey = "erp-work-orders-theme-lab-v11-frozen-reference";
    const allowedThemes = new Set(["energy-v11"]);
    const buttons = Array.from(document.querySelectorAll("[data-theme-value]"));
    const description = document.getElementById("theme-description");
    const descriptions = {
        "energy-v10": "قبل التعديل v10: جدول بخطوط رأسية أوضح، بحث بزر مستقل، وتمييز أزرق فقط.",
        "energy-v11": "تنقيح v11: صفوف بلون موحّد، خطوط رأسية أخف، ذهبي مطفأ للمتبقي، وبحث فاخر بلا زر."
    };

    function applyTheme(theme) {
        const safeTheme = allowedThemes.has(theme) ? theme : "energy-v11";
        document.documentElement.dataset.theme = safeTheme;

        for (const button of buttons) {
            const active = button.dataset.themeValue === safeTheme;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        }

        if (description) {
            description.textContent = descriptions[safeTheme];
        }

        try {
            localStorage.setItem(storageKey, safeTheme);
        } catch {
            // The isolated lab remains usable when storage is disabled.
        }
    }

    for (const button of buttons) {
        button.addEventListener("click", () => applyTheme(button.dataset.themeValue));
    }

    let initialTheme = "energy-v11";
    try {
        initialTheme = "energy-v11";
    } catch {
        // Use the default refinement.
    }

    applyTheme(initialTheme);
})();
