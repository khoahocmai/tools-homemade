const $status = document.getElementById("status");
const $sub = document.getElementById("sub");

// ===== Keys =====
const AFFECT_KEY = "affect_prefixes";   // array<string> - prefix match (startsWith)
const BLOCK_KEY = "block_patterns";    // array<string> - substring or glob (*)

// ===== DOM (Allowlist) =====
const $siteList = document.getElementById("siteList");
const $siteHint = document.getElementById("siteHint");
const $siteInput = document.getElementById("siteInput");
const $addSite = document.getElementById("addSite");
const $addCurrentHost = document.getElementById("addCurrentHost");
const $addCurrentPath = document.getElementById("addCurrentPath");
const $clearSites = document.getElementById("clearSites");

// ===== DOM (Blocklist) =====
const $blockList = document.getElementById("blockList");
const $blockHint = document.getElementById("blockHint");
const $blockInput = document.getElementById("blockInput");
const $addBlock = document.getElementById("addBlock");
const $addBlockDomain = document.getElementById("addBlockDomain");
const $addBlockUrl = document.getElementById("addBlockUrl");
const $clearBlocks = document.getElementById("clearBlocks");

// ===== Helpers =====
function setStatus(text, type = "muted") {
  if (!$status) return;
  $status.textContent = text;
  $status.style.color = type === "ok" ? "#bfe0ff" : "#9aa4b2";
}

function sanitizePrefix(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // accept "nhieutruyen.com/truyen/" -> add https://
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");

  try {
    const u = new URL(s);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function sanitizeBlockPattern(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // allow glob without scheme: "s.shopee.vn/" / "*doubleclick*"
  // If it looks like a URL, normalize by removing query/hash.
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      u.search = "";
      u.hash = "";
      s = u.toString();
    } catch { /* keep as-is */ }
  }

  return s;
}

function dirPrefixFromUrl(url) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
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

async function getActiveTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0]?.url || null));
  });
}

function getList(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => resolve(Array.isArray(res[key]) ? res[key] : []));
  });
}

function setList(key, list) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: list }, () => resolve());
  });
}

// ===== Render list =====
function renderList({ list, container, hintEl, emptyHint, nonEmptyHint }) {
  const arr = Array.isArray(list) ? list : [];
  container.innerHTML = "";

  if (arr.length === 0) {
    hintEl.textContent = emptyHint;
  } else {
    hintEl.textContent = nonEmptyHint.replace("{n}", String(arr.length));
  }

  arr.forEach((value) => {
    const row = document.createElement("div");
    row.className = "siteItem";

    const t = document.createElement("div");
    t.className = "text";
    t.title = value;
    t.textContent = value;

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "Xoá";
    del.addEventListener("click", async () => {
      const key = container === $siteList ? AFFECT_KEY : BLOCK_KEY;
      const next = (await getList(key)).filter((x) => x !== value);
      await setList(key, next);
      await refresh();
      setStatus("🗑 Đã xoá 1 mục", "ok");
    });

    row.appendChild(t);
    row.appendChild(del);
    container.appendChild(row);
  });
}

async function addItem(key, raw, sanitizer, max = 80) {
  const v = sanitizer(raw);
  if (!v) {
    setStatus("⚠️ Giá trị không hợp lệ", "muted");
    return;
  }
  const list = await getList(key);
  if (list.includes(v)) {
    setStatus("ℹ️ Đã tồn tại", "muted");
    return;
  }
  const next = [v, ...list].slice(0, max);
  await setList(key, next);
  await refresh();
  setStatus("✅ Đã thêm", "ok");
}

async function clearList(key) {
  await setList(key, []);
  await refresh();
  setStatus("🧹 Đã xoá toàn bộ", "ok");
}

async function refresh() {
  // allowlist
  const affect = await getList(AFFECT_KEY);
  renderList({
    list: affect,
    container: $siteList,
    hintEl: $siteHint,
    emptyHint: "Danh sách rỗng: sẽ KHÔNG chặn ở đâu (khuyến nghị).",
    nonEmptyHint: "Đang áp dụng cho {n} mục (prefix match).",
  });

  // blocklist
  const blocks = await getList(BLOCK_KEY);
  renderList({
    list: blocks,
    container: $blockList,
    hintEl: $blockHint,
    emptyHint: "Danh sách rỗng: chỉ dùng block mặc định trong code (nếu có).",
    nonEmptyHint: "Đang chặn theo {n} pattern.",
  });

  // header/sub
  if ($sub) $sub.textContent = "Auto chặn đang bật";
}

// ===== Wire events =====
// Allowlist
$addSite?.addEventListener("click", async () => {
  await addItem(AFFECT_KEY, $siteInput?.value || "", sanitizePrefix, 50);
  if ($siteInput) $siteInput.value = "";
});
$siteInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    await addItem(AFFECT_KEY, $siteInput.value || "", sanitizePrefix, 50);
    $siteInput.value = "";
  }
});
$addCurrentHost?.addEventListener("click", async () => {
  const url = await getActiveTabUrl();
  const p = hostPrefixFromUrl(url || "");
  if (p) await addItem(AFFECT_KEY, p, sanitizePrefix, 50);
  else setStatus("⚠️ Không lấy được URL tab", "muted");
});
$addCurrentPath?.addEventListener("click", async () => {
  const url = await getActiveTabUrl();
  const p = dirPrefixFromUrl(url || "");
  if (p) await addItem(AFFECT_KEY, p, sanitizePrefix, 50);
  else setStatus("⚠️ Không lấy được URL tab", "muted");
});
$clearSites?.addEventListener("click", async () => {
  await clearList(AFFECT_KEY);
});

// Blocklist
$addBlock?.addEventListener("click", async () => {
  await addItem(BLOCK_KEY, $blockInput?.value || "", sanitizeBlockPattern, 120);
  if ($blockInput) $blockInput.value = "";
});
$blockInput?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    await addItem(BLOCK_KEY, $blockInput.value || "", sanitizeBlockPattern, 120);
    $blockInput.value = "";
  }
});
$addBlockDomain?.addEventListener("click", async () => {
  const url = await getActiveTabUrl();
  const p = hostPrefixFromUrl(url || "");
  if (p) await addItem(BLOCK_KEY, p, sanitizeBlockPattern, 120);
  else setStatus("⚠️ Không lấy được URL tab", "muted");
});
$addBlockUrl?.addEventListener("click", async () => {
  const url = await getActiveTabUrl();
  if (url) await addItem(BLOCK_KEY, url, sanitizeBlockPattern, 120);
  else setStatus("⚠️ Không lấy được URL tab", "muted");
});
$clearBlocks?.addEventListener("click", async () => {
  await clearList(BLOCK_KEY);
});

// Init
(async function init() {
  await refresh();
  setStatus("✅ Auto chặn đang bật", "ok");
})();
