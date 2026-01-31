/** ===== Config ===== */
const RULE_IDS = [1001, 1002];

const BLOCKED_PATTERNS = [
  /tiktok\.com\/view\/product/i,
  /s\.shopee\.vn\//i,
];

/** ===== Affect (Allowlist) ===== */
const AFFECT_KEY = "affect_prefixes";
// false = chỉ áp dụng cho các prefix trong danh sách (khuyến nghị để tránh ảnh hưởng site khác)
// true  = nếu danh sách rỗng thì áp dụng cho mọi trang (giữ behavior cũ)
const AFFECT_EMPTY_MEANS_ALL = false;

let affectPrefixes = [];

async function loadAffectPrefixes() {
  try {
    const res = await chrome.storage.local.get([AFFECT_KEY]);
    const list = Array.isArray(res?.[AFFECT_KEY]) ? res[AFFECT_KEY] : [];
    affectPrefixes = list
      .filter((x) => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 80);
  } catch {
    affectPrefixes = [];
  }
  return affectPrefixes;
}

function isAffectedUrl(url) {
  const s = String(url || "");
  if (!s) return false;
  if (!affectPrefixes.length) return AFFECT_EMPTY_MEANS_ALL;
  return affectPrefixes.some((p) => s.startsWith(p));
}

function getAffectInitiatorDomains() {
  if (!affectPrefixes.length) return AFFECT_EMPTY_MEANS_ALL ? null : [];
  const set = new Set();
  for (const p of affectPrefixes) {
    try {
      set.add(new URL(p).hostname);
    } catch { }
  }
  return Array.from(set);
}

// Xác định “context” (tab nguồn) đã nằm trong vùng enable chưa
async function shouldHandlePopupTab(tab) {
  // Ưu tiên openerTabId
  const openerId = tab?.openerTabId ?? null;
  if (openerId != null) {
    const opener = await chrome.tabs.get(openerId).catch(() => null);
    if (opener?.url) return isAffectedUrl(opener.url);
  }

  // Fallback: dùng logic return tab sẵn có của bạn
  const retId = await getReturnTabId(tab);
  if (retId != null) {
    const ret = await chrome.tabs.get(retId).catch(() => null);
    if (ret?.url) return isAffectedUrl(ret.url);
  }

  return false;
}


// Only treat about:blank as "popup blank". Do NOT treat chrome://newtab as popup blank.
function isAboutBlankLike(url) {
  if (!url) return true; // empty is usually blank
  if (url === "about:blank") return true;
  if (url.startsWith("about:blank")) return true; // about:blank#...
  return false;
}

const FIRST_URL_KEY = (tabId) => `first_url_${tabId}`;
const LAST_GOOD_URL_KEY = (tabId) => `last_good_url_${tabId}`;
const RESTORE_AT_KEY = (tabId) => `last_restore_at_${tabId}`;

/** ===== State ===== */
let enabled = true;

// windowId -> last active tabId (current)
const lastActiveByWindow = new Map();
// windowId -> previous active tabId (before last)
const prevActiveByWindow = new Map();

/** ===== Utils ===== */
function isBlockedUrl(url) {
  if (!url) return false;
  return BLOCKED_PATTERNS.some((r) => r.test(url));
}

function isGoodUrl(url) {
  if (!url) return false;
  if (url === "about:blank") return false;
  if (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://")
  ) {
    return false;
  }
  if (isBlockedUrl(url)) return false;
  return true;
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
    await chrome.tabs.update(tabId, { url: "chrome://newtab/" }).catch(() => { });
    return;
  }

  await chrome.tabs.remove(tabId).catch(() => {
    // fallback nếu remove fail
    chrome.tabs.update(tabId, { url: "chrome://newtab/" }).catch(() => { });
  });
}

async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.windowId) return;
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => { });
    await chrome.tabs.update(tabId, { active: true }).catch(() => { });
  } catch { }
}

