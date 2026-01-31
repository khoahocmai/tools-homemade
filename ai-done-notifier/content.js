// content/index.js — AI Done Notifier (ChatGPT/Claude/Gemini)
// DEBUG-HEAVY version: lots of logs with timestamps + flow markers
// Key points:
// - ChatGPT/Claude: wait for assistant message node count increase
// - Gemini: single-container mode (node count doesn't increase) => baseline text + detect growth
// - Generating detection blocks DONE
// - tick() is protected by try/catch to prevent silent crash
// - sendMessage logs lastError + "context invalidated" guidance

(async function () {
  const SCRIPT_BOOT_AT = Date.now();

  // ---------- Helpers: time & logging ----------
  const pad2 = (n) => String(n).padStart(2, "0");
  const ts = () => {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  };
  const sinceBoot = () => `${Date.now() - SCRIPT_BOOT_AT}ms`;

  function safeJson(obj) {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  // We'll enable logs only when opts.debug === true, but before opts loads we can log minimal.
  let DEBUG_ENABLED = true; // temporary until opts loaded
  let VERBOSE_TICK = true;  // you can turn this off later

  function log(tag, msg, data) {
    if (!DEBUG_ENABLED) return;
    const base = `[AI DONE][LOG][${ts()}][+${sinceBoot()}][${tag}] ${msg}`;
    if (data !== undefined) console.log(base, data);
    else console.log(base);
  }

  function warn(tag, msg, data) {
    const base = `[AI DONE][WARN][${ts()}][+${sinceBoot()}][${tag}] ${msg}`;
    if (data !== undefined) console.warn(base, data);
    else console.warn(base);
  }

  function errlog(tag, msg, data) {
    const base = `[AI DONE][ERROR][${ts()}][+${sinceBoot()}][${tag}] ${msg}`;
    if (data !== undefined) console.error(base, data);
    else console.error(base);
  }

  log("BOOT", "content loaded", { href: location.href });

  const DEFAULTS = {
    enableNotification: true,
    enableSound: true,
    flashTitle: true,
    minThinkingMs: 1200,
    endSilenceMs: 4500,
    debug: true,
    // debug knobs
    verboseTick: true,        // log tick summary periodically
    tickLogEveryMs: 2000,     // print tick summary at most every X ms
    singleGrowthThreshold: 10 // Gemini: minimum growth from baseline to treat as output
  };

  const opts = await chrome.storage.sync.get(DEFAULTS);
  DEBUG_ENABLED = !!opts.debug;
  VERBOSE_TICK = !!opts.verboseTick;

  log("INIT", "options loaded", opts);

  // ---------- Utils ----------
  const now = () => Date.now();
  const safeText = (el) => (el?.innerText || el?.textContent || "").trim();



  // ---------- Deep DOM query (supports open Shadow DOM) ----------
  function deepQuerySelectorAll(selector, root = document) {
    const results = [];
    const seen = new Set();

    const start =
      root instanceof Document
        ? root.documentElement || root.body
        : root instanceof ShadowRoot
          ? root
          : root;

    const stack = [start].filter(Boolean);
    let steps = 0;
    const MAX_STEPS = 12000; // safety bound

    while (stack.length && steps++ < MAX_STEPS) {
      const node = stack.pop();
      if (!node) continue;
      if (seen.has(node)) continue;
      seen.add(node);

      // ShadowRoot
      if (node instanceof ShadowRoot) {
        const kids = node.children ? Array.from(node.children) : [];
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
        continue;
      }

      // Element
      if (node.nodeType === 1) {
        try {
          if (node.matches && node.matches(selector)) results.push(node);
        } catch { }

        const kids = node.children ? Array.from(node.children) : [];
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);

        if (node.shadowRoot) stack.push(node.shadowRoot);
      }
    }

    // de-dup preserving order
    const uniq = [];
    const seenEl = new Set();
    for (const el of results) {
      if (!seenEl.has(el)) {
        seenEl.add(el);
        uniq.push(el);
      }
    }
    return uniq;
  }

  function deepQuerySelector(selector, root = document) {
    const all = deepQuerySelectorAll(selector, root);
    return all.length ? all[0] : null;
  }

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

  // ---------- Messaging ----------
  let warnedInvalid = false;

  function safeSendMessage(payload, label = "msg") {
    const rt = globalThis.chrome?.runtime;

    // Log env 1 lần để biết đang ở context nào
    if (!safeSendMessage._envLogged) {
      safeSendMessage._envLogged = true;
      log("ENV", "chrome api snapshot", {
        hasChrome: !!globalThis.chrome,
        hasStorage: !!globalThis.chrome?.storage,
        hasRuntime: !!globalThis.chrome?.runtime,
        runtimeId: globalThis.chrome?.runtime?.id,
        href: location.href,
      });
    }

    if (!rt?.sendMessage) {
      warn("MSG", `${label} runtime.sendMessage missing -> tab chưa refresh sau khi reload extension?`);
      warn("MSG", "Fix: chrome://extensions reload + F5/Ctrl+Shift+R tab ChatGPT");
      return;
    }

    try {
      rt.sendMessage(payload, () => {
        const lastErr = globalThis.chrome?.runtime?.lastError;
        if (lastErr) warn("MSG", `${label} lastError`, lastErr.message || String(lastErr));
        else log("MSG", `${label} sent ok`, payload?.type);
      });
    } catch (e) {
      warn("MSG", `${label} sendMessage threw`, String(e));
    }
  }

  function emitStart(reason) {
    const payload = {
      type: "AI_START",
      site: getSiteName(),
      reason,
      url: location.href,
      title: document.title,
      at: Date.now(),
    };
    log("FLOW", "emitStart()", payload);
    safeSendMessage(payload, "AI_START");
  }

  function emitDone(reason) {
    const payload = {
      type: "AI_DONE",
      site: getSiteName(),
      reason,
      url: location.href,
      title: document.title,
      at: Date.now(),
    };
    log("FLOW", "emitDone()", payload);
    safeSendMessage(payload, "AI_DONE");

    if (opts.enableSound) playBeep();
    if (opts.flashTitle) flashTitleOnce();
  }

  // ---------- Generating detectors ----------
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

    const btns = document.querySelectorAll("button");
    for (const b of btns) {
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      const text = (b.textContent || "").toLowerCase();
      if ((aria.includes("stop") && aria.includes("generat")) || (text.includes("stop") && text.includes("generat")))
        return true;
      if ((aria.includes("dừng") && (aria.includes("tạo") || aria.includes("sinh"))) ||
        (text.includes("dừng") && (text.includes("tạo") || text.includes("sinh"))))
        return true;
    }
    return false;
  }

  function isGeminiGenerating() {
    if (!isGemini()) return false;

    const selectors = [
      '[role="progressbar"]',
      "mat-progress-bar",
      "mat-spinner",
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      'button[aria-label*="Dừng"]',
      'button[aria-label*="dừng"]',
      'button[title*="Stop"]',
      'button[title*="stop"]',
      '[data-testid*="stop"]',
      '[data-test-id*="stop"]',
    ];
    for (const s of selectors) {
      if (deepQuerySelector(s)) return true;
    }

    const btns = document.querySelectorAll("button");
    for (const b of btns) {
      const aria = (b.getAttribute("aria-label") || "").toLowerCase();
      const text = (b.textContent || "").toLowerCase();
      if (aria.includes("stop") || text.includes("stop")) return true;
      if (aria.includes("dừng") || text.includes("dừng")) return true;
    }
    return false;
  }

  function isClaudeGenerating() {
    if (!isClaude()) return false;
    // Claude UI varies; best-effort: progressbar/spinner/stop button
    const selectors = [
      '[role="progressbar"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      "svg[aria-label*='loading']",
    ];
    for (const s of selectors) {
      if (document.querySelector(s)) return true;
    }
    return false;
  }

  // ---------- Gemini helpers (DOM selectors) ----------
  // Gemini web app often uses custom elements like <message-content> inside #chat-history.
  // We intentionally keep this logic isolated so ChatGPT flow is unaffected.
  function getGeminiChatHistoryRoot() {
    // Gemini often renders inside open Shadow DOM; use deep query.
    return (
      deepQuerySelector("#chat-history") ||
      deepQuerySelector("main,[role='main']") ||
      document.body ||
      document.documentElement
    );
  }

  function getGeminiAssistantNodes() {
    const root = getGeminiChatHistoryRoot();
    if (!root) return [];

    // Primary: assistant message blocks
    let nodes = deepQuerySelectorAll("message-content", root);

    // Fallbacks for some layouts (extended response / panels)
    if (!nodes.length) {
      nodes = deepQuerySelectorAll("message-content");
    }
    if (!nodes.length) {
      nodes = deepQuerySelectorAll("extended-response-panel response-container, response-container");
    }

    // Keep only nodes that actually have some text or are visible containers.
    return nodes.filter(Boolean);
  }

  function getGeminiActiveAssistantEl() {
    const nodes = getGeminiAssistantNodes();
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  // ---------- Assistant nodes ----------
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
      return getGeminiAssistantNodes();
    }
    return [];
  }

  function getLastAssistantNode() {
    const nodes = getAssistantNodes();
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  function getAssistantContentText(assistantEl) {
    if (!assistantEl) return "";

    if (isChatGPT()) {
      const content =
        assistantEl.querySelector(
          ".markdown, .prose, [data-testid='markdown'], [data-testid='message-content'], .whitespace-pre-wrap"
        ) || assistantEl;
      return safeText(content);
    }

    // Claude/Gemini fallback
    return safeText(assistantEl);
  }

  // ---------- Session state ----------
  let sessionActive = false;
  let notified = false;
  let sessionStartAt = 0;

  let assistantCountAtStart = 0;
  let awaitingAssistant = true;
  let awaitingOutput = true;

  let activeAssistantEl = null;

  let baselineText = "";
  let lastText = "";
  let lastChangeAt = 0;
  let hasAssistantOutput = false;

  let singleContainerMode = false; // Gemini mode

  // debug counters
  let lastTickAt = 0;
  let tickCount = 0;
  let lastTickSummaryAt = 0;

  function resetSessionVars() {
    awaitingOutput = true;
    hasAssistantOutput = false;
    lastChangeAt = now();
    baselineText = "";
    lastText = "";
  }

  function startSession(reason) {
    if (sessionActive && !notified) {
      log("FLOW", "startSession ignored (already active)", { reason });
      return;
    }

    sessionActive = true;
    notified = false;
    sessionStartAt = now();

    singleContainerMode = isGemini();
    resetSessionVars();

    // snapshot nodes count
    const nodes = getAssistantNodes();
    assistantCountAtStart = nodes.length;

    if (singleContainerMode) {
      // Gemini: we don't wait for a "new node"
      activeAssistantEl = getGeminiActiveAssistantEl() || getLastAssistantNode();
      baselineText = getAssistantContentText(activeAssistantEl);
      lastText = baselineText;
      awaitingAssistant = false;

      log("FLOW", "startSession(Gemini)", {
        reason,
        assistantCountAtStart,
        baselineLen: baselineText.length,
        baselinePreview: baselineText.slice(0, 80),
      });
    } else {
      // ChatGPT/Claude
      awaitingAssistant = true;
      activeAssistantEl = null;

      log("FLOW", "startSession()", {
        site: getSiteName(),
        reason,
        assistantCountAtStart,
      });
    }

    emitStart(reason);
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

    if (hay.includes("send") || hay.includes("submit") || hay.includes("gửi")) return true;
    if (hay.includes("paperplane") || hay.includes("send-button") || hay.includes("send_message")) return true;

    // Gemini sometimes uses "Generate" / "Run"
    if (hay.includes("generate") || hay.includes("run") || hay.includes("create")) return true;

    return false;
  }

  function installSendHooks() {
    // Enter send
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter") return;
        if (e.shiftKey) return;
        if (e.isComposing) return;
        const path = (typeof e.composedPath === 'function' ? e.composedPath() : []) || [];
        const target = path[0] || e.target || document.activeElement;
        // In Shadow DOM, retargeting may hide the real editable; scan composedPath.
        const editable = isEditableTarget(target) || path.some((n) => isEditableTarget(n));
        if (!editable) return;

        log("HOOK", "keydown Enter -> startSession", { targetTag: target?.tagName, site: getSiteName() });
        startSession("enter_send");
      },
      true
    );

    // Click send button
    document.addEventListener(
      "click",
      (e) => {
        const path = (typeof e.composedPath === 'function' ? e.composedPath() : []) || [];
        const btn = path.find((n) => n && n.tagName === 'BUTTON') || e.target?.closest?.('button');
        if (!btn) return;
        if (!looksLikeSendButton(btn)) return;

        log("HOOK", "click send button -> startSession", {
          aria: btn.getAttribute("aria-label"),
          text: safeText(btn).slice(0, 50),
          site: getSiteName(),
        });
        startSession("click_send");
      },
      true
    );

    // Form submit
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

        log("HOOK", "form submit -> startSession", { site: getSiteName() });
        startSession("form_submit");
      },
      true
    );

    log("INIT", "send hooks installed", { site: getSiteName() });
  }

  // ---------- DONE detection ----------
  function tick() {
    // Never allow exceptions to kill the loop
    try {
      const t = now();
      if (t - lastTickAt < 250) return; // debounce
      lastTickAt = t;
      tickCount++;

      if (!sessionActive) return;

      // Periodic summary log
      if (VERBOSE_TICK && t - lastTickSummaryAt >= (opts.tickLogEveryMs ?? 2000)) {
        lastTickSummaryAt = t;
        const gen = isChatGPTGenerating() || isGeminiGenerating() || isClaudeGenerating();
        log("TICK", "summary", {
          site: getSiteName(),
          tickCount,
          singleContainerMode,
          awaitingAssistant,
          awaitingOutput,
          hasAssistantOutput,
          gen,
          sinceStartMs: t - sessionStartAt,
          stableForMs: t - lastChangeAt,
          baselineLen: baselineText.length,
          lastLen: lastText.length,
        });
      }

      // Gemini: refresh active response reference (DOM may re-render)
      if (singleContainerMode) {
        const nodes = getGeminiAssistantNodes();

        // If a new assistant node appears, switch to it and reset baseline (prevents picking whole-page root).
        if (nodes.length && nodes.length > assistantCountAtStart) {
          assistantCountAtStart = nodes.length;
          activeAssistantEl = nodes[nodes.length - 1];

          baselineText = getAssistantContentText(activeAssistantEl);
          lastText = baselineText;
          lastChangeAt = now();
          awaitingOutput = true;
          hasAssistantOutput = false;

          log("FLOW", "Gemini: new assistant node detected", {
            assistantCountAtStart,
            baselineLen: baselineText.length,
            baselinePreview: baselineText.slice(0, 80),
          });
        } else {
          const el = nodes.length ? nodes[nodes.length - 1] : null;
          if (el) activeAssistantEl = el;
        }
      }

      // Recover element if re-rendered
      if (!awaitingAssistant && activeAssistantEl && !document.contains(activeAssistantEl)) {
        warn("TICK", "activeAssistantEl was re-rendered; trying recover");
        activeAssistantEl = getLastAssistantNode();
        if (!activeAssistantEl) {
          warn("TICK", "recover failed; resetting state");
          awaitingAssistant = !singleContainerMode;
          awaitingOutput = true;
          return;
        }
      }

      // ChatGPT/Claude: wait for new assistant message node
      if (!singleContainerMode && awaitingAssistant) {
        const nodes = getAssistantNodes();

        // log only occasionally to avoid spam
        if (VERBOSE_TICK && nodes.length !== assistantCountAtStart) {
          log("TICK", "assistant nodes changed", { from: assistantCountAtStart, to: nodes.length });
        }

        if (nodes.length <= assistantCountAtStart) return;

        activeAssistantEl = nodes[nodes.length - 1];
        awaitingAssistant = false;
        awaitingOutput = true;

        baselineText = getAssistantContentText(activeAssistantEl);
        lastText = baselineText;
        lastChangeAt = now();
        hasAssistantOutput = false;

        log("FLOW", "assistant message created", {
          baselineLen: baselineText.length,
          baselinePreview: baselineText.slice(0, 80),
        });
        return;
      }

      if (!activeAssistantEl) {
        warn("TICK", "activeAssistantEl is null - waiting");
        return;
      }

      const text = getAssistantContentText(activeAssistantEl);

      // Wait until output really starts
      if (awaitingOutput) {
        if (!text) return;

        if (singleContainerMode) {
          // Gemini: don't rely on "longer than baseline" (Gemini may reuse/replace containers).
          // Treat output as started when the active assistant element has non-empty text different from baseline.
          if (!text) return;
          if (text === baselineText) return;
        }

        awaitingOutput = false;
        hasAssistantOutput = true;
        lastText = text;
        lastChangeAt = now();

        log("FLOW", "output started", {
          len: text.length,
          preview: text.slice(0, 120),
          baselineLen: baselineText.length,
        });
        return;
      }

      // Text changing => still streaming
      if (text !== lastText) {
        lastText = text;
        lastChangeAt = now();
        if (VERBOSE_TICK) {
          // Nếu debug thì mở
          // log("FLOW", "text updated", { len: text.length, preview: text.slice(0, 60) });
        }
        return;
      }

      // Still generating? block DONE
      const generating =
        isChatGPTGenerating() || isGeminiGenerating() || isClaudeGenerating();
      if (generating) return;

      const sinceStart = now() - sessionStartAt;
      const stableFor = now() - lastChangeAt;
      const endSilence = opts.endSilenceMs ?? 4500;

      if (!notified && hasAssistantOutput && sinceStart >= opts.minThinkingMs && stableFor >= endSilence) {
        notified = true;
        sessionActive = false;

        log("FLOW", "DONE criteria met", { sinceStart, stableFor, endSilence });
        emitDone("end_silence");
      }
    } catch (e) {
      errlog("TICK", "tick crashed (caught)", String(e));
    }
  }

  function startWatcher() {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(startWatcher, 50);
      return;
    }

    log("INIT", "watcher started", { site: getSiteName(), href: location.href });

    setInterval(tick, 700);

    const observer = new MutationObserver(() => tick());
    observer.observe(target, { childList: true, subtree: true, characterData: true });

    // also log page visibility changes (helps diagnosing throttling/freeze)
    document.addEventListener("visibilitychange", () => {
      log("PAGE", "visibilitychange", { hidden: document.hidden, visibilityState: document.visibilityState });
    });
  }

  installSendHooks();
  startWatcher();
})();
