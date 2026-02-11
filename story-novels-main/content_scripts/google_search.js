// Tự động tìm link truyện trên trang Google Search
console.log("[GoogleSearch] Script loaded");

(function () {
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get('q');

    const BAD_DOMAINS = ['metruyencv.com', 'google.com', 'youtube.com', 'facebook.com'];
    const PREFERRED_DOMAINS = [
        { domain: 'truyenfull.vn', priority: 100 },
        { domain: 'wikidich.com', priority: 95 },
        { domain: 'sangtacviet.vip', priority: 90 },
        { domain: 'bachngocsach.com.vn', priority: 90 },
        { domain: 'tangthuvien.vn', priority: 85 },
        { domain: 'sstruyen.vn', priority: 80 },
        { domain: 'dtruyen.com', priority: 80 },
        { domain: 'truyenyy.vn', priority: 75 },
        { domain: 'metruyenchu.com', priority: 70 }
    ];

    function extractSearchResults() {
        console.log("[GoogleSearch] Extracting search results...");
        const links = document.querySelectorAll('div.g a');
        const results = [];

        for (let i = 0; i < links.length; i++) {
            const href = links[i].href;

            try {
                const urlObj = new URL(href);
                const domain = urlObj.hostname.replace('www.', '');

                // Bỏ qua domain rác
                if (BAD_DOMAINS.some(d => domain.includes(d))) continue;

                // Tính điểm ưu tiên
                let priority = 0;
                const preferredSite = PREFERRED_DOMAINS.find(s => domain.includes(s.domain));
                if (preferredSite) {
                    priority = preferredSite.priority;
                } else if (domain.includes('truyen')) {
                    priority = 50; // Fallback cho các trang có chữ "truyen"
                }

                const title = links[i].querySelector('h3')?.textContent || "";

                results.push({
                    url: href,
                    title,
                    domain,
                    priority
                });
            } catch (e) {
                console.error("[GoogleSearch] Error parsing link:", e);
            }
        }

        // Sắp xếp theo độ ưu tiên
        results.sort((a, b) => b.priority - a.priority);
        console.log("[GoogleSearch] Found", results.length, "results");
        return results;
    }

    // Lắng nghe yêu cầu từ extension
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        console.log("[GoogleSearch] Received message:", msg.type);

        if (msg?.type === "GET_SEARCH_RESULTS") {
            const results = extractSearchResults();
            sendResponse({ ok: true, links: results });
            return true;
        }

        if (msg?.type === "CHECK_SEARCH_TASK") {
            sendResponse({ task: "EXTRACT_LINK", autoClose: false });
            return true;
        }
    });

    // Tự động extract nếu được gọi từ extension
    chrome.runtime.sendMessage({ type: "CHECK_SEARCH_TASK", query: q || "" }, (response) => {
        if (response && response.task === "EXTRACT_LINK") {
            const results = extractSearchResults();

            if (results.length > 0) {
                const foundLink = results[0]; // Lấy link có priority cao nhất

                chrome.runtime.sendMessage({
                    type: "SEARCH_RESULT_FOUND",
                    originalQuery: q,
                    link: foundLink.url,
                    title: foundLink.title,
                    storyId: response.storyId
                });

                if (response.autoClose) {
                    chrome.runtime.sendMessage({ type: "CLOSE_ME" });
                }
            } else {
                chrome.runtime.sendMessage({
                    type: "SEARCH_RESULT_NOT_FOUND",
                    storyId: response.storyId
                });
                if (response.autoClose) chrome.runtime.sendMessage({ type: "CLOSE_ME" });
            }
        }
    });
})();

console.log("[GoogleSearch] Ready");