async function getReturnTabId(tab) {
  // Prefer real opener
  let ret = tab?.openerTabId ?? null;

  // Fallback: previous/last active tab in that window (works for noopener popups)
  if (ret == null && tab?.windowId != null) {
    ret = prevActiveByWindow.get(tab.windowId) ?? null;
    if (ret == null) ret = lastActiveByWindow.get(tab.windowId) ?? null;

    // Persisted fallback (service worker may sleep => Maps reset)
    if (ret == null) {
      const keyPrev = `pg_prev_active_${tab.windowId}`;
      const keyLast = `pg_last_active_${tab.windowId}`;
      const obj = await chrome.storage.session.get([keyPrev, keyLast]).catch(() => ({}));
      ret = obj[keyPrev] ?? obj[keyLast] ?? null;
    }
  }

  // Avoid focusing itself
  if (ret != null && tab?.id != null && ret === tab.id) ret = null;
  return ret;
}

async function focusReturnAndClose(tabId, reason) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.windowId) return;

  let ret = await getReturnTabId(tab);

  // Strong fallback: pick another recent tab in same window
  if (ret == null) {
    const tabs = await chrome.tabs.query({ windowId: tab.windowId }).catch(() => []);
    const candidates = tabs
      .filter((t) => t?.id != null && t.id !== tabId)
      .filter((t) => {
        const u = t.url || "";
        if (!u) return false;
        if (isAboutBlankLike(u)) return false;
        if (u.startsWith("chrome://") || u.startsWith("edge://") || u.startsWith("about:") || u.startsWith("chrome-extension://")) return false;
        return true;
      })
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

    if (candidates[0]?.id != null) ret = candidates[0].id;
  }

  if (ret != null) {
    await focusTab(ret);
  }

  await safeCloseTab(tabId);
}

/** ===== DNR rules ===== */
async function setRules(isOn) {
  // Nếu tắt global -> remove rules
  if (!isOn) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [...RULE_IDS] });
    return;
  }

  // Nếu đang dùng allowlist strict mà list rỗng -> không set rule để tránh ảnh hưởng trang khác
  const initiators = getAffectInitiatorDomains();
  if (Array.isArray(initiators) && initiators.length === 0 && !AFFECT_EMPTY_MEANS_ALL) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [...RULE_IDS] });
    return;
  }

  const cond = (urlFilter) => {
    const condition = { urlFilter, resourceTypes: ["main_frame"] };
    // Chỉ áp dụng rule khi navigation xuất phát từ các domain trong allowlist
    if (Array.isArray(initiators) && initiators.length) {
      condition.initiatorDomains = initiators;
    }
    return condition;
  };

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [...RULE_IDS],
    addRules: [
      {
        id: 1001,
        priority: 1,
        action: { type: "redirect", redirect: { url: "about:blank" } },
        condition: cond("tiktok.com/view/product"),
      },
      {
        id: 1002,
        priority: 1,
        action: { type: "redirect", redirect: { url: "about:blank" } },
        condition: cond("s.shopee.vn/"),
      },
    ],
  });
}


async function loadEnabledFlag() {
  const res = await chrome.storage.local.get(["enabled"]);
  enabled = typeof res.enabled === "boolean" ? res.enabled : true;
}

// Ensure latest settings are loaded whenever the service worker starts/wakes.
void Promise.all([loadEnabledFlag(), loadAffectPrefixes()])
  .then(() => setRules(enabled))
  .catch(() => { });

/** ===== Bootstrap ===== */
chrome.runtime.onInstalled.addListener(() => {
  void Promise.all([loadEnabledFlag(), loadAffectPrefixes()])
    .then(() => setRules(enabled))
    .catch(() => { });
});

chrome.runtime.onStartup?.addListener(() => {
  void Promise.all([loadEnabledFlag(), loadAffectPrefixes()])
    .then(() => setRules(enabled))
    .catch(() => { });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  let needUpdateRules = false;

  if ("enabled" in changes) {
    enabled = typeof changes.enabled.newValue === "boolean" ? changes.enabled.newValue : true;
    needUpdateRules = true;
  }

  if ("affect_prefixes" in changes) {
    const v = changes.affect_prefixes.newValue;
    affectPrefixes = Array.isArray(v)
      ? v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 80)
      : [];
    needUpdateRules = true;
  }

  if (needUpdateRules) {
    void setRules(enabled).catch(() => { });
  }
});

