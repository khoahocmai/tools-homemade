type PopupBlockerOptions = {
  debug?: boolean;
};

const PATCHED = Symbol('ad_popup_guard_patched');

const BLOCK_OPEN_PATTERNS = [
  /s\.shopee\.vn\//i,
  /tiktok\.com\/view\/product/i,
  /doubleclick/i,
  /tracking/i,
  /\/ads\b/i,
];

function shouldBlockOpen(url?: string) {
  return !!url && BLOCK_OPEN_PATTERNS.some((r) => r.test(url));
}

function log(debug: boolean | undefined, ...args: any[]) {
  if (debug) console.log('[AdGuard][content]', ...args);
}

export function installPopupBlocker(opts: PopupBlockerOptions = {}) {
  const w = window as any;
  if (w[PATCHED]) return;
  w[PATCHED] = true;

  const { debug } = opts;

  // ---- patch window.open
  const originalOpen = window.open;

  const fakeWin: any = {
    closed: false,
    close() { },
    focus() { },
    blur() { },
    location: { href: '' },
  };

  window.open = function (url?: any, target?: any, features?: any) {
    const href = typeof url === 'string' ? url : url?.toString?.();

    if (shouldBlockOpen(href)) {
      log(debug, 'blocked window.open:', href);
      return fakeWin;
    }

    const w = originalOpen.call(window, url, target, features);
    return w ?? fakeWin; // tránh site gọi w.close => null crash
  };

  // ---- patch window.close (heuristic)
  // Chỉ chặn “đóng cửa sổ” nếu khả năng cao đây là popup/child window.
  // Các trang bình thường (tab chính) thường không thể close bằng JS,
  // nhưng patch bừa vẫn có thể gây side-effect -> nên hạn chế.
  const originalClose = window.close.bind(window);

  window.close = function () {
    // Heuristic: popup thường có opener hoặc history rất ngắn + referrer khác origin
    const hasOpener = !!window.opener;
    const shortHistory = history.length <= 2;
    const ref = document.referrer || '';
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
        type: 'window_close_called',
        href: location.href,
        title: document.title,
        isLikelyPopup,
      });
    } catch { }

    if (isLikelyPopup) {
      log(debug, 'blocked window.close on likely popup:', location.href);
      return;
    }

    // Nếu là trường hợp “hợp lệ” thì cho close
    log(debug, 'allow window.close:', location.href);
    return originalClose();
  };

  log(debug, 'Popup blocker installed');
}
