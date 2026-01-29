// background.js — AI Done Notifier (robust: works even when tab not focused)
// - ChatGPT DONE by network (webRequest) => không phụ thuộc DOM/content chạy hay không
// - Persist waiting state in chrome.storage.session (bền qua service worker sleep)
// - Clear badge bằng chrome.alarms (bền hơn setTimeout)

const notificationTabMap = new Map();

const DEFAULTS = {
  // Notify
  enableNotification: true,
  enableSound: true,
  flashTitle: true,
  notifyOnlyWhenInactive: true,

  // Focus
  focusTabOnDone: false,
  focusWindowOnDone: false,

  // Detection tuning
  minThinkingMs: 1200,
  endSilenceMs: 4000,

  // Badge
  enableBadge: true,
  badgeShowWhileThinking: true,
  badgeMode: "dot", // dot | count | doneText
  badgeDoneText: "1", // when badgeMode=doneText
  badgeClearAfterMs: 2500, // 0 = never clear automatically
  warmupCheckMs: 2000,          // sau AI_START bao lâu thì check
  warmupMode: "remind",         // "remind" | "focus"
};
const WARMUP_PREFIX = "ai_warmup_";
const warmupAlarmName = (tabId) => `${WARMUP_PREFIX}${tabId}`;

const LAST_CHATGPT_TAB = "ai_last_chatgpt_tab";

async function setLastChatGPTTab(tabId) {
  try { await chrome.storage.session.set({ [LAST_CHATGPT_TAB]: tabId }); } catch { }
}

