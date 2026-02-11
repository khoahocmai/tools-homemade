// Auto-finder: Tự động tìm link truyện trên các trang web đọc truyện phổ biến
console.log("[AutoFinder] Script loaded");

const STORY_SITES = [
    { domain: 'truyenfull.vn', priority: 100, selector: 'a.truyen-title, h1.title a, .book-title a' },
    { domain: 'wikidich.com', priority: 95, selector: '.book-name a, h1.title a' },
    { domain: 'sangtacviet.vip', priority: 90, selector: '.book-info h1 a, .story-title a' },
    { domain: 'bachngocsach.com.vn', priority: 90, selector: '.book-title a, h1 a' },
    { domain: 'tangthuvien.vn', priority: 85, selector: '.book-info h1, .book-name' },
    { domain: 'sstruyen.vn', priority: 80, selector: '.book-title, h1.title' },
    { domain: 'dtruyen.com', priority: 80, selector: '.story-title, h1 a' },
    { domain: 'truyenyy.vn', priority: 75, selector: '.book-name, .story-title' },
    { domain: 'metruyenchu.com', priority: 70, selector: '.book-name, h1.title' }
];

// Kiểm tra xem trang hiện tại có phải là trang truyện không
function detectStoryPage() {
    const currentDomain = window.location.hostname.replace('www.', '');
    const site = STORY_SITES.find(s => currentDomain.includes(s.domain));

    if (!site) return null;

    // Tìm tiêu đề truyện
    const titleEl = document.querySelector(site.selector);
    if (!titleEl) return null;

    const title = titleEl.textContent.trim();
    const url = window.location.href;

    // Tìm chương hiện tại nếu có
    let currentChapter = 0;
    const chapterMatch = url.match(/chuong[_-]?(\d+)|chapter[_-]?(\d+)|c(\d+)/i);
    if (chapterMatch) {
        currentChapter = parseInt(chapterMatch[1] || chapterMatch[2] || chapterMatch[3]) || 0;
    }

    return {
        title,
        url,
        domain: currentDomain,
        priority: site.priority,
        currentChapter
    };
}

// Lắng nghe yêu cầu từ extension
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[AutoFinder] Received message:", msg.type);

    if (msg?.type === "DETECT_STORY") {
        const storyInfo = detectStoryPage();
        console.log("[AutoFinder] Story detected:", storyInfo);
        sendResponse({ ok: true, story: storyInfo });
        return true;
    }

    if (msg?.type === "NAVIGATE_TO_CHAPTER") {
        const { targetChapter } = msg;
        console.log("[AutoFinder] Navigating to chapter:", targetChapter);

        // Thử tìm link đến chương cụ thể
        const chapterLink = findChapterLink(targetChapter);
        if (chapterLink) {
            window.location.href = chapterLink;
            sendResponse({ ok: true, navigated: true });
        } else {
            sendResponse({ ok: false, error: "Chapter link not found" });
        }
        return true;
    }
});

function findChapterLink(chapterNum) {
    // Tìm link chương trong danh sách chương
    const chapterLinks = document.querySelectorAll('a[href*="chuong"], a[href*="chapter"]');

    for (const link of chapterLinks) {
        const href = link.href;
        const match = href.match(/chuong[_-]?(\d+)|chapter[_-]?(\d+)|c(\d+)/i);
        if (match) {
            const num = parseInt(match[1] || match[2] || match[3]);
            if (num === chapterNum) {
                return href;
            }
        }
    }

    // Fallback: tạo URL dựa trên pattern hiện tại
    const currentUrl = window.location.href;
    const baseUrl = currentUrl.replace(/chuong[_-]?\d+|chapter[_-]?\d+|c\d+/i, '');

    // Thử các pattern phổ biến
    const patterns = [
        `${baseUrl}chuong-${chapterNum}`,
        `${baseUrl}chapter-${chapterNum}`,
        `${baseUrl}c${chapterNum}`
    ];

    return patterns[0]; // Trả về pattern đầu tiên
}

console.log("[AutoFinder] Ready to detect stories");
