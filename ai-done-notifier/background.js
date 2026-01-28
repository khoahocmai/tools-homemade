const notificationTabMap = new Map();
const tabTimers = new Map(); // tabId -> { clearBadgeTimer?: number }

const DEFAULTS = {
  // Notify
  enableNotification: true,
  enableSound: true,
  flashTitle: true,
  notifyOnlyWhenInactive: true,

  // Focus
  focusTabOnDone: false,
  focusWindowOnDone: false,

  // Detection tuning (content uses endSilenceMs/minThinkingMs, giữ ở content/options)
  minThinkingMs: 1200,
  endSilenceMs: 4000,

  // Badge
  enableBadge: true,
  badgeShowWhileThinking: true,
  badgeMode: "dot", // dot | count | doneText
  badgeDoneText: "1", // when badgeMode=doneText
  badgeClearAfterMs: 2500, // 0 = never clear automatically
};

async function getOptions() {
  return chrome.storage.sync.get(DEFAULTS);
}

async function isTabEffectivelyInactive(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const win = await chrome.windows.get(tab.windowId);
    return !tab.active || !win.focused;
  } catch {
    return true;
  }
}

// ---------- Badge helpers ----------
async function setBadge(tabId, text) {
  try {
    await chrome.action.setBadgeText({ tabId, text: String(text ?? "") });
    // background color (optional)
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
  } catch { }
}

function clearBadgeLater(tabId, ms) {
  try {
    const old = tabTimers.get(tabId);
    if (old?.clearBadgeTimer) clearTimeout(old.clearBadgeTimer);

    if (!ms || ms <= 0) return;

    const t = setTimeout(() => {
      setBadge(tabId, "");
    }, ms);

    tabTimers.set(tabId, { clearBadgeTimer: t });
  } catch { }
}

async function bumpCountBadge(tabId) {
  try {
    const cur = await chrome.action.getBadgeText({ tabId });
    const n = parseInt(cur || "0", 10);
    const next = Number.isFinite(n) ? n + 1 : 1;
    await setBadge(tabId, String(next));
  } catch {
    await setBadge(tabId, "1");
  }
}

// ---------- Install defaults ----------
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...data });
});

// ✅ Click extension icon -> open options page
chrome.action.onClicked.addListener(async () => {
  try {
    await chrome.runtime.openOptionsPage();
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  }
});

// ---------- Messages ----------
chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender?.tab?.id;
  if (tabId == null) return;

  (async () => {
    const opts = await getOptions();

    // ---- AI_START: set thinking badge ----
    if (msg?.type === "AI_START") {
      if (opts.enableBadge && opts.badgeShowWhileThinking) {
        // dot style: just a bullet
        await setBadge(tabId, "•");
        // don't auto-clear here
      }
      return;
    }

    // ---- AI_DONE: notify + focus + badge done ----
    if (msg?.type !== "AI_DONE") return;

    const title = sender?.tab?.title || "AI";
    const site = msg?.site || "AI";

    const inactive = await isTabEffectivelyInactive(tabId);
    if (opts.notifyOnlyWhenInactive && !inactive) {
      // user is already watching the tab in a focused window
      // still allow badge update_toggle? keep simple: do nothing
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

      notificationTabMap.set(notificationId, tabId);
    }

    // Badge on DONE
    if (opts.enableBadge) {
      if (opts.badgeMode === "dot") {
        await setBadge(tabId, "•");
        clearBadgeLater(tabId, opts.badgeClearAfterMs);
      } else if (opts.badgeMode === "count") {
        await bumpCountBadge(tabId);
        // count mode usually don't auto clear, but user may want
        clearBadgeLater(tabId, opts.badgeClearAfterMs);
      } else if (opts.badgeMode === "doneText") {
        await setBadge(tabId, opts.badgeDoneText || "1");
        clearBadgeLater(tabId, opts.badgeClearAfterMs);
      }
    } else {
      await setBadge(tabId, "");
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

// Click notification -> jump to that tab (best-effort)
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const tabId = notificationTabMap.get(notificationId);
  if (!tabId) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    chrome.tabs.create({ url: "https://chatgpt.com" });
  } finally {
    notificationTabMap.delete(notificationId);
    chrome.notifications.clear(notificationId);
  }
});
