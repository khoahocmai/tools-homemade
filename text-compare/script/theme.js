(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.initThemeToggle = function initThemeToggle() {
    const btn = TC.$("btnToggleTheme");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const theme = document.documentElement.getAttribute("data-theme");
      if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "dark");
        btn.textContent = "🌙";
      } else {
        document.documentElement.setAttribute("data-theme", "light");
        btn.textContent = "🌞";
      }
    });
  };
})();
