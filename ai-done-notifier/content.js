(async function () {
  console.log("[AI DONE] content loaded", location.href);

  const DEFAULTS = {
    enableNotification: true,
    enableSound: true,
    flashTitle: true,
    minThinkingMs: 1200,
    endSilenceMs: 4500,
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

  function emitDone(reason) {
    dlog("[AI DONE] emitDone()", { site: getSiteName(), reason });

    safeSendMessage({
      type: "AI_DONE",
      site: getSiteName(),
      reason,
      url: location.href,
      title: document.title,
    });

    if (opts.enableSound) playBeep();
    if (opts.flashTitle) flashTitleOnce();
  }

  // ---------- Assistant container ----------
  function getAssistantContainer() {
    if (isChatGPT() || isClaude()) {
      const els = document.querySelectorAll('[data-message-author-role="assistant"], article');
      for (let i = els.length - 1; i >= 0; i--) {
        const t = safeText(els[i]);
        if (t) return els[i];
      }
      return null;
    }

    if (isGemini()) {
      return document.querySelector("main") || document.querySelector('[role="main"]') || document.body;
    }

    return document.body;
  }

  // ---------- Session state (Option A) ----------
  let sessionActive = false;
  let notified = false;
  let sessionStartAt = 0;

  let baselineText = "";
  let lastText = "";
  let lastChangeAt = 0;
  let hasAssistantOutput = false;

  let lastTickAt = 0;

  function startSession(reason) {
    // chống start liên tục khi double event
    if (sessionActive && !notified) return;

    sessionActive = true;
    notified = false;
    sessionStartAt = now();

    const container = getAssistantContainer();
    baselineText = container ? safeText(container) : "";

    lastText = baselineText;
    lastChangeAt = now();
    hasAssistantOutput = false;

    dlog("[AI DONE] startSession()", { site: getSiteName(), reason });
  }

  // ---------- Input detection helpers ----------
  function isEditableTarget(el) {
    if (!el) return false;

    const tag = el.tagName;

    // classic inputs
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      return ["text", "search"].includes(type) || type === "";
    }

    // contenteditable / role textbox (ChatGPT thường dùng cái này)
    if (el.isContentEditable) return true;
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    if (role === "textbox") return true;

    // sometimes the real editable is parent
    const ceParent = el.closest?.('[contenteditable="true"]');
    if (ceParent) return true;
    const roleParent = el.closest?.('[role="textbox"]');
    if (roleParent) return true;

    return false;
  }

  function looksLikeSendButton(btn) {
    if (!btn) return false;

    // common attributes
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    const title = (btn.getAttribute("title") || "").toLowerCase();
    const text = safeText(btn).toLowerCase();
    const testid = (btn.getAttribute("data-testid") || "").toLowerCase();

    const hay = `${aria} ${title} ${text} ${testid}`.trim();

    // ChatGPT hay dùng "Send message", "Send prompt"
    if (hay.includes("send")) return true;
    if (hay.includes("gửi")) return true;
    if (hay.includes("submit")) return true;

    // một số UI dùng icon-only button, testid thường gợi ý
    if (hay.includes("paperplane") || hay.includes("send-button") || hay.includes("send_message")) return true;

    return false;
  }

  // ---------- Hook SEND events (FIXED) ----------
  function installSendHooks() {
    // 1) Enter key trong textarea / contenteditable / role=textbox
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter") return;
        if (e.shiftKey) return;         // shift+enter = newline
        if (e.isComposing) return;      // IME
        const target = e.target || document.activeElement;
        if (!isEditableTarget(target)) return;

        // ChatGPT đôi khi bắt Enter ở bubbling; ta set capture=true nên OK
        startSession("enter_send");
      },
      true
    );

    // 2) Click send button
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target?.closest?.("button");
        if (!btn) return;
        if (!looksLikeSendButton(btn)) return;
        startSession("click_send");
      },
      true
    );

    // 3) Submit form (một số site dùng form submit)
    document.addEventListener(
      "submit",
      (e) => {
        // chỉ start nếu trong form có input editable
        const form = e.target;
        if (!form) return;
        const hasEditable =
          form.querySelector?.("textarea, input[type='text'], input[type='search'], [contenteditable='true'], [role='textbox']") != null;
        if (!hasEditable) return;
        startSession("form_submit");
      },
      true
    );

    dlog("[AI DONE] send hooks installed (textarea + contenteditable + click + submit)");
  }

  // ---------- DONE detection ----------
  function tick() {
    const t = now();
    if (t - lastTickAt < 250) return; // debounce
    lastTickAt = t;

    if (!sessionActive) return;

    const container = getAssistantContainer();
    if (!container) return;

    const text = safeText(container);
    if (!text) return;

    if (text !== lastText) {
      lastText = text;
      lastChangeAt = now();

      if (text !== baselineText) hasAssistantOutput = true;

      // debug nhẹ
      // dlog("[AI DONE] assistant text updated", { hasAssistantOutput });
      return;
    }

    const sinceStart = now() - sessionStartAt;
    const stableFor = now() - lastChangeAt;
    const endSilence = opts.endSilenceMs ?? 4500;

    // ✅ Chỉ DONE khi đã có output thật
    if (!notified && hasAssistantOutput && sinceStart >= opts.minThinkingMs && stableFor >= endSilence) {
      notified = true;
      sessionActive = false;
      dlog("[AI DONE] DONE", { sinceStart, stableFor, endSilence });
      emitDone("end_silence");
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

  installSendHooks();
  startWatcher();
})();
