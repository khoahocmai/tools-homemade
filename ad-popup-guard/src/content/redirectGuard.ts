const BLOCK_PATTERNS = [/ads/i, /tracking/i, /doubleclick/i];

export function guardRedirect() {
  const originalAssign = window.location.assign;


  window.location.assign = function (url: string) {
    if (BLOCK_PATTERNS.some(r => r.test(url))) return;
    return originalAssign.call(window.location, url);
  };
}