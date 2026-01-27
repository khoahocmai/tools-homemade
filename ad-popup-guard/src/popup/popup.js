const btn = document.getElementById("toggle");
const status = document.getElementById("status");

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

function saveActiveTabUrl() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    const url = tab?.url;

    if (tab?.id != null && isGoodUrl(url)) {
      const key = `last_good_url_${tab.id}`; // ✅ cùng format với service-worker
      chrome.storage.session.set({ [key]: url }, () => {
        status.textContent = `✅ Đã lưu URL: ${url}`;
      });
    } else {
      status.textContent = `⚠️ Không lưu được URL (url=${url || "null"})`;
    }
  });
}

function render(enabled) {
  btn.textContent = enabled ? "TẮT chặn quảng cáo" : "BẬT chặn quảng cáo";
  btn.className = enabled ? "" : "off";
  // status sẽ được cập nhật thêm bởi saveActiveTabUrl()
}

chrome.storage.local.get(["enabled"], (res) => {
  render(res.enabled ?? true);
  // mở popup lên là lưu luôn (tuỳ bạn, không thích thì bỏ dòng này)
  saveActiveTabUrl();
});

btn.addEventListener("click", () => {
  // ✅ bấm nút là lưu URL hiện tại trước
  saveActiveTabUrl();

  // rồi mới toggle bật/tắt như code cũ của bạn
  chrome.storage.local.get(["enabled"], (res) => {
    const next = !(res.enabled ?? true);
    chrome.storage.local.set({ enabled: next }, () => {
      render(next);
    });
  });
});
