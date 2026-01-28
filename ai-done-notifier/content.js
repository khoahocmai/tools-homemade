(async function () {
  console.log("[AI DONE] content loaded", location.href);

  const DEFAULTS = {
    enableNotification: true,
    enableSound: true,
    flashTitle: true,

    // tối thiểu coi là đang trả lời
    minThinkingMs: 1200,

    // im lặng >= endSilenceMs mới coi là DONE (chống notify liên tục do pause 2–3s)
    endSilenceMs: 4500,

    notifyOnlyWhenInactive: true,
    focusTabOnDone: false,

    // debug log
    debug: true,
  };

  const opts = await chrome.storage.sync.get(DEFAULTS);

  // ---------- Utils ----------
  const now = () => Date.now();
  const safeText = (el) => (el?.innerText || el?.textContent || "").trim();
  const dlog = (...args) => opts.debug && console.log(...args);

  function isChatGPT() {
    return location.host.includes("chatgpt.com") || location.host.includes("chat.openai.com");
  }
  function isClaude() {
    return location.host.includes("claude.ai");
  }
  function isGemini() {
    return location.host.includes("gemini.google.com");
  }

  function getSiteName() {
    if (isChatGPT()) return "ChatGPT";
    if (isClaude()) return "Claude";
    if (isGemini()) return "Gemini";
    return "AI";
  }

  function playBeep() {
    try {
      const audio = new Audio(
        "data:audio/wav;base64," +
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
      );
      audio.volume = 1;
      audio.play().catch(() => { });
    } catch (_) { }
  }

  function flashTitleOnce() {
    const original = document.title;
    document.title = "[DONE] " + original;
    setTimeout(() => (document.title = original), 2000);
  }

  function safeSendMessage(payload) {
    try {
      if (chrome?.runtime?.sendMessage) chrome.runtime.sendMessage(payload);
      else console.warn("[AI DONE] runtime.sendMessage not available");
    } catch (e) {
      console.warn("[AI DONE] sendMessage failed", e);
    }
  }

  function emitDone() {
    console.log("[AI DONE] emitDone()", getSiteName());

    // 1️⃣ Thử gửi qua background
    safeSendMessage({ type: "AI_DONE", site: getSiteName() });

    // 2️⃣ FALLBACK: nếu background chết → notify trực tiếp
    try {
      if (opts.enableNotification && chrome?.notifications) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon128.png",
          title: "AI đã trả lời xong",
          message: `${getSiteName()} đã hoàn tất phản hồi`,
          priority: 2,
        });
      }
    } catch (e) {
      console.warn("[AI DONE] direct notification failed", e);
    }

    if (opts.enableSound) playBeep();
    if (opts.flashTitle) flashTitleOnce();
  }


  // ---------- Session state ----------
  // 1 user prompt => 1 notify khi AI done
  let sessionActive = false;
  let notified = false;
  let sessionStartAt = 0;

  // assistant text tracking
  let lastText = "";
  let lastChangeAt = 0;

  // anti-spam tick
  let lastTickAt = 0;

  function startSession(reason) {
    sessionActive = true;
    notified = false;
    sessionStartAt = now();

    lastText = "";
    lastChangeAt = now();

    dlog("[AI DONE] startSession()", { site: getSiteName(), reason, at: new Date().toLocaleTimeString() });
  }

  // ---------- Detect "user sent prompt" ----------
  // ChatGPT/Claude: detect new user message by DOM role
  let lastUserSig = "";
  function getLastUserMessageText_ChatGPT_Claude() {
    const els = document.querySelectorAll('[data-message-author-role="user"]');
    for (let i = els.length - 1; i >= 0; i--) {
      const t = safeText(els[i]);
      if (t) return t;
    }
    return "";
  }

  function tryStartSessionByUserDom() {
    if (!(isChatGPT() || isClaude())) return;

    const sig = getLastUserMessageText_ChatGPT_Claude();
    if (sig && sig !== lastUserSig) {
      lastUserSig = sig;
      startSession("user_dom");
    }
  }

  // Gemini: hook Enter / click Send
  function installGeminiInputHooks() {
    if (!isGemini()) return;

    // event delegation: capture Enter in textarea
    document.addEventListener(
      "keydown",
      (e) => {
        const t = e.target;
        if (!t) return;

        // Gemini input is usually textarea
        const isTextarea = t.tagName === "TEXTAREA";
        if (!isTextarea) return;

        // Enter (không shift) thường là gửi
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          startSession("gemini_enter");
        }
      },
      true
    );

    // capture click Send button (best-effort)
    document.addEventListener(
      "click",
      (e) => {
        const el = e.target?.closest?.("button");
        if (!el) return;

        const label = (el.getAttribute("aria-label") || el.getAttribute("title") || safeText(el)).toLowerCase();
        // Gemini labels có thể thay đổi, nên match rộng
        if (label.includes("send") || label.includes("gửi") || label.includes("submit")) {
          startSession("gemini_click_send");
        }
      },
      true
    );

    dlog("[AI DONE] Gemini input hooks installed");
  }

  // ---------- Assistant text source ----------
  function getAssistantContainer() {
    // ChatGPT/Claude: ưu tiên assistant role
    if (isChatGPT() || isClaude()) {
      const els = document.querySelectorAll('[data-message-author-role="assistant"], article');
      for (let i = els.length - 1; i >= 0; i--) {
        const t = safeText(els[i]);
        if (t) return els[i];
      }
      return null;
    }

    // Gemini: lấy vùng chat chính (main / role=main)
    if (isGemini()) {
      return document.querySelector("main") || document.querySelector('[role="main"]') || document.body;
    }

    return document.body;
  }

  // ---------- Main loop ----------
  function tick() {
    const t = now();
    if (t - lastTickAt < 250) return; // debounce cho Gemini (mutation nhiều)
    lastTickAt = t;

    // Start session by DOM (ChatGPT/Claude)
    tryStartSessionByUserDom();

    if (!sessionActive) return;

    const container = getAssistantContainer();
    if (!container) return;

    const text = safeText(container);
    if (!text) return;

    // text changed => update lastChangeAt
    if (text !== lastText) {
      lastText = text;
      lastChangeAt = now();
      dlog("[AI DONE] assistant text updated");
      return;
    }

    // DONE condition: đủ thời gian tối thiểu + đủ im lặng
    const sinceStart = now() - sessionStartAt;
    const stableFor = now() - lastChangeAt;
    const endSilence = opts.endSilenceMs ?? 4500;

    if (!notified && sinceStart >= opts.minThinkingMs && stableFor >= endSilence) {
      notified = true;
      sessionActive = false;

      dlog("[AI DONE] DONE detected", { sinceStart, stableFor, endSilence });
      emitDone();
    }
  }

  // ---------- Start watcher safely ----------
  function startWatcher() {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(startWatcher, 50);
      return;
    }

    dlog("[AI DONE] tick loop started");
    setInterval(tick, 700);

    const observer = new MutationObserver(tick);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  installGeminiInputHooks();
  startWatcher();
})();
