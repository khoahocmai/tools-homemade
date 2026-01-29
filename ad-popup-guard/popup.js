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