async function getLastChatGPTTab() {
  try {
    const r = await chrome.storage.session.get(LAST_CHATGPT_TAB);
    const id = r[LAST_CHATGPT_TAB];
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

// Scan all waiting keys để tìm tab ChatGPT mới nhất (chỉ dùng khi tabId=-1)
async function findLatestWaitingChatGPTTab() {
  try {
    const all = await chrome.storage.session.get(null);
    let bestTabId = null;
    let bestStartedAt = 0;

    for (const [k, v] of Object.entries(all)) {
      if (!k.startsWith(WAIT_PREFIX)) continue;
      if (!v || v.site !== "ChatGPT") continue;

      const tabId = Number(k.slice(WAIT_PREFIX.length));
      const startedAt = Number(v.startedAt || 0);
      if (!Number.isFinite(tabId)) continue;

      if (startedAt >= bestStartedAt) {
        bestStartedAt = startedAt;
        bestTabId = tabId;
      }
    }
    return bestTabId;
  } catch {
    return null;
  }
}

async function resolveChatGPTTabId(details) {
  if (details.tabId != null && details.tabId >= 0) return details.tabId;

  // tabId=-1 => fallback
  const last = await getLastChatGPTTab();
  if (last != null) return last;

  // fallback mạnh hơn: tìm tab đang wait ChatGPT mới nhất
  return await findLatestWaitingChatGPTTab();
}

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

// ---------- Session storage keys ----------
const WAIT_PREFIX = "ai_wait_";          // ai_wait_<tabId>
const LAST_NOTIFY_PREFIX = "ai_last_";   // ai_last_<tabId>
const BADGE_CLEAR_PREFIX = "badge_clear_"; // alarm name

const waitKey = (tabId) => `${WAIT_PREFIX}${tabId}`;
const lastKey = (tabId) => `${LAST_NOTIFY_PREFIX}${tabId}`;
const badgeAlarmName = (tabId) => `${BADGE_CLEAR_PREFIX}${tabId}`;

// ---------- Persist helpers ----------
async function setWaiting(tabId, payload) {
  try {
    await chrome.storage.session.set({ [waitKey(tabId)]: payload });
  } catch { }
}

async function getWaiting(tabId) {
  try {
    const res = await chrome.storage.session.get(waitKey(tabId));
    return res[waitKey(tabId)] || null;
  } catch {
    return null;
  }
}

async function clearWaiting(tabId) {
  try {
    await chrome.storage.session.remove(waitKey(tabId));
    await chrome.alarms.clear(warmupAlarmName(tabId));
  } catch { }
}

async function recentlyNotified(tabId, ms = 2500) {
  try {
    const res = await chrome.storage.session.get(lastKey(tabId));
    const t = Number(res[lastKey(tabId)] || 0);
    return Date.now() - t < ms;
  } catch {
    return false;
  }
}

async function markNotified(tabId) {
  try {
    await chrome.storage.session.set({ [lastKey(tabId)]: Date.now() });
  } catch { }
}

// ---------- Badge helpers ----------
async function setBadge(tabId, text) {
  try {
    await chrome.action.setBadgeText({ tabId, text: String(text ?? "") });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
  } catch { }
}

async function getBadgeNumber(tabId) {
  try {
    const cur = await chrome.action.getBadgeText({ tabId });
    const n = parseInt(cur || "0", 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function bumpCountBadge(tabId) {
  const n = await getBadgeNumber(tabId);
  await setBadge(tabId, String(n + 1));
}

async function scheduleClearBadge(tabId, ms) {
  try {
    await chrome.alarms.clear(badgeAlarmName(tabId));
    if (!ms || ms <= 0) return;
    chrome.alarms.create(badgeAlarmName(tabId), { when: Date.now() + ms });
  } catch { }
}

// Alarm handler for badge clear (bền qua SW sleep)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const name = alarm?.name || "";

  // 1) badge clear
  if (name.startsWith(BADGE_CLEAR_PREFIX)) {
    const tabId = Number(name.slice(BADGE_CLEAR_PREFIX.length));
    if (!Number.isFinite(tabId)) return;
    await setBadge(tabId, "");
    return;
  }

  // 2) warmup check
  if (name.startsWith(WARMUP_PREFIX)) {
    const tabId = Number(name.slice(WARMUP_PREFIX.length));
    if (!Number.isFinite(tabId)) return;

    const w = await getWaiting(tabId);
    if (!w) return;
    if (w.networkSeen) return;

    const opts = await getOptions();

    if ((opts.warmupMode || "remind") === "focus") {
      try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
      } catch { }
    } else {
      const notificationId = `ai-warmup-${Date.now()}-${Math.random()}`;
      try {
        chrome.notifications.create(notificationId, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "AI đang trả lời…",
          message: "Chrome có thể pause stream nếu bạn rời tab quá sớm. Bấm để mở ChatGPT.",
          priority: 1,
        });
        notificationTabMap.set(notificationId, tabId);
      } catch { }
    }

    return;
  }
});

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

// ---------- Unified DONE handler ----------
async function handleDone(tabId, site, title) {
  const opts = await getOptions();

  // chống notify trùng (AI_DONE + webRequest)
  if (await recentlyNotified(tabId)) return;

  const inactive = await isTabEffectivelyInactive(tabId);
  if (opts.notifyOnlyWhenInactive && !inactive) {
    // user đang nhìn đúng tab đó (active + focused) => skip notify
    await clearWaiting(tabId);
    return;
  }

  await markNotified(tabId);

  // Notification
  if (opts.enableNotification) {
    const notificationId = `ai-done-${Date.now()}-${Math.random()}`;

    chrome.notifications.create(notificationId, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `AI đã trả lời xong (${site || "AI"})`,
      message: `Tab: ${title || "AI"}`,
      priority: 2,
    });

    notificationTabMap.set(notificationId, tabId);
  }

  // Badge on DONE
  if (opts.enableBadge) {
    if (opts.badgeMode === "dot") {
      await setBadge(tabId, "•");
      await scheduleClearBadge(tabId, opts.badgeClearAfterMs);
    } else if (opts.badgeMode === "count") {
      await bumpCountBadge(tabId);
      await scheduleClearBadge(tabId, opts.badgeClearAfterMs);
    } else if (opts.badgeMode === "doneText") {
      await setBadge(tabId, opts.badgeDoneText || "1");
      await scheduleClearBadge(tabId, opts.badgeClearAfterMs);
    }
  } else {
    await setBadge(tabId, "");
  }

  // Focus controls
  // Lưu ý: một số OS có thể chặn “focus stealing”, nên focusWindowOnDone đôi khi không bring-to-front được.
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

  await clearWaiting(tabId);
}

