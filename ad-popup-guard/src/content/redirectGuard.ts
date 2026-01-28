type RedirectGuardOptions = {
  debug?: boolean;
};

const PATCHED = Symbol('redirect_guard_patched');

const BLOCK_PATTERNS = [/ads/i, /tracking/i, /doubleclick/i];

function isBlockedUrl(url: string) {
  return BLOCK_PATTERNS.some((r) => r.test(url));
}

function log(debug: boolean | undefined, ...args: any[]) {
  if (debug) console.log('[AdGuard][redirect]', ...args);
}

export function installRedirectGuard(opts: RedirectGuardOptions = {}) {
  const w = window as any;
  if (w[PATCHED]) return;
  w[PATCHED] = true;

  const { debug } = opts;

  // location.assign / location.replace
  const originalAssign = window.location.assign.bind(window.location);
  const originalReplace = window.location.replace.bind(window.location);

  window.location.assign = function (url: string) {
    if (isBlockedUrl(url)) {
      log(debug, 'blocked assign:', url);
      return;
    }
    return originalAssign(url);
  };

  window.location.replace = function (url: string) {
    if (isBlockedUrl(url)) {
      log(debug, 'blocked replace:', url);
      return;
    }
    return originalReplace(url);
  };

  // history api (SPA redirect)
  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);

  history.pushState = function (state: any, unused: string, url?: string | URL | null) {
    const s = url?.toString?.() ?? '';
    if (s && isBlockedUrl(s)) {
      log(debug, 'blocked pushState:', s);
      return;
    }
    return origPushState(state, unused, url as any);
  };

  history.replaceState = function (state: any, unused: string, url?: string | URL | null) {
    const s = url?.toString?.() ?? '';
    if (s && isBlockedUrl(s)) {
      log(debug, 'blocked replaceState:', s);
      return;
    }
    return origReplaceState(state, unused, url as any);
  };

  log(debug, 'Redirect guard installed');
}
