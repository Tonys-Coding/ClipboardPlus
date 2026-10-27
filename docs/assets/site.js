(() => {
  const key = 'clipboardPlusSiteTheme';
  try {
    document.documentElement.dataset.theme = localStorage.getItem(key) === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }

  window.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('[data-theme-toggle]');
    if (!(button instanceof HTMLButtonElement)) return;
    const sync = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      button.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
      button.setAttribute('aria-pressed', String(dark));
    };
    sync();
    button.addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem(key, dark ? 'light' : 'dark'); } catch { /* Appearance still changes for this visit. */ }
      sync();
    });
  });
})();
