(async function () {
  console.log("[AI DONE] content loaded", location.href);

  const DEFAULTS = {
    enableSound: true,
    flashTitle: true,

    // detection tuning
    minThinkingMs: 1200,
    endSilenceMs: 4000,
  };

  const opts = await chrome.storage.sync.get(DEFAULTS);

  const now = () => Date.now();
  const safeText = (el) => (el?.innerText || el?.textContent || "").trim();

  function playBeep() {
    try {
      const audio = new Audio(
        "data:audio/wav;base64," +
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
      );
      audio.volume = 1;
      audio.play().catch(() => { });
    } catch { }
  }

  function flashTitleOnce() {
    const original = document.title;
    document.title = "[DONE] " + original;
    setTimeout(() => (document.title = original), 2000);
  }

  function getSiteName() {
    const h = location.host;
    if (h.includes("chatgpt")) return "ChatGPT";
    if (h.includes("claude")) return "Claude";
    if (h.includes("gemini")) return "Gemini";
    return "AI";
  }

  function safeSendMessage(payload) {
    try {
      const cr = globalThis.chrome;
      if (cr && cr.runtime && typeof cr.runtime.sendMessage === "function") {
        cr.runtime.sendMessage(payload);
      } else {
        console.warn("[AI DONE] sendMessage not available");
      }
    } catch (e) {
      console.warn("[AI DONE] sendMessage failed", e);
    }
  }

  function emitDone() {
    console.log("[AI DONE] emitDone()", getSiteName());
    safeSendMessage({ type: "AI_DONE", site: getSiteName() });
    if (opts.enableSound) playBeep();
    if (opts.flashTitle) flashTitleOnce();
  }

  function emitStart() {
    console.log("[AI DONE] emitStart()", getSiteName());
    safeSendMessage({ type: "AI_START", site: getSiteName() });
  }

  function isGemini() {
    return location.host.includes("gemini.google.com");
  }

  function getLastAssistantMessage() {
    // ChatGPT / Claude
    if (!isGemini()) {
      const els = document.querySelectorAll(
        '[data-message-author-role="assistant"], article'
      );
      for (let i = els.length - 1; i >= 0; i--) {
        const t = safeText(els[i]);
        if (t) return els[i];
      }
      return null;
    }

    // ---- Gemini ----
    // Gemini render trong main + role=main
    const main = document.querySelector("main");
    if (!main) return null;

    // Lấy block text lớn nhất (response hiện tại)
    const blocks = main.querySelectorAll("div");
    let best = null;
    let maxLen = 0;

    blocks.forEach((el) => {
      const t = safeText(el);
      if (t.length > maxLen) {
        maxLen = t.length;
        best = el;
      }
    });

    return best;
  }

  function getLastUserMessage() {
    const els = document.querySelectorAll('[data-message-author-role="user"]');
    for (let i = els.length - 1; i >= 0; i--) {
      const t = safeText(els[i]);
      if (t) return t;
    }
    return "";
  }

  function getUserSignature() {
    if (isGemini()) {
      const input = document.querySelector("textarea");
      return input ? input.value.trim() : "";
    }
    return getLastUserMessage();
  }

  // ---------- State ----------
  let notified = false;
  let lastUserSig = "";
  let sessionStartAt = 0;

  let thinking = false;
  let lastText = "";
  let lastChangeAt = 0;

  function tick() {
    // start new session when user asks something new
    // const userSig = getLastUserMessage();
    const userSig = getUserSignature();
    if (userSig && userSig !== lastUserSig) {
      lastUserSig = userSig;

      notified = false;
      thinking = true;
      sessionStartAt = now();
      lastText = "";
      lastChangeAt = now();

      console.log("[AI DONE] new prompt detected → start session");
      emitStart(); // ✅ badge thinking
    }

    if (!thinking) return;

    const el = getLastAssistantMessage();
    if (!el) return;

    const text = safeText(el);
    if (!text) return;

    if (text !== lastText) {
      lastText = text;
      lastChangeAt = now();
      return;
    }

    const sinceStart = now() - sessionStartAt;
    const stableFor = now() - lastChangeAt;

    const minThinking = opts.minThinkingMs ?? 1200;
    const endSilence = opts.endSilenceMs ?? 4000;

    if (!notified && sinceStart >= minThinking && stableFor >= endSilence) {
      notified = true;
      thinking = false;
      console.log("[AI DONE] DONE (end silence)", { sinceStart, stableFor });
      emitDone();
    }
  }

  // start watcher safely (document_start friendly)
  function startWatcher() {
    const target = document.body || document.documentElement;
    if (!(target instanceof Node)) {
      setTimeout(startWatcher, 50);
      return;
    }

    console.log("[AI DONE] tick loop started");
    setInterval(tick, 700);

    const observer = new MutationObserver(() => tick());
    try {
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } catch (e) {
      console.warn("[AI DONE] observe failed, retrying...", e);
      setTimeout(startWatcher, 100);
    }
  }

  startWatcher();
})();
