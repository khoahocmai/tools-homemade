chrome.webRequest.onBeforeSendHeaders.addListener(
  async function (details) {

    if (details.tabId < 0) return;

    try {
      const tab = await chrome.tabs.get(details.tabId);
      if (!tab || !tab.url) return;

      const tabUrl = new URL(tab.url);
      const requestUrl = new URL(details.url);

      // ✅ Chỉ lấy nếu cùng domain
      if (tabUrl.hostname !== requestUrl.hostname) return;

      const headers = details.requestHeaders || [];

      for (let header of headers) {
        if (header.name.toLowerCase() === 'authorization') {

          const token = header.value.split(' ')[1];
          if (!token) return;

          const tokenInfo = {
            token,
            domain: tabUrl.hostname,
            pageUrl: tab.url,
            apiUrl: details.url,
            time: new Date().toLocaleString()
          };

          console.log("🔥 Token captured:", tokenInfo);

          // ✅ Lưu theo domain
          chrome.storage.local.get("tokens", (result) => {
            const tokens = result.tokens || {};
            tokens[tabUrl.hostname] = tokenInfo;

            chrome.storage.local.set({ tokens });
          });
        }
      }

    } catch (err) {
      console.error("Error capturing token:", err);
    }
  },
  {
    urls: [
      "http://localhost:3030/*",
      "https://api.qsr.vuigroup.com.vn/*",
      "https://api.qsrecom.vuigroup.com.vn/*"
    ]
  },
  ["requestHeaders"]
);