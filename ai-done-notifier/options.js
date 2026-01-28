const DEFAULTS = {
  enableNotification: true,
  enableSound: true,
  flashTitle: true,
  stableMs: 1600,

  notifyOnlyWhenInactive: true,
  focusTabOnDone: false,
  focusWindowOnDone: false,
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

  // NEW
  $("focusWindowOnDone").checked = !!opts.focusWindowOnDone;

  $("stableMs").value = String(opts.stableMs ?? DEFAULTS.stableMs);
}

async function save() {
  const payload = {
    enableNotification: $("enableNotification").checked,
    enableSound: $("enableSound").checked,
    flashTitle: $("flashTitle").checked,

    notifyOnlyWhenInactive: $("notifyOnlyWhenInactive").checked,
    focusTabOnDone: $("focusTabOnDone").checked,

    // NEW
    focusWindowOnDone: $("focusWindowOnDone").checked,

    stableMs: Number($("stableMs").value || DEFAULTS.stableMs),
  };

  await chrome.storage.sync.set(payload);

  const btn = $("save");
  const old = btn.textContent;
  btn.textContent = "Saved!";
  setTimeout(() => (btn.textContent = old), 900);
}

$("save").addEventListener("click", save);
load();