// ---------- Messages from content ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const tabId = sender?.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "no tabId" });
      return;
    }

    // debug (xem trong Service Worker console)
    console.log("[BG] onMessage", { type: msg?.type, tabId, site: msg?.site });

    const opts = await getOptions();

    if (msg?.type === "AI_START") {
      if ((msg?.site || "").toLowerCase() === "chatgpt" || (sender?.tab?.url || "").includes("chatgpt")) {
        await setLastChatGPTTab(tabId);
      }

      if (opts.enableBadge && opts.badgeShowWhileThinking) {
        await setBadge(tabId, "•");
      }

      await setWaiting(tabId, {
        startedAt: Date.now(),
        site: msg?.site || "AI",
        title: msg?.title || sender?.tab?.title || "AI",
        networkSeen: false,
      });

      await chrome.alarms.clear(warmupAlarmName(tabId));
      chrome.alarms.create(warmupAlarmName(tabId), {
        when: Date.now() + (opts.warmupCheckMs ?? 2000),
      });

      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "AI_DONE") {
      const title = sender?.tab?.title || msg?.title || "AI";
      const site = msg?.site || "AI";
      await handleDone(tabId, site, title);

      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: true, ignored: true });
  })().catch((e) => {
    console.error("[BG] onMessage error", e);
    try {
      sendResponse({ ok: false, error: String(e) });
    } catch { }
  });

  // QUAN TRỌNG: giữ message port mở cho async code
  return true;
});

// ---------- ChatGPT: detect DONE by network (works even when tab not focused) ----------
const CHATGPT_CONV_URLS = [
  "https://chatgpt.com/backend-api/conversation",
  "https://chat.openai.com/backend-api/conversation",
];

// Mark waiting from network too (không phụ thuộc content hook bắt được send)
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    try {
      const tabId = await resolveChatGPTTabId(details);
      if (tabId == null) return;

      if ((details.method || "").toUpperCase() !== "POST") return;

      const w = await getWaiting(tabId);
      if (w && !w.networkSeen) {
        await setWaiting(tabId, { ...w, networkSeen: true });
      }

      const opts = await getOptions();
      if (opts.enableBadge && opts.badgeShowWhileThinking) {
        await setBadge(tabId, "•");
      }

      // Nếu chưa có waiting (content không bắt được), tạo waiting từ network
      const existing = await getWaiting(tabId);
      if (!existing) {
        let title = "ChatGPT";
        try {
          const tab = await chrome.tabs.get(tabId);
          title = tab?.title || title;
        } catch { }
        await setWaiting(tabId, {
          startedAt: Date.now(),
          site: "ChatGPT",
          title,
        });
      }
    } catch { }
  },
  { urls: CHATGPT_CONV_URLS }
);

// DONE when the request completes
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    try {
      const tabId = await resolveChatGPTTabId(details);
      if (tabId == null) return;

      if ((details.method || "").toUpperCase() !== "POST") return;

      const waiting = await getWaiting(tabId);
      if (!waiting) return;

      const opts = await getOptions();
      const minThinking = opts.minThinkingMs ?? 1200;
      if (Date.now() - (waiting.startedAt || 0) < minThinking) return;

      let title = waiting.title || "ChatGPT";
      try {
        const tab = await chrome.tabs.get(tabId);
        title = tab?.title || title;
      } catch { }

      await handleDone(tabId, waiting.site || "ChatGPT", title);
    } catch { }
  },
  { urls: CHATGPT_CONV_URLS }
);

// If request aborted/errors, clear waiting (optional)
chrome.webRequest.onErrorOccurred.addListener(
  async (details) => {
    try {
      const tabId = await resolveChatGPTTabId(details);
      if (tabId == null) return;

      if ((details.method || "").toUpperCase() !== "POST") return;

      // user stop generating / tab discarded can abort stream
      await clearWaiting(tabId);
    } catch { }
  },
  { urls: CHATGPT_CONV_URLS }
);

// Cleanup when tab closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await clearWaiting(tabId);
    await chrome.storage.session.remove([lastKey(tabId)]);
    await chrome.alarms.clear(badgeAlarmName(tabId));
    await chrome.alarms.clear(warmupAlarmName(tabId));
  } catch { }
});

// Click notification -> jump to that tab
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

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab?.url || "";
    if (url.includes("chatgpt.com") || url.includes("chat.openai.com")) {
      await setLastChatGPTTab(tabId);
    }
  } catch { }
});