/** ===== Track active tab order (needed for noopener popups) ===== */
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const last = lastActiveByWindow.get(windowId);
  if (last != null && last !== tabId) {
    prevActiveByWindow.set(windowId, last);
    chrome.storage.session.set({ [`pg_prev_active_${windowId}`]: last }).catch(() => { });
  }
  lastActiveByWindow.set(windowId, tabId);
  chrome.storage.session.set({ [`pg_last_active_${windowId}`]: tabId }).catch(() => { });
});

/** ===== Track first URL of newly created tab (popup candidate) ===== */
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!enabled) return;
  if (!tab?.id) return;

  const first = tab.pendingUrl || tab.url || "";

  // Store first url for debugging / later checks
  try {
    await chrome.storage.session.set({ [FIRST_URL_KEY(tab.id)]: first });
  } catch { }

  // If a new tab is created already as about:blank -> likely popup redirected/blocked.
  // Close it even when openerTabId is null (noopener), but only if we can return to some previous tab.
  if (isAboutBlankLike(first)) {
    setTimeout(async () => {
      const ok = await shouldHandlePopupTab(tab);
      if (!ok) return; // <-- ngoài vùng enable thì không đụng
      focusReturnAndClose(tab.id, "created_about_blank").catch(() => { });
    }, 150);
  }
});

/** ===== Track URL updates ===== */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!enabled) return;

  const url = changeInfo.url;

  // Best-effort: if we never stored FIRST_URL and now we have a real URL, store it.
  if (url && !isAboutBlankLike(url)) {
    chrome.storage.session
      .get(FIRST_URL_KEY(tabId))
      .then((obj) => {
        if (!obj?.[FIRST_URL_KEY(tabId)]) {
          return chrome.storage.session.set({ [FIRST_URL_KEY(tabId)]: url }).catch(() => { });
        }
      })
      .catch(() => { });
  }

  // If it navigates to a blocked URL, close immediately.
  if (url && (isBlockedUrl(url) || isAboutBlankLike(url))) {
    (async () => {
      const ok = await shouldHandlePopupTab(tab);
      if (!ok) return;
      focusReturnAndClose(tabId, "updated_block_or_blank").catch(() => { });
    })();
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

  const tab = await chrome.tabs.get(d.tabId).catch(() => null);
  if (!tab) return;

  const ok = await shouldHandlePopupTab(tab);
  if (!ok) return;

  const url = String(d.url || "");
  if (!url.startsWith("about:blank")) return;

  // Loop guard: tránh restore liên tục
  const now = Date.now();
  const restoreObj = await chrome.storage.session.get(RESTORE_AT_KEY(d.tabId)).catch(() => ({}));
  const lastRestoreAt = restoreObj[RESTORE_AT_KEY(d.tabId)];

  if (lastRestoreAt && now - lastRestoreAt < 1200) {
    await chrome.tabs.update(d.tabId, { url: "chrome://newtab/" }).catch(() => { });
    return;
  }
  await chrome.storage.session.set({ [RESTORE_AT_KEY(d.tabId)]: now }).catch(() => { });

  // If this about:blank comes from a popup (opener OR we have a return tab), close and return.
  const ret = await getReturnTabId(tab);

  // If firstUrl indicates blocked, definitely treat as popup
  const firstObj = await chrome.storage.session.get(FIRST_URL_KEY(d.tabId)).catch(() => ({}));
  const firstUrl = firstObj[FIRST_URL_KEY(d.tabId)];

  if (isBlockedUrl(firstUrl) || ret != null) {
    // focus return first (best-effort)
    if (ret != null) {
      void focusTab(ret);
    }
    await safeCloseTab(d.tabId);
    return;
  }

  // Not a popup case -> try restore lastGood
  const lastObj = await chrome.storage.session.get(LAST_GOOD_URL_KEY(d.tabId)).catch(() => ({}));
  const lastGood = lastObj[LAST_GOOD_URL_KEY(d.tabId)];

  if (lastGood && isGoodUrl(lastGood)) {
    await chrome.tabs.update(d.tabId, { url: lastGood }).catch(() => { });
    return;
  }

  // fallback
  await chrome.tabs.update(d.tabId, { url: "chrome://newtab/" }).catch(() => { });
});
