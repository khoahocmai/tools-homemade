const DEFAULTS = {
  // Notify
  enableNotification: true,
  enableSound: true,
  flashTitle: true,
  notifyOnlyWhenInactive: true,

  // Focus
  focusTabOnDone: false,
  focusWindowOnDone: false,

  // Detection
  minThinkingMs: 1200,
  endSilenceMs: 4000,

  // Badge
  enableBadge: true,
  badgeShowWhileThinking: true,
  badgeMode: "dot",
  badgeDoneText: "1",
  badgeClearAfterMs: 2500,
};

function $(id) {
  return document.getElementById(id);
}

async function load() {
  const opts = await chrome.storage.sync.get(DEFAULTS);

  $("enableNotification").checked = !!opts.enableNotification;
  $("enableSound").checked = !!opts.enableSound;
  $("flashTitle").checked = !!opts.flashTitle;
  $("notifyOnlyWhenInactive").checked = !!opts.notifyOnlyWhenInactive;

  $("focusTabOnDone").checked = !!opts.focusTabOnDone;
  $("focusWindowOnDone").checked = !!opts.focusWindowOnDone;

  $("enableBadge").checked = !!opts.enableBadge;
  $("badgeShowWhileThinking").checked = !!opts.badgeShowWhileThinking;
  $("badgeMode").value = opts.badgeMode ?? "dot";
  $("badgeDoneText").value = String(opts.badgeDoneText ?? "1");
  $("badgeClearAfterMs").value = String(opts.badgeClearAfterMs ?? 2500);

  $("minThinkingMs").value = String(opts.minThinkingMs ?? 1200);
  $("endSilenceMs").value = String(opts.endSilenceMs ?? 4000);
}

async function save() {
  const payload = {
    enableNotification: $("enableNotification").checked,
    enableSound: $("enableSound").checked,
    flashTitle: $("flashTitle").checked,
    notifyOnlyWhenInactive: $("notifyOnlyWhenInactive").checked,

    focusTabOnDone: $("focusTabOnDone").checked,
    focusWindowOnDone: $("focusWindowOnDone").checked,

    enableBadge: $("enableBadge").checked,
    badgeShowWhileThinking: $("badgeShowWhileThinking").checked,
    badgeMode: $("badgeMode").value,
    badgeDoneText: $("badgeDoneText").value || "1",
    badgeClearAfterMs: Number($("badgeClearAfterMs").value || 0),

    minThinkingMs: Number($("minThinkingMs").value || 0),
    endSilenceMs: Number($("endSilenceMs").value || 4000),
  };

  await chrome.storage.sync.set(payload);

  const btn = $("save");
  const old = btn.textContent;
  btn.textContent = "Saved!";
  setTimeout(() => (btn.textContent = old), 900);
}

async function reset() {
  await chrome.storage.sync.set({ ...DEFAULTS });
  await load();

  const btn = $("reset");
  const old = btn.textContent;
  btn.textContent = "Reset!";
  setTimeout(() => (btn.textContent = old), 900);
}

$("save").addEventListener("click", save);
$("reset").addEventListener("click", reset);

load();
