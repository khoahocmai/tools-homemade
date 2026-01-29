// src/content/index.js
// Single-file content script (no build / no dynamic import).
// Includes: popupBlocker + redirectGuard + facebookCleaner
// Converted from your JS modules into a classic content-script file.

(() => {
  // -------------------------
  // Host allow-list
  // -------------------------
  const ALLOW_HOSTS = ["nhieutruyen.com", "metruyenchu.com", "facebook.com"];

  function isAllowedHost() {
    const h = location.hostname;
    return ALLOW_HOSTS.some((x) => h === x || h.endsWith(`.${x}`));
  }

  if (!isAllowedHost()) return;

  // -------------------------
  // popupBlocker.js (inlined)
  // -------------------------
  const PATCHED_POPUP = Symbol("ad_popup_guard_patched");
  const BLOCK_OPEN_PATTERNS = [
    /s\.shopee\.vn\//i,
    /tiktok\.com\/view\/product/i,
    /doubleclick/i,
    /tracking/i,
    /\/ads\b/i,
  ];

  function shouldBlockOpen(url) {
    return !!url && BLOCK_OPEN_PATTERNS.some((r) => r.test(url));
  }

  function logPopup(debug, ...args) {
    if (debug) console.log("[AdGuard][content]", ...args);
  }

  function installPopupBlocker(opts = {}) {
    const w = window;
    if (w[PATCHED_POPUP]) return;
    w[PATCHED_POPUP] = true;

    const { debug } = opts || {};

    // ---- patch window.open
    const originalOpen = window.open;
    const fakeWin = {
      closed: false,
      close() { },
      focus() { },
      blur() { },
      location: { href: "" },
    };

    window.open = function (url, target, features) {
      const href = typeof url === "string" ? url : url?.toString?.();

      if (shouldBlockOpen(href)) {
        logPopup(debug, "blocked window.open:", href);
        return fakeWin;
      }

      const opened = originalOpen.call(window, url, target, features);
      return opened ?? fakeWin; // tránh site gọi w.close => null crash
    };

    // ---- patch window.close (heuristic)
    const originalClose = window.close.bind(window);

    window.close = function () {
      // Heuristic: popup thường có opener hoặc history rất ngắn + referrer khác origin
      const hasOpener = !!window.opener;
      const shortHistory = history.length <= 2;
      const ref = document.referrer || "";
      const crossRef =
        ref &&
        (() => {
          try {
            return new URL(ref).origin !== location.origin;
          } catch {
            return true;
          }
        })();

      const isLikelyPopup = hasOpener || (shortHistory && crossRef);

      try {
        chrome.runtime?.sendMessage?.({
          type: "window_close_called",
          href: location.href,
          title: document.title,
          isLikelyPopup,
        });
      } catch { }

      if (isLikelyPopup) {
        logPopup(debug, "blocked window.close on likely popup:", location.href);
        return;
      }

      logPopup(debug, "allow window.close:", location.href);
      return originalClose();
    };

    logPopup(debug, "Popup blocker installed");
  }

  // -------------------------
  // redirectGuard.js (inlined)
  // -------------------------
  const PATCHED_REDIRECT = Symbol("redirect_guard_patched");
  const BLOCK_PATTERNS = [/ads/i, /tracking/i, /doubleclick/i];

  function isBlockedUrl(url) {
    return BLOCK_PATTERNS.some((r) => r.test(url));
  }

  function logRedirect(debug, ...args) {
    if (debug) console.log("[AdGuard][redirect]", ...args);
  }

  function installRedirectGuard(opts = {}) {
    const w = window;
    if (w[PATCHED_REDIRECT]) return;
    w[PATCHED_REDIRECT] = true;

    const { debug } = opts || {};

    // location.assign / location.replace
    const originalAssign = window.location.assign.bind(window.location);
    const originalReplace = window.location.replace.bind(window.location);

    window.location.assign = function (url) {
      if (isBlockedUrl(url)) {
        logRedirect(debug, "blocked assign:", url);
        return;
      }
      return originalAssign(url);
    };

    window.location.replace = function (url) {
      if (isBlockedUrl(url)) {
        logRedirect(debug, "blocked replace:", url);
        return;
      }
      return originalReplace(url);
    };

    // history api (SPA redirect)
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);

    history.pushState = function (state, unused, url) {
      const s = url?.toString?.() ?? "";
      if (s && isBlockedUrl(s)) {
        logRedirect(debug, "blocked pushState:", s);
        return;
      }
      return origPushState(state, unused, url);
    };

    history.replaceState = function (state, unused, url) {
      const s = url?.toString?.() ?? "";
      if (s && isBlockedUrl(s)) {
        logRedirect(debug, "blocked replaceState:", s);
        return;
      }
      return origReplaceState(state, unused, url);
    };

    logRedirect(debug, "Redirect guard installed");
  }

  // -------------------------
  // facebookCleaner.js (inlined)
  // -------------------------
  const PATCHED_FB = Symbol("fb_cleaner_patched");

  function cleanFacebook() {
    const w = window;
    if (w[PATCHED_FB]) return;
    w[PATCHED_FB] = true;

    if (!location.hostname.includes("facebook.com")) return;

    setInterval(() => {
      document
        .querySelectorAll('[aria-label="Sponsored"]')
        .forEach((el) => el.closest('[role="article"]')?.remove());
    }, 1500);
  }

  // -------------------------
  // Main
  // -------------------------
  const debug = false; // set true if you want console logs
  try {
    installPopupBlocker({ debug });
  } catch (e) {
    console.warn("[AdGuard] installPopupBlocker failed", e);
  }

  try {
    installRedirectGuard({ debug });
  } catch (e) {
    console.warn("[AdGuard] installRedirectGuard failed", e);
  }

  try {
    cleanFacebook();
  } catch (e) {
    console.warn("[AdGuard] cleanFacebook failed", e);
  }
})();
