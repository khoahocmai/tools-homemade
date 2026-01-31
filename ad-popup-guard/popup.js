const $enabled = document.getElementById("enabled");
const $status = document.getElementById("status");
const $sub = document.getElementById("sub");
const $saveUrl = document.getElementById("saveUrl");
const $clear = document.getElementById("clear");

const LAST_URL_KEY = (tabId) => `last_good_url_${tabId}`;

const BLOCKED_URLS = [
  /tiktok\.com\/view\/product/i,
  /s\.shopee\.vn\//i,
];

function isGoodUrl(url) {
  if (!url) return false;
  if (url === "about:blank") return false;
  if (url.startsWith("chrome://")) return false;
  if (url.startsWith("edge://")) return false;
  if (url.startsWith("chrome-extension://")) return false;
  if (BLOCKED_URLS.some((r) => r.test(url))) return false;
  return true;
}

function setStatus(text, type = "muted") {
  $status.textContent = text;
  // nhẹ thôi, không cần class phức tạp
  $status.style.color = type === "ok" ? "#bfe0ff" : "#9aa4b2";
}

function renderEnabled(enabled) {
  $enabled.checked = !!enabled;
  $sub.textContent = enabled ? "Đang bật chặn" : "Đang tắt chặn";
  setStatus("—");
}

async function getEnabled() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["enabled"], (res) => resolve(res.enabled ?? true));
  });
}

async function setEnabled(next) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ enabled: next }, () => resolve());
  });
}

async function saveActiveTabUrl() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    const url = tab?.url;

    if (tab?.id != null && isGoodUrl(url)) {
      const key = LAST_URL_KEY(tab.id);
      chrome.storage.session.set({ [key]: url }, () => {
        setStatus(`✅ Đã lưu URL`, "ok");
      });
    } else {
      setStatus(`⚠️ Không lưu được URL tab hiện tại`);
    }
  });
}

// init
(async function init() {
  const enabled = await getEnabled();
  renderEnabled(enabled);
  const list = await getAffectList();
  renderAffectList(list);
  if (enabled) saveActiveTabUrl();
})();

// toggle
$enabled.addEventListener("change", async () => {
  const next = $enabled.checked;
  await setEnabled(next);
  renderEnabled(next);
});

// actions
$saveUrl.addEventListener("click", () => {
  saveActiveTabUrl();
});

$clear.addEventListener("click", () => {
  setStatus("—");
});

// ===== Allowlist (Affect URLs) =====
const AFFECT_KEY = "affect_prefixes"; // array<string>, prefix match by startsWith()
const $siteList = document.getElementById("siteList");
const $siteHint = document.getElementById("siteHint");
const $siteInput = document.getElementById("siteInput");
const $addSite = document.getElementById("addSite");
const $addCurrentHost = document.getElementById("addCurrentHost");
const $addCurrentPath = document.getElementById("addCurrentPath");
const $clearSites = document.getElementById("clearSites");

function sanitizePrefix(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // accept "nhieutruyen.com/truyen/" -> add https://
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");

  try {
    const u = new URL(s);
    // normalize: drop query/hash
    u.search = "";
    u.hash = "";
    // keep as prefix string
    return u.toString();
  } catch {
    return null;
  }
}

function dirPrefixFromUrl(url) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";

    // folder prefix: remove last segment if not ending with /
    if (!u.pathname.endsWith("/")) {
      const idx = u.pathname.lastIndexOf("/");
      u.pathname = idx >= 0 ? u.pathname.slice(0, idx + 1) : "/";
    }
    return u.toString();
  } catch {
    return null;
  }
}

function hostPrefixFromUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + "/";
  } catch {
    return null;
  }
}

async function getAffectList() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AFFECT_KEY], (res) => resolve(Array.isArray(res[AFFECT_KEY]) ? res[AFFECT_KEY] : []));
  });
}

async function setAffectList(list) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AFFECT_KEY]: list }, () => resolve());
  });
}

function renderAffectList(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!$siteList) return;

  $siteList.innerHTML = "";

  if (arr.length === 0) {
    $siteHint.textContent = "Nếu danh sách rỗng: áp dụng cho mọi trang.";
  } else {
    $siteHint.textContent = `Đang áp dụng cho ${arr.length} mục (prefix match).`;
  }

  arr.forEach((prefix) => {
    const row = document.createElement("div");
    row.className = "siteItem";

    const t = document.createElement("div");
    t.className = "text";
    t.title = prefix;
    t.textContent = prefix;

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "Xoá";
    del.addEventListener("click", async () => {
      const next = (await getAffectList()).filter((x) => x !== prefix);
      await setAffectList(next);
      renderAffectList(next);
      setStatus("🗑 Đã xoá 1 mục", "ok");
    });

    row.appendChild(t);
    row.appendChild(del);
    $siteList.appendChild(row);
  });
}

async function addPrefix(prefix) {
  const p = sanitizePrefix(prefix);
  if (!p) {
    setStatus("⚠️ Prefix không hợp lệ", "muted");
    return;
  }
  const list = await getAffectList();
  if (list.includes(p)) {
    setStatus("ℹ️ Prefix đã tồn tại", "muted");
    return;
  }
  const next = [p, ...list].slice(0, 50);
  await setAffectList(next);
  renderAffectList(next);
  setStatus("✅ Đã thêm prefix", "ok");
}

async function clearPrefixes() {
  await setAffectList([]);
  renderAffectList([]);
  setStatus("🧹 Đã xoá toàn bộ danh sách", "ok");
}

async function getActiveTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0]?.url || null));
  });
}

// Wire events
if ($addSite) {
  $addSite.addEventListener("click", async () => {
    await addPrefix($siteInput?.value || "");
    if ($siteInput) $siteInput.value = "";
  });
}

if ($siteInput) {
  $siteInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await addPrefix($siteInput.value || "");
      $siteInput.value = "";
    }
  });
}

if ($addCurrentHost) {
  $addCurrentHost.addEventListener("click", async () => {
    const url = await getActiveTabUrl();
    const p = hostPrefixFromUrl(url || "");
    if (p) await addPrefix(p);
    else setStatus("⚠️ Không lấy được URL tab", "muted");
  });
}

if ($addCurrentPath) {
  $addCurrentPath.addEventListener("click", async () => {
    const url = await getActiveTabUrl();
    const p = dirPrefixFromUrl(url || "");
    if (p) await addPrefix(p);
    else setStatus("⚠️ Không lấy được URL tab", "muted");
  });
}

if ($clearSites) {
  $clearSites.addEventListener("click", async () => {
    await clearPrefixes();
  });
}
