// content/index.js — AI Done Notifier (ChatGPT/Claude/Gemini)
// Fix: không notify sớm khi AI còn thinking
// 1) Chỉ đọc text trong vùng content (prose/markdown) của assistant message
// 2) Nếu còn nút "Stop generating" (đang generate) => tuyệt đối chưa DONE

(async function () {
  console.log("[AI DONE] content loaded", location.href);

  const DEFAULTS = {
    enableNotification: true,
    enableSound: true,
    flashTitle: true,

    // Detection tuning
    minThinkingMs: 1200, // từ lúc send -> tối thiểu bao lâu mới cho phép DONE
    endSilenceMs: 4500,  // assistant im lặng bao lâu thì DONE

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

  // ---------- ChatGPT generating detector ----------
  // Nếu đang generate/thinking, thường có nút "Stop generating"
  function isChatGPTGenerating() {
    if (!isChatGPT()) return false;

    const selectors = [
      'button[aria-label="Stop generating"]',
      'button[aria-label*="Stop generating"]',
      'button[data-testid="stop-button"]',
      'button[data-testid*="stop-generating"]',
    ];
    for (const s of selectors) {
      if (document.querySelector(s)) return true;
    }

    // fallback (đa ngôn ngữ)
    const btns = document.querySelectorAll("button");
    for (const b of btns) {
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      const text = (b.textContent || "").toLowerCase();

      // English
      if ((aria.includes("stop") && aria.includes("generat")) || (text.includes("stop") && text.includes("generat")))
        return true;

      // Vietnamese (best effort)
      if ((aria.includes("dừng") && (aria.includes("tạo") || aria.includes("sinh"))) ||
        (text.includes("dừng") && (text.includes("tạo") || text.includes("sinh"))))
        return true;
    }

    return false;
  }

  // ---------- Assistant message helpers ----------
  function getAssistantNodes() {
    if (isChatGPT()) {
      return Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
    }

    if (isClaude()) {
      return Array.from(
        document.querySelectorAll('[data-message-author-role="assistant"], [data-testid*="assistant"]')
      );
    }

    if (isGemini()) {
      const main = document.querySelector("main,[role='main']");
      return main ? [main] : [];
    }

    return [];
  }

  function getLastAssistantNode() {
    const nodes = getAssistantNodes();
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  // QUAN TRỌNG: chỉ lấy text "content trả lời", loại bỏ text UI (Copy/Buttons/Stop...)
  function getAssistantContentText(assistantEl) {
    if (!assistantEl) return "";

    if (isChatGPT()) {
      const content =
        assistantEl.querySelector(
          // các class/selector thường gặp trong ChatGPT UI
          ".markdown, .prose, [data-testid='markdown'], [data-testid='message-content'], .whitespace-pre-wrap"
        ) || assistantEl;

      return safeText(content);
    }

    // Claude/Gemini tạm lấy trực tiếp (có thể refine sau)
    return safeText(assistantEl);
  }

  // ---------- Session state ----------
  let sessionActive = false;
  let notified = false;
  let sessionStartAt = 0;

  let assistantCountAtStart = 0;

  // chờ assistant message mới xuất hiện
  let awaitingAssistant = true;
  // chờ assistant thực sự có chữ trả lời (không phải placeholder/UI)
  let awaitingOutput = true;

  let activeAssistantEl = null;

  // text tracking
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

    // badge thinking
    safeSendMessage({
      type: "AI_START",
      site: getSiteName(),
      reason,
      url: location.href,
      title: document.title,
    });

    const nodes = getAssistantNodes();
    assistantCountAtStart = nodes.length;

    awaitingAssistant = true;
    awaitingOutput = true;
    activeAssistantEl = null;

    lastText = "";
    lastChangeAt = now();
    hasAssistantOutput = false;

    dlog("[AI DONE] startSession()", { site: getSiteName(), reason, assistantCountAtStart });
  }

  // ---------- Input detection helpers ----------
  function isEditableTarget(el) {
    if (!el) return false;

    const tag = el.tagName;

    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      return ["text", "search"].includes(type) || type === "";
    }

    if (el.isContentEditable) return true;
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    if (role === "textbox") return true;

    if (el.closest?.('[contenteditable="true"]')) return true;
    if (el.closest?.('[role="textbox"]')) return true;

    return false;
  }

  function looksLikeSendButton(btn) {
    if (!btn) return false;

    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    const title = (btn.getAttribute("title") || "").toLowerCase();
    const text = safeText(btn).toLowerCase();
    const testid = (btn.getAttribute("data-testid") || "").toLowerCase();

    const hay = `${aria} ${title} ${text} ${testid}`.trim();

    if (hay.includes("send")) return true;
    if (hay.includes("submit")) return true;
    if (hay.includes("gửi")) return true;

    if (hay.includes("paperplane") || hay.includes("send-button") || hay.includes("send_message"))
      return true;

    return false;
  }

  function installSendHooks() {
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter") return;
        if (e.shiftKey) return;
        if (e.isComposing) return;
        const target = e.target || document.activeElement;
        if (!isEditableTarget(target)) return;

        startSession("enter_send");
      },
      true
    );

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

    document.addEventListener(
      "submit",
      (e) => {
        const form = e.target;
        if (!form) return;

        const hasEditable =
          form.querySelector?.(
            "textarea, input[type='text'], input[type='search'], [contenteditable='true'], [role='textbox']"
          ) != null;

        if (!hasEditable) return;

        startSession("form_submit");
      },
      true
    );

    dlog("[AI DONE] send hooks installed");
  }

  // ---------- DONE detection ----------
  function tick() {
    const t = now();
    if (t - lastTickAt < 250) return;
    lastTickAt = t;

    if (!sessionActive) return;

    // nếu element bị re-render, tự recover
    if (!awaitingAssistant && activeAssistantEl && !document.contains(activeAssistantEl)) {
      activeAssistantEl = getLastAssistantNode();
      if (!activeAssistantEl) {
        awaitingAssistant = true;
        awaitingOutput = true;
        return;
      }
    }

    // 1) Đợi assistant message MỚI xuất hiện
    if (awaitingAssistant) {
      const nodes = getAssistantNodes();
      if (nodes.length <= assistantCountAtStart) {
        // chưa có assistant message mới => vẫn thinking
        return;
      }

      activeAssistantEl = nodes[nodes.length - 1];
      awaitingAssistant = false;
      awaitingOutput = true;

      // reset tracking theo message mới
      lastText = "";
      lastChangeAt = now();
      hasAssistantOutput = false;

      dlog("[AI DONE] assistant message created (may be placeholder)");
      return;
    }

    if (!activeAssistantEl) return;

    // 2) lấy text content (không gồm UI)
    const text = getAssistantContentText(activeAssistantEl);

    // 2.1) Nếu chưa có output thật thì CHỈ chờ tới khi có chữ
    if (awaitingOutput) {
      if (!text || text.length === 0) {
        return; // vẫn chưa có chữ trả lời
      }

      // có chữ thật -> bắt đầu theo dõi ổn định
      awaitingOutput = false;
      hasAssistantOutput = true;
      lastText = text;
      lastChangeAt = now();

      dlog("[AI DONE] output started", { len: text.length, preview: text.slice(0, 60) });
      return;
    }

    // 3) nếu text thay đổi => đang stream/đang update
    if (text !== lastText) {
      lastText = text;
      lastChangeAt = now();
      return;
    }

    // 4) Chặn DONE nếu ChatGPT còn đang generate (còn nút Stop generating)
    if (isChatGPTGenerating()) {
      return;
    }

    const sinceStart = now() - sessionStartAt;
    const stableFor = now() - lastChangeAt;
    const endSilence = opts.endSilenceMs ?? 4500;

    if (!notified && hasAssistantOutput && sinceStart >= opts.minThinkingMs && stableFor >= endSilence) {
      notified = true;
      sessionActive = false;

      dlog("[AI DONE] DONE", { sinceStart, stableFor, endSilence });
      emitDone("end_silence");
    }
  }

  // ---------- Start watcher ----------
  function startWatcher() {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(startWatcher, 50);
      return;
    }

    dlog("[AI DONE] watcher started");
    setInterval(tick, 700);

    const observer = new MutationObserver(tick);
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  installSendHooks();
  startWatcher();
})();
