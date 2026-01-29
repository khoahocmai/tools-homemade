// src/background/service-worker.js
// Converted from TypeScript -> plain JavaScript (no build step)

/** ===== Config ===== */
const RULE_IDS = [1001, 1002];

const BLOCKED_PATTERNS = [
  /tiktok\.com\/view\/product/i,
  /s\.shopee\.vn\//i,
];

const BLANK_URLS = new Set([
  'about:blank',
  'chrome://newtab/',
  'edge://newtab/',
]);

const FIRST_URL_KEY = (tabId) => `first_url_${tabId}`;
const LAST_GOOD_URL_KEY = (tabId) => `last_good_url_${tabId}`;
const RESTORE_AT_KEY = (tabId) => `last_restore_at_${tabId}`;

/** ===== State ===== */
let enabled = true;

/** ===== Utils ===== */
function isBlockedUrl(url) {
  if (!url) return false;
  return BLOCKED_PATTERNS.some((r) => r.test(url));
}

function isGoodUrl(url) {
  if (!url) return false;
  if (url === 'about:blank') return false;
  if (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://')
  ) {
    return false;
  }
  if (isBlockedUrl(url)) return false;
  return true;
}

function isBlankLike(url) {
  if (!url) return true;
  if (BLANK_URLS.has(url)) return true;
  // đôi khi Chrome trả về url rỗng hoặc chỉ "about:blank#..."
  if (url.startsWith('about:blank')) return true;
  return false;
}

async function getWindowTabCount(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.length;
}

async function safeCloseTab(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.windowId) return;

  const count = await getWindowTabCount(tab.windowId).catch(() => 0);

  // Tab cuối: không remove để tránh “cảm giác như tắt browser”
  if (count <= 1) {
    await chrome.tabs.update(tabId, { url: 'chrome://newtab/' }).catch(() => { });
    return;
  }

  await chrome.tabs.remove(tabId).catch(() => {
    // fallback nếu remove fail
    chrome.tabs.update(tabId, { url: 'chrome://newtab/' }).catch(() => { });
  });
}

async function focusOpenerAndClosePopup(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.openerTabId) return;

  // focus lại tab gốc trước
  await chrome.tabs.update(tab.openerTabId, { active: true }).catch(() => { });
  // rồi đóng tab trắng
  await safeCloseTab(tabId);
}

async function setRules(isOn) {
  // Nếu tắt: remove rules
  if (!isOn) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [...RULE_IDS],
    });
    return;
  }

  // Nếu bật: add rules redirect -> about:blank
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [...RULE_IDS],
    addRules: [
      {
        id: 1001,
        priority: 1,
        action: { type: 'redirect', redirect: { url: 'about:blank' } },
        condition: { urlFilter: 'tiktok.com/view/product', resourceTypes: ['main_frame'] },
      },
      {
        id: 1002,
        priority: 1,
        action: { type: 'redirect', redirect: { url: 'about:blank' } },
        condition: { urlFilter: 's.shopee.vn/', resourceTypes: ['main_frame'] },
      },
    ],
  });
}

async function loadEnabledFlag() {
  const res = await chrome.storage.local.get(['enabled']);
  enabled = typeof res.enabled === 'boolean' ? res.enabled : true;
}

/** ===== Bootstrap ===== */
chrome.runtime.onInstalled.addListener(() => {
  void loadEnabledFlag().then(() => setRules(enabled)).catch(() => { });
});

// onStartup exists on Chrome; optional chaining for other Chromium forks
chrome.runtime.onStartup?.addListener(() => {
  void loadEnabledFlag().then(() => setRules(enabled)).catch(() => { });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!('enabled' in changes)) return;

  enabled = typeof changes.enabled.newValue === 'boolean' ? changes.enabled.newValue : true;
  void setRules(enabled).catch(() => { });
});

