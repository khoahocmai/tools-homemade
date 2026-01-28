// src/background/service-worker.ts
/// <reference types="chrome" />

/** ===== Config ===== */
const RULE_IDS = [1001, 1002] as const;

const BLOCKED_PATTERNS = [
  /tiktok\.com\/view\/product/i,
  /s\.shopee\.vn\//i,
];

const FIRST_URL_KEY = (tabId: number) => `first_url_${tabId}`;
const LAST_GOOD_URL_KEY = (tabId: number) => `last_good_url_${tabId}`;
const RESTORE_AT_KEY = (tabId: number) => `last_restore_at_${tabId}`;

/** ===== State ===== */
let enabled = true;

/** ===== Utils ===== */
function isBlockedUrl(url?: string) {
  if (!url) return false;
  return BLOCKED_PATTERNS.some((r) => r.test(url));
}

function isGoodUrl(url?: string) {
  if (!url) return false;
  if (url === "about:blank") return false;
  if (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://")
  )
    return false;
  if (isBlockedUrl(url)) return false;
  return true;
}

async function getWindowTabCount(windowId: number) {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.length;
}

async function safeCloseTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.windowId) return;

  const count = await getWindowTabCount(tab.windowId).catch(() => 0);

  // Tab cuối: không remove để tránh “cảm giác như tắt browser”
  if (count <= 1) {
    await chrome.tabs.update(tabId, { url: "chrome://newtab/" }).catch(() => { });
    return;
  }

  await chrome.tabs.remove(tabId).catch(() => {
    // fallback nếu remove fail
    chrome.tabs.update(tabId, { url: "chrome://newtab/" }).catch(() => { });
  });
}

async function setRules(isOn: boolean) {
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
        action: { type: "redirect", redirect: { url: "about:blank" } },
        condition: { urlFilter: "tiktok.com/view/product", resourceTypes: ["main_frame"] },
      },
      {
        id: 1002,
        priority: 1,
        action: { type: "redirect", redirect: { url: "about:blank" } },
        condition: { urlFilter: "s.shopee.vn/", resourceTypes: ["main_frame"] },
      },
    ],
  });
}

async function loadEnabledFlag() {
  const res = await chrome.storage.local.get(["enabled"]);

  enabled = typeof res.enabled === "boolean"
    ? res.enabled
    : true;
}


/** ===== Bootstrap ===== */
chrome.runtime.onInstalled.addListener(() => {
  // service worker mới install -> sync rules
  void loadEnabledFlag().then(() => setRules(enabled)).catch(() => { });
});

chrome.runtime.onStartup?.addListener(() => {
  // browser restart -> sync rules
  void loadEnabledFlag().then(() => setRules(enabled)).catch(() => { });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!("enabled" in changes)) return;

  enabled = typeof changes.enabled.newValue === "boolean"
    ? changes.enabled.newValue
    : true;
  void setRules(enabled).catch(() => { });
});

/** ===== Track first URL of newly created tab (to detect popup ads) ===== */
chrome.tabs.onCreated.addListener((tab) => {
  if (!enabled) return;

  const first = (tab as any).pendingUrl || tab.url;
  if (tab.id != null && first) {
    void chrome.storage.session.set({ [FIRST_URL_KEY(tab.id)]: first }).catch(() => { });
  }
});

/** ===== Track last good URL per tab ===== */
async function saveLastGoodUrl(tabId: number, url: string) {
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

  const url = String(d.url || "");
  if (!url.startsWith("about:blank")) return;

  const tab = await chrome.tabs.get(d.tabId).catch(() => null);
  if (!tab) return;

  // Loop guard: tránh restore liên tục
  const now = Date.now();
  const restoreObj = await chrome.storage.session.get(RESTORE_AT_KEY(d.tabId)).catch(() => ({}));
  const lastRestoreAt = restoreObj[RESTORE_AT_KEY(d.tabId)] as number | undefined;

  if (lastRestoreAt && now - lastRestoreAt < 1200) {
    await chrome.tabs.update(d.tabId, { url: "chrome://newtab/" }).catch(() => { });
    return;
  }
  await chrome.storage.session.set({ [RESTORE_AT_KEY(d.tabId)]: now }).catch(() => { });

  // Nếu là popup tab: check firstUrl có bị block không
  if (tab.openerTabId) {
    const firstObj = await chrome.storage.session.get(FIRST_URL_KEY(d.tabId)).catch(() => ({}));
    const firstUrl = firstObj[FIRST_URL_KEY(d.tabId)] as string | undefined;

    if (isBlockedUrl(firstUrl)) {
      // focus lại tab gốc (best-effort)
      void chrome.tabs.update(tab.openerTabId, { active: true }).catch(() => { });
      await safeCloseTab(d.tabId);
      return;
    }
  }

  // Không phải popup bẩn -> thử restore lastGood
  const lastObj = await chrome.storage.session.get(LAST_GOOD_URL_KEY(d.tabId)).catch(() => ({}));
  const lastGood = lastObj[LAST_GOOD_URL_KEY(d.tabId)] as string | undefined;

  if (lastGood && isGoodUrl(lastGood)) {
    await chrome.tabs.update(d.tabId, { url: lastGood }).catch(() => { });
    return;
  }

  // fallback
  await chrome.tabs.update(d.tabId, { url: "chrome://newtab/" }).catch(() => { });
});
