export function cleanFacebook() {
  if (!location.hostname.includes('facebook.com')) return;


  setInterval(() => {
    document
      .querySelectorAll('[aria-label="Sponsored"]')
      .forEach(el => el.closest('[role="article"]')?.remove());
  }, 1500);
}