const PATCHED = Symbol('fb_cleaner_patched');

export function cleanFacebook() {
  const w = window as any;
  if (w[PATCHED]) return;
  w[PATCHED] = true;

  if (!location.hostname.includes('facebook.com')) return;

  setInterval(() => {
    document
      .querySelectorAll('[aria-label="Sponsored"]')
      .forEach((el) => el.closest('[role="article"]')?.remove());
  }, 1500);
}
