const notificationTabMap = new Map();

const DEFAULTS = {
  enableNotification: true,
  enableSound: true,
  flashTitle: true,

  stableMs: 1600,

  notifyOnlyWhenInactive: true,

  // NEW: focus behavior
  focusTabOnDone: false,
  focusWindowOnDone: false,
};

async function getOptions() {
  return chrome.storage.sync.get(DEFAULTS);
}

async function isTabEffectivelyInactive(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const win = await chrome.windows.get(tab.windowId);
    // considered inactive if: tab not active OR window not focused
    return !tab.active || !win.focused;
  } catch {
    return true;
  }
}


chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...data });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "AI_DONE") return;

  const tabId = sender?.tab?.id;
  const title = sender?.tab?.title || "AI";
  const site = msg?.site || "AI";

  (async () => {
    const opts = await getOptions();
    if (tabId == null) return;

    const inactive = await isTabEffectivelyInactive(tabId);
    if (opts.notifyOnlyWhenInactive && !inactive) {
      // user is already watching the tab in a focused window
      return;
    }

    // Notification
    if (opts.enableNotification) {
      const notificationId = `ai-done-${Date.now()}-${Math.random()}`;

      chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: `AI đã trả lời xong (${site})`,
        message: `Tab: ${title}`,
        priority: 2,
      });

      // Lưu mapping
      notificationTabMap.set(notificationId, tabId);
    }

    // Focus controls
    if (opts.focusTabOnDone || opts.focusWindowOnDone) {
      try {
        const tab = await chrome.tabs.get(tabId);

        if (opts.focusWindowOnDone) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }

        if (opts.focusTabOnDone) {
          await chrome.tabs.update(tabId, { active: true });
        }
      } catch { }
    }
  })();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const tabId = notificationTabMap.get(notificationId);

  if (!tabId) return;

  try {
    const tab = await chrome.tabs.get(tabId);

    // Focus window
    await chrome.windows.update(tab.windowId, { focused: true });

    // Focus tab
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // Tab không còn tồn tại → mở ChatGPT mới
    chrome.tabs.create({ url: "https://chatgpt.com" });
  } finally {
    // cleanup
    notificationTabMap.delete(notificationId);
    chrome.notifications.clear(notificationId);
  }
});