/** ===== Track first URL of newly created tab (to detect popup ads) ===== */
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.id) return;
  if (!tab.openerTabId) return;

  const first = tab.pendingUrl || tab.url || '';

  // ✅ lưu lại first url để onCompleted() check popup bẩn
  try {
    await chrome.storage.session.set({ [FIRST_URL_KEY(tab.id)]: first });
  } catch { }

  // nếu vừa tạo ra đã blank thì đóng luôn (nhanh gọn)
  if (isBlankLike(first)) {
    setTimeout(() => focusOpenerAndClosePopup(tab.id), 150);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab?.openerTabId) return;
  if (!changeInfo.url) return;

  // update first url nếu trước đó chưa có (best-effort)
  if (changeInfo.url && !isBlankLike(changeInfo.url)) {
    chrome.storage.session.get(FIRST_URL_KEY(tabId)).then((obj) => {
      if (!obj?.[FIRST_URL_KEY(tabId)]) {
        chrome.storage.session.set({ [FIRST_URL_KEY(tabId)]: changeInfo.url }).catch(() => { });
      }
    }).catch(() => { });
  }

  if (isBlankLike(changeInfo.url)) {
    setTimeout(() => {
      focusOpenerAndClosePopup(tabId);
    }, 50);
  }
});

/** ===== Track last good URL per tab ===== */
async function saveLastGoodUrl(tabId, url) {
  if (!enabled) return;
  if (!isGoodUrl(url)) return;
  await chrome.storage.session.set({ [LAST_GOOD_URL_KEY(tabId)]: url });
}

chrome.webNavigation.onCommitted.addListener((d) => {
  if (!enabled) return;
  if (d.frameId !== 0) return;
  if (isGoodUrl(d.url)) void saveLastGoodUrl(d.tabId, d.url).catch(() => { });
});

chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (!enabled) return;
  if (d.frameId !== 0) return;
  if (isGoodUrl(d.url)) void saveLastGoodUrl(d.tabId, d.url).catch(() => { });
});

/** ===== Core: handle about:blank redirected tabs ===== */
chrome.webNavigation.onCompleted.addListener(async (d) => {
  if (!enabled) return;
  if (d.frameId !== 0) return;

  const url = String(d.url || '');
  if (!url.startsWith('about:blank')) return;

  const tab = await chrome.tabs.get(d.tabId).catch(() => null);
  if (!tab) return;

  // Loop guard: tránh restore liên tục
  const now = Date.now();
  const restoreObj = await chrome.storage.session.get(RESTORE_AT_KEY(d.tabId)).catch(() => ({}));
  const lastRestoreAt = restoreObj[RESTORE_AT_KEY(d.tabId)];

  if (lastRestoreAt && now - lastRestoreAt < 1200) {
    await chrome.tabs.update(d.tabId, { url: 'chrome://newtab/' }).catch(() => { });
    return;
  }
  await chrome.storage.session.set({ [RESTORE_AT_KEY(d.tabId)]: now }).catch(() => { });

  // Nếu là popup tab: check firstUrl có bị block không
  if (tab.openerTabId) {
    const firstObj = await chrome.storage.session.get(FIRST_URL_KEY(d.tabId)).catch(() => ({}));
    const firstUrl = firstObj[FIRST_URL_KEY(d.tabId)];

    if (isBlockedUrl(firstUrl)) {
      // focus lại tab gốc (best-effort)
      void chrome.tabs.update(tab.openerTabId, { active: true }).catch(() => { });
      await safeCloseTab(d.tabId);
      return;
    }
  }

  // Không phải popup bẩn -> thử restore lastGood
  const lastObj = await chrome.storage.session.get(LAST_GOOD_URL_KEY(d.tabId)).catch(() => ({}));
  const lastGood = lastObj[LAST_GOOD_URL_KEY(d.tabId)];

  if (lastGood && isGoodUrl(lastGood)) {
    await chrome.tabs.update(d.tabId, { url: lastGood }).catch(() => { });
    return;
  }

  // fallback
  await chrome.tabs.update(d.tabId, { url: 'chrome://newtab/' }).catch(() => { });
});
