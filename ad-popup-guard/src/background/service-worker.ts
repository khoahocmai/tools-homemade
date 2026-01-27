const LAST_URL_KEY = (tabId: number) => `last_good_url_${tabId}`;
const RESTORE_AT_KEY = (tabId: number) => `last_restore_at_${tabId}`;

function isGoodUrl(url?: string) {
  return !!url && url !== "about:blank" && !url.startsWith("chrome-extension://");
}

// 1) Cài luật chặn
chrome.runtime.onInstalled.addListener(() => {
  console.log("🛡 Ad & Popup Guard installed");

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1001, 1002],
    addRules: [
      {
        id: 1001,
        priority: 1,
        action: { type: "redirect", redirect: { url: "about:blank" } },
        condition: {
          urlFilter: "tiktok.com/view/product",
          resourceTypes: ["main_frame"],
        },
      },
      {
        id: 1002,
        priority: 1,
        action: { type: "redirect", redirect: { url: "about:blank" } },
        condition: {
          urlFilter: "s.shopee.vn/",
          resourceTypes: ["main_frame"],
        },
      },
    ],
  });
});

// 2) Lưu URL hợp lệ gần nhất của mỗi tab
async function saveLastGoodUrl(tabId: number, url: string) {
  if (!isGoodUrl(url)) return;
  await chrome.storage.session.set({ [LAST_URL_KEY(tabId)]: url });
}

// Bắt các lần điều hướng “thật” (main frame)
chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return;
  if (isGoodUrl(d.url)) void saveLastGoodUrl(d.tabId, d.url);
});

// Bắt thêm trường hợp SPA (đổi URL bằng history API)
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId !== 0) return;
  if (isGoodUrl(d.url)) void saveLastGoodUrl(d.tabId, d.url);
});

// 3) Khi gặp about:blank => nhảy về URL đã lưu (không đóng tab nữa)
chrome.webNavigation.onCompleted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  if (d.url !== "about:blank") return;

  const tabId = d.tabId;
  const now = Date.now();

  // chống loop
  const restoreAtObj = await chrome.storage.session.get(RESTORE_AT_KEY(tabId));
  const lastRestoreAt = restoreAtObj[RESTORE_AT_KEY(tabId)] as number | undefined;
  if (lastRestoreAt && now - lastRestoreAt < 1500) {
    await chrome.tabs.update(tabId, { url: "chrome://newtab/" });
    return;
  }
  await chrome.storage.session.set({ [RESTORE_AT_KEY(tabId)]: now });

  // ✅ Nếu đây là tab mới bật lên từ tab khác (popup / window.open)
  // -> đóng tab này, quay lại tab cha
  try {
    const t = await chrome.tabs.get(tabId);
    if (t.openerTabId) {
      await chrome.tabs.update(t.openerTabId, { active: true });
      await chrome.tabs.remove(tabId);
      return;
    }
  } catch {
    // ignore
  }

  // Nếu không phải popup tab -> restore ngay trên chính tab đó
  const obj = await chrome.storage.session.get(LAST_URL_KEY(tabId));
  const lastGood = obj[LAST_URL_KEY(tabId)] as string | undefined;

  if (lastGood) {
    await chrome.tabs.update(tabId, { url: lastGood });
  } else {
    await chrome.tabs.update(tabId, { url: "chrome://newtab/" });
  }
});

// dọn session khi đóng tab (tuỳ chọn)
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove([LAST_URL_KEY(tabId), RESTORE_AT_KEY(tabId)]);
});
