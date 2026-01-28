(async function () {
  console.log("[AI DONE] content loaded", location.href);

  const DEFAULTS = {
    enableNotification: true,
    enableSound: true,
    flashTitle: true,

    // (legacy, giữ lại để options không vỡ)
    stableMs: 1600,

    // tối thiểu coi là "đang trả lời"
    minThinkingMs: 1200,

    // chỉ notify khi tab inactive (do background xử lý)
    notifyOnlyWhenInactive: true,
    focusTabOnDone: false,

    // ✅ im lặng >= endSilenceMs mới coi là DONE (chống spam do pause 2–3s)
    endSilenceMs: 4000,
  };

  const opts = await chrome.storage.sync.get(DEFAULTS);

  // ---------- Utils ----------
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
    } catch (_) { }
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

  function getLastAssistantMessage() {
    const els = document.querySelectorAll(
      '[data-message-author-role="assistant"], article'
    );
    for (let i = els.length - 1; i >= 0; i--) {
      const t = safeText(els[i]);
      if (t) return els[i];
    }
    return null;
  }

  function getLastUserMessage() {
    const els = document.querySelectorAll('[data-message-author-role="user"]');
    for (let i = els.length - 1; i >= 0; i--) {
      const t = safeText(els[i]);
      if (t) return t;
    }
    return "";
  }

  function safeSendMessage(payload) {
    try {
      const cr = globalThis.chrome;
      if (cr && cr.runtime && typeof cr.runtime.sendMessage === "function") {
        cr.runtime.sendMessage(payload);
      } else {
        console.warn("[AI DONE] sendMessage not available (not extension context?)");
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

  // ---------- State ----------
  // Session = 1 câu hỏi user -> 1 lần notify khi AI xong
  let notified = false;
  let lastUserSig = "";
  let sessionStartAt = 0;

  let thinking = false;
  let lastText = "";
  let lastChangeAt = 0;

  // ---------- Main loop ----------
  function tick() {
    // 1) Detect new user prompt => start a new session
    const userSig = getLastUserMessage();
    if (userSig && userSig !== lastUserSig) {
      lastUserSig = userSig;

      notified = false;
      thinking = true;
      sessionStartAt = now();

      // reset assistant tracking
      lastText = "";
      lastChangeAt = now();

      console.log("[AI DONE] new prompt detected → start session");
    }

    // Nếu chưa có session thì thôi (tránh notify lúc vừa load trang)
    if (!thinking) return;

    // 2) Track assistant text changes
    const el = getLastAssistantMessage();
    if (!el) return;

    const text = safeText(el);
    if (!text) return;

    if (text !== lastText) {
      lastText = text;
      lastChangeAt = now();
      // log nhẹ thôi, nếu spam quá bạn có thể comment dòng dưới
      // console.log("[AI DONE] assistant text updated");
      return;
    }

    // 3) DONE condition: đủ thời gian tối thiểu + đủ im lặng
    const sinceStart = now() - sessionStartAt;
    const stableFor = now() - lastChangeAt;

    const endSilence = opts.endSilenceMs ?? 4000;

    if (!notified && sinceStart >= opts.minThinkingMs && stableFor >= endSilence) {
      notified = true;
      thinking = false;
      console.log("[AI DONE] DONE (end silence)", {
        sinceStart,
        stableFor,
        endSilence,
      });
      emitDone();
    }
  }

  // ---------- Start loop safely ----------
  function startWatcher() {
    const target = document.body;

    if (!target || !(target instanceof Node)) {
      setTimeout(startWatcher, 50);
      return;
    }

    console.log("[AI DONE] tick loop started");
    setInterval(tick, 700);

    const observer = new MutationObserver(() => tick());

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  startWatcher();
})();
