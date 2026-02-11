// service_worker.js - Entry Point (ES Module)
import { imageCache, IMG_CACHE_DB } from './lib/image_cache.js';
import { normalizeUrl, createSlug } from './lib/url_utils.js';
import { loadDB, saveDB, upsertStories, STORE_KEY } from './lib/db.js';
import { findAllCandidates } from './lib/link_checker.js';

// === SCAN CONTROLLER - Chạy trong isolated world (content script) ===
// PHẢI giữ inline vì được inject vào page qua chrome.scripting.executeScript
function scanController() {
    if (window.__sr_scanning) return;
    window.__sr_scanning = true;

    const collected = new Map();
    let running = true;
    let lastPagination = null;
    let pendingResolve = null;

    function updateUI(status, tabName, progress) {
        chrome.runtime.sendMessage({
            type: "SCAN_STATUS_UPDATE",
            status,
            count: collected.size,
            tabName: tabName || '',
            progress: progress || 0
        }).catch(() => { });
    }

    // Chuẩn hóa URL để tránh trùng lặp
    function normalizeUrl(url) {
        try {
            if (!url) return "";
            if (!url.startsWith('http')) {
                if (url.startsWith('/')) url = 'https://metruyencv.com' + url;
                else url = 'https://metruyencv.com/' + url;
            }
            const u = new URL(url);
            let host = u.hostname.toLowerCase().replace(/^www\./, '');
            const protocol = 'https:';
            let path = u.pathname;
            if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);

            // Loại bỏ /chuong-xxx
            path = path.replace(/\/chuong-.*$/i, '');

            return `${protocol}//${host}${path}`;
        } catch (e) { return url; }
    }

    // Xử lý một gói data API
    function processApiResponse(url, json) {
        if (!json?.success || !json?.data) return;
        lastPagination = json.pagination || null;

        json.data.forEach(item => {
            const book = item.book;
            if (!book?.slug) return;

            let link = book.link || `https://metruyencv.com/truyen/${book.slug}`;
            link = normalizeUrl(link);
            const cur = item.chapter_index || 0;
            const total = book.latest_index || 0;
            const img = (book.poster && (book.poster['150'] || book.poster['default'])) || '';

            const author = item.author || (book.author || {});
            const author_name = author.name || '';
            const author_local = author.local_name || '';

            if (!collected.has(link)) {
                collected.set(link, {
                    name: book.name,
                    old_link: link,
                    cur,
                    total,
                    img,
                    new_link: '',
                    author_name,
                    author_local
                });
            } else {
                const ex = collected.get(link);
                if (cur > ex.cur) ex.cur = cur;
                if (total > ex.total) ex.total = total;
                if (author_name) ex.author_name = author_name;
                if (author_local) ex.author_local = author_local;
            }
        });

        const tabType = url.includes('readings') ? 'Đang Đọc' : 'Tủ Truyện';
        const pageInfo = lastPagination ? `Trang ${lastPagination.current}/${lastPagination.last}` : 'Đang tải';
        updateUI(`📥 ${pageInfo} — ${collected.size} truyện`, tabType, 20);

        // REALTIME: Gửi data về background ngay lập tức (để Sidepanel hiển thị)
        const items = Array.from(collected.values());
        chrome.runtime.sendMessage({ type: "SCAN_RESULT", items }).catch(() => { });

        if (pendingResolve) {
            pendingResolve(true);
            pendingResolve = null;
        }
    }

    // Fallback: Quét HTML nếu API lỗi
    function scanFromDOM(tabType) {
        console.log('[StoryRescue] Scanning DOM fallback...');
        let count = 0;
        const titles = document.querySelectorAll('span[data-x-text*="book.name"]');

        titles.forEach(span => {
            try {
                const a = span.closest('a');
                if (!a) return;
                let link = a.href;
                if (!link || !link.includes('/truyen/')) return;

                link = normalizeUrl(link);

                const name = span.textContent.trim();
                const imgNode = a.querySelector('img');
                const img = imgNode ? (imgNode.src || imgNode.getAttribute('data-src') || '') : '';

                let cur = 0, total = 0;
                const row = a.closest('li') || a.parentElement?.parentElement;
                if (row) {
                    const txt = row.innerText;
                    const m = txt.match(/(\d+)\s*\/\s*(\d+)/);
                    if (m) { cur = parseInt(m[1]); total = parseInt(m[2]); }
                }

                if (!collected.has(link)) {
                    collected.set(link, {
                        name, old_link: link, cur, total, img,
                        new_link: '', author_name: '', author_local: ''
                    });
                    count++;
                }
            } catch (e) { }
        });

        if (count > 0) {
            const items = Array.from(collected.values());
            chrome.runtime.sendMessage({ type: "SCAN_RESULT", items }).catch(() => { });
            updateUI(`⚠️ Quét UI: +${count} truyện`, tabType, 20);
        }
        return count;
    }

    // === Nhận data từ MAIN world qua postMessage ===
    window.addEventListener('message', (event) => {
        if (event.data?.source === '__sr_api') {
            let json;
            try { json = JSON.parse(event.data.payload); } catch (e) { return; }
            processApiResponse(event.data.url, json);
        }
        if (event.data?.source === '__sr_cache_data') {
            let cache;
            try { cache = JSON.parse(event.data.cache); } catch (e) { return; }
            if (cache.readings) processApiResponse('/api/readings', cache.readings);
            if (cache.bookmarks) processApiResponse('/api/bookmarks', cache.bookmarks);
        }
    });

    const stopListener = (msg) => {
        if (msg.type === 'STOP_SCAN_CMD') {
            running = false;
            chrome.runtime.onMessage.removeListener(stopListener);
        }
    };
    chrome.runtime.onMessage.addListener(stopListener);

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function prepareWaitForData(timeout = 8000) {
        return new Promise(resolve => {
            pendingResolve = () => resolve(true);
            setTimeout(() => {
                if (pendingResolve) {
                    pendingResolve = null;
                    resolve(false);
                }
            }, timeout);
        });
    }

    function findPrevBtn() {
        const btn = document.querySelector('button[data-x-bind="PrevPage"]');
        if (btn && !btn.disabled && !btn.classList.contains('text-gray-500')) {
            return btn;
        }
        return null;
    }

    async function clickAndWait(el, targetPage, timeout = 6000) {
        let retries = 0;
        const MAX_RETRIES = 3;

        while (retries <= MAX_RETRIES && running) {
            if (lastPagination && lastPagination.current == targetPage) {
                console.log(`[StoryRescue] Target page ${targetPage} matched current page.`);
                return true;
            }

            const promise = prepareWaitForData(timeout);
            console.log(`[StoryRescue] Clicking for Page ${targetPage} (Attempt ${retries + 1})...`);

            try {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await sleep(500);
                el.click();
            } catch (err) {
                console.error("Click error:", err);
            }

            const success = await promise;
            if (success && lastPagination && lastPagination.current == targetPage) {
                return true;
            }

            retries++;

            if (retries === 2 && running) {
                const prevBtn = findPrevBtn();
                if (prevBtn) {
                    updateUI(`🔄 Đang thử refresh (Lùi trang)...`, null, null);
                    console.log("[StoryRescue] Deployment Strategy: Click Prev to refresh");
                    const backPromise = prepareWaitForData(4000);
                    prevBtn.click();
                    await backPromise;
                    await sleep(1500);
                    updateUI(`🔄 Thử lại trang ${targetPage}...`, null, null);
                }
            }

            if (retries <= MAX_RETRIES && running) {
                updateUI(`⏳ Đang đợi trang ${targetPage} (Lần ${retries})...`, null, null);
                await sleep(2000);
                window.postMessage({ source: '__sr_query_cache' }, '*');
                await sleep(500);
            }
        }
        return false;
    }

    function findNavBtn(targetPage) {
        const selectors = [
            'div[data-x-data*="pagination"]',
            'ul.pagination',
            '.pagination'
        ];
        const allContainers = Array.from(document.querySelectorAll(selectors.join(',')));
        const visibleContainer = allContainers.find(el => {
            return el.offsetParent !== null && el.getBoundingClientRect().height > 0;
        });

        if (visibleContainer) {
            console.log('[StoryRescue] Found Visible Pagination:', visibleContainer);
            const nextBtn = visibleContainer.querySelector('button[data-x-bind="NextPage"]') ||
                visibleContainer.querySelector('[aria-label="Next"]');
            if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('text-gray-500')) {
                return nextBtn;
            }
            const numBtn = Array.from(visibleContainer.querySelectorAll('button, a')).find(b => {
                return b.textContent.trim() == targetPage && !b.disabled;
            });
            if (numBtn) return numBtn;
        }

        const globalNexts = Array.from(document.querySelectorAll('button[data-x-bind="NextPage"]'));
        const visibleNext = globalNexts.find(b => {
            return !b.disabled &&
                !b.classList.contains('text-gray-500') &&
                b.offsetParent !== null &&
                !b.closest('header') &&
                !b.closest('.navbar');
        });

        return visibleNext || null;
    }

    function findTabButtons() {
        let readingBtn = null, bookmarkBtn = null;
        const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));

        readingBtn = buttons.find(b => {
            const t = b.textContent.toLowerCase();
            return t.includes('đang đọc') || t.includes('reading');
        });

        bookmarkBtn = buttons.find(b => {
            const t = b.textContent.toLowerCase();
            return t.includes('tủ truyện') || t.includes('bookmark') || t.includes('đánh dấu');
        });

        if (!readingBtn) readingBtn = document.getElementById('tab-reading') || document.querySelector('[aria-controls="tab-reading"]');
        if (!bookmarkBtn) bookmarkBtn = document.getElementById('tab-bookmark') || document.querySelector('[aria-controls="tab-bookmark"]');

        console.log('[StoryRescue] Found Buttons:', {
            reading: readingBtn ? readingBtn.tagName : 'NULL',
            bookmark: bookmarkBtn ? bookmarkBtn.tagName : 'NULL'
        });

        return { readingBtn, bookmarkBtn };
    }

    async function checkCurrentLocation() {
        if (!window.location.href.includes('/tai-khoan/tu-truyen')) {
            console.warn('[StoryRescue] Sai đường dẫn:', window.location.href);
            updateUI('⚠️ Sai đường dẫn! Đang chuyển hướng...', null, null);
            window.location.href = 'https://metruyencv.com/tai-khoan/tu-truyen';
            await sleep(10000);
            return false;
        }
        return true;
    }

    // === CHẾ ĐỘ QUÉT LIÊN TỤC (NON-STOP) ===
    async function paginateAll(tabName) {
        updateUI(`🚀 CHẾ ĐỘ QUÉT NON-STOP (Click Only)...`, tabName, 0);

        let step = 0;
        const WAIT_TIME = 3000;

        while (running) {
            step++;

            if (lastPagination && lastPagination.last > 0 && lastPagination.current >= lastPagination.last) {
                console.log(`[StoryRescue] Stopping at page ${lastPagination.current}/${lastPagination.last}`);
                updateUI(`🏁 Đã xong ${lastPagination.last} trang. Chuyển...`, tabName, 100);
                break;
            }

            let navBtn = findNavBtn(0);

            if (!navBtn) {
                const svgs = document.querySelectorAll('path[d="M9 6l6 6l-6 6"]');
                for (let p of svgs) {
                    const b = p.closest('button');
                    if (b && !b.disabled && b.offsetParent !== null) {
                        navBtn = b;
                        break;
                    }
                }
            }

            if (!navBtn) {
                console.log("[StoryRescue] Next button not found. Scrolling...");
                window.scrollTo(0, document.body.scrollHeight);
                await sleep(1500);
                navBtn = findNavBtn(0);
                if (!navBtn) {
                    updateUI(`✅ Hết trang (hoặc bị chặn).`, tabName, 100);
                    break;
                }
            }

            if (step % 5 === 0) updateUI(`⏩ Đã duyệt qua ${step} bước...`, tabName, 20);

            try {
                navBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await sleep(500);
                navBtn.click();
            } catch (e) { console.error("[StoryRescue] Click failed:", e); }

            await sleep(2000);
            const domItems = scanFromDOM(tabName);
            if (domItems > 0) console.log(`[StoryRescue] DOM Scan harvested +${domItems} items`);
            await sleep(WAIT_TIME - 2000);
        }
    }

    async function runFullScan() {
        try {
            console.log("[StoryRescue] Scan Routine Started");
            const correctUrl = await checkCurrentLocation();
            if (!correctUrl) return;

            updateUI('🔍 Kiểm tra dữ liệu khởi tạo...', 'Khởi tạo', 5);
            lastPagination = null;
            window.postMessage({ source: '__sr_query_cache' }, '*');
            await sleep(1500);

            const { readingBtn, bookmarkBtn } = findTabButtons();

            // --- Tab 1: Đang Đọc ---
            if (readingBtn && running) {
                updateUI('📚 Đang chuyển sang tab Đang Đọc...', 'Đang Đọc', 10);
                if (readingBtn.tagName === 'A' && readingBtn.href) {
                    console.warn('Reading Button is a Link! Skipping click.');
                } else {
                    await clickAndWait(readingBtn, 1, 5000);
                }
                await paginateAll('Đang Đọc');
            }

            // --- Tab 2: Tủ Truyện / Đánh Dấu ---
            if (bookmarkBtn && running) {
                updateUI('🔖 Đang chuyển sang tab Tủ Truyện...', 'Tủ Truyện', 55);
                lastPagination = null;

                if (bookmarkBtn.tagName === 'A' && bookmarkBtn.href) {
                    console.warn('Bookmark Button is a Link! Skipping click.');
                } else {
                    bookmarkBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    await sleep(500);
                    bookmarkBtn.click();
                    await sleep(2000);
                    window.postMessage({ source: '__sr_query_cache' }, '*');
                    await sleep(1000);
                }
                await paginateAll('Tủ Truyện');
            }

            const items = Array.from(collected.values());
            chrome.runtime.sendMessage({ type: "SCAN_RESULT", items }).catch(() => { });
            updateUI(`🎉 Hoàn tất! ${items.length} truyện`, 'Xong', 100);

            setTimeout(() => {
                chrome.runtime.sendMessage({ type: "SCAN_DONE" }).catch(() => { });
                window.__sr_scanning = false;
                chrome.runtime.onMessage.removeListener(stopListener);
            }, 2000);

        } catch (err) {
            console.error('[StoryRescue] Fatal Error in Scan:', err);
            updateUI(`❌ Lỗi nghiêm trọng: ${err.message}`, 'Lỗi', 0);
            window.__sr_scanning = false;
        }
    }

    runFullScan();
}

// Hàm kiểm tra tự động click tách biệt (inject vào page)
function runTestClickMode() {
    console.log("[StoryRescue] TEST CLICK MODE INIT");
    const existing = document.getElementById('sr-test-box');
    if (existing) existing.remove();

    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'fixed', bottom: '20px', left: '20px', padding: '15px',
        background: 'rgba(220, 38, 38, 0.95)', color: 'white', zIndex: 9999999,
        fontSize: '14px', fontWeight: 'bold', borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)', fontFamily: 'Arial, sans-serif'
    });
    box.id = 'sr-test-box';
    document.body.appendChild(box);

    const log = (text) => {
        console.log(text);
        box.innerHTML = `<div>${text}</div><div style="margin-top:8px;font-size:12px;opacity:0.8;cursor:pointer;border:1px solid white;padding:2px;text-align:center;">(Bấm để DỪNG)</div>`;
        box.onclick = () => { running = false; box.remove(); };
    };

    let running = true;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function run() {
        let count = 0;
        log("🚀 Test Mode: Đang quét nút Next...");

        while (running) {
            count++;
            let btn = document.querySelector('button[data-x-bind="NextPage"]');
            if (!btn || btn.disabled) {
                const paths = document.querySelectorAll('path[d="M9 6l6 6l-6 6"]');
                for (let p of paths) {
                    const b = p.closest('button');
                    if (b && !b.disabled && b.offsetParent !== null) {
                        btn = b;
                        break;
                    }
                }
            }

            if (count === 1 && !btn) {
                console.log("[DEBUG] Không tìm thấy nút Next ở lần 1. Dump các button:");
                document.querySelectorAll('button').forEach(b => console.log(b));
            }

            if (btn) {
                log(`[#${count}] 🔥 CLICK! (Type: ${btn.getAttribute('data-x-bind') || 'SVG'})`);
                const originalBorder = btn.style.border;
                btn.style.border = "4px solid red";
                btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await sleep(500);
                try {
                    btn.click();
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                } catch (e) { log("Lỗi: " + e.message); }
                await sleep(500);
                btn.style.border = originalBorder;
                await sleep(1000);
            } else {
                log(`[#${count}] ⚠️ Không tìm thấy nút Next. Đang tìm lại...`);
                if (count % 5 === 0) window.scrollTo(0, document.body.scrollHeight);
                await sleep(2000);
            }
        }
    }
    run();
}

// === Extension Lifecycle ===
chrome.runtime.onInstalled.addListener(async () => {
    console.log("[Story Novels] Extension Installed");
    if (chrome.sidePanel?.setPanelBehavior) {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        console.log("[Story Novels] Side panel behavior set: openPanelOnActionClick = true");
    } else {
        console.warn("[Story Novels] chrome.sidePanel.setPanelBehavior is not available");
    }
});

// === Message Router ===
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        // --- Test Mode ---
        if (msg?.type === "TEST_CLICK_MODE") {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: runTestClickMode
                });
            }
            sendResponse({ ok: true });
            return;
        }

        // --- Scan ---
        if (msg?.type === "SCAN_RESULT") {
            console.log("[ServiceWorker] Processing SCAN_RESULT, items:", msg.items?.length);
            const db = await loadDB();
            upsertStories(db, msg.items);
            await saveDB(db);
            sendResponse({ ok: true, count: Object.keys(db.byLink).length });
            return;
        }

        if (msg?.type === "SCAN_DONE") {
            console.log("[ServiceWorker] SCAN_DONE received");
            sendResponse({ ok: true });
            return;
        }

        if (msg?.type === "GET_DB") {
            const db = await loadDB();
            sendResponse({ ok: true, db });
            return;
        }

        if (msg?.type === "SET_NEW_LINK") {
            const { old_link, new_link } = msg;
            console.log("[ServiceWorker] SET_NEW_LINK for", old_link, "=>", new_link);
            const db = await loadDB();
            if (db.byLink[old_link]) {
                db.byLink[old_link].new_link = new_link || "";
                await saveDB(db);
            }
            sendResponse({ ok: true });
            return;
        }

        // --- Export ---
        if (msg?.type === "EXPORT_CSV") {
            console.log("[ServiceWorker] EXPORT_CSV requested");
            const db = await loadDB();
            const rows = Object.values(db.byLink);
            if (rows.length === 0) {
                sendResponse({ ok: false, error: "No data to export" });
                return;
            }
            const header = ["Tên Truyện", "Link Gốc", "Chương Đang Đọc", "Tổng Chương", "Ảnh", "Link Mới"];
            const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
            const csv = [header.join(",")].concat(
                rows.map(r => [
                    escape(r.name),
                    escape(r.old_link),
                    escape(r.cur),
                    escape(r.total),
                    escape(r.img),
                    escape(r.new_link)
                ].join(","))
            ).join("\n");

            const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + csv);
            await chrome.downloads.download({
                url: dataUrl,
                filename: "list_truyen.csv",
                saveAs: true
            });

            console.log("[ServiceWorker] CSV exported, total:", rows.length);
            sendResponse({ ok: true, total: rows.length });
            return;
        }

        // --- Search ---
        if (msg?.type === "CHECK_SEARCH_TASK") {
            sendResponse({ task: "EXTRACT_LINK", autoClose: false });
            return;
        }

        if (msg?.type === "SEARCH_RESULT_FOUND") {
            const { originalQuery, link, title } = msg;
            const db = await loadDB();

            let bestMatch = null;
            const values = Object.values(db.byLink);
            for (const story of values) {
                if (originalQuery && originalQuery.includes(story.name)) {
                    bestMatch = story;
                    break;
                }
            }

            if (bestMatch) {
                const old_link = bestMatch.old_link;
                if (db.byLink[old_link]) {
                    db.byLink[old_link].new_link = link;
                    await saveDB(db);
                    chrome.runtime.sendMessage({ type: "DB_UPDATED" }).catch(() => { });
                }
            }
            sendResponse({ ok: true });
            return;
        }

        if (msg?.type === "SEARCH_RESULT_NOT_FOUND") {
            console.log("[ServiceWorker] Search result not found for story:", msg.storyId);
            sendResponse({ ok: true });
            return;
        }

        if (msg?.type === "CLOSE_ME") {
            if (sender.tab?.id) {
                chrome.tabs.remove(sender.tab.id).catch(() => { });
            }
            sendResponse({ ok: true });
            return;
        }

        // --- Scan Active Tab ---
        if (msg?.type === "START_SCAN_ACTIVE_TAB") {
            console.log("[ServiceWorker] START_SCAN_ACTIVE_TAB requested");
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
                console.error("[ServiceWorker] No active tab found");
                sendResponse({ ok: false, error: "No active tab" });
                return;
            }
            console.log("[ServiceWorker] Tab:", tab.id, tab.url);

            try {
                console.log("[ServiceWorker] Reloading tab...");
                await chrome.tabs.reload(tab.id);

                await new Promise((resolve) => {
                    const listener = (tabId, info) => {
                        if (tabId === tab.id && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                    setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }, 15000);
                });
                console.log("[ServiceWorker] Tab reloaded, waiting for page JS...");

                await new Promise(r => setTimeout(r, 1500));

                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: scanController
                });
                console.log("[ServiceWorker] scanController injected (isolated world)");

                sendResponse({ ok: true, tabId: tab.id });
            } catch (err) {
                console.error("[ServiceWorker] Failed:", err);
                sendResponse({ ok: false, error: err.message });
            }
            return;
        }

        // --- Story Management ---
        if (msg?.type === "UPDATE_STORY_LINK") {
            const { old_link, new_link } = msg;
            const db = await loadDB();
            const key = normalizeUrl(old_link);
            if (db.byLink[key]) {
                db.byLink[key].new_link = new_link;
                await saveDB(db);
                chrome.runtime.sendMessage({ type: "DB_UPDATED", storyKey: old_link }).catch(() => { });
            }
            sendResponse({ ok: true });
            return;
        }

        // --- Image Cache ---
        if (msg?.type === "CACHE_IMAGES") {
            (async () => {
                const db = await loadDB();
                const stories = Object.values(db.byLink || {});
                let cached = 0;
                let failed = 0;

                for (const story of stories) {
                    if (!story.img || !story.img.startsWith('http')) continue;

                    try {
                        const cachedData = await imageCache.getImage(story.img);
                        if (cachedData) {
                            cached++;
                            continue;
                        }

                        const base64 = await imageCache.downloadAndCache(story.img);
                        if (base64) {
                            cached++;
                        } else {
                            failed++;
                        }

                        chrome.runtime.sendMessage({
                            type: "CACHE_PROGRESS",
                            cached,
                            failed,
                            total: stories.length
                        }).catch(() => { });

                        await new Promise(r => setTimeout(r, 200));
                    } catch (e) {
                        failed++;
                    }
                }

                sendResponse({ ok: true, cached, failed, total: stories.length });
            })();
            return true;
        }

        if (msg?.type === "GET_CACHED_IMAGE") {
            (async () => {
                const cachedData = await imageCache.getImage(msg.url);
                sendResponse({ data: cachedData });
            })();
            return true;
        }

        if (msg?.type === "DELETE_STORY") {
            (async () => {
                const { old_link } = msg;
                const db = await loadDB();
                const key = normalizeUrl(old_link);

                if (db.byLink[key]) {
                    if (db.byLink[key].img) {
                        try {
                            await imageCache.deleteImage(db.byLink[key].img);
                        } catch (e) {
                            console.error('[DELETE_STORY] Failed to delete image:', e);
                        }
                    }

                    delete db.byLink[key];
                    await saveDB(db);
                    chrome.runtime.sendMessage({ type: "DB_UPDATED" }).catch(() => { });
                }
                sendResponse({ ok: true });
            })();
            return true;
        }

        if (msg?.type === "CLEAR_ALL_IMAGES") {
            (async () => {
                try {
                    if (imageCache.db) {
                        imageCache.db.close();
                        imageCache.db = null;
                    }

                    await new Promise((resolve, reject) => {
                        const request = indexedDB.deleteDatabase(IMG_CACHE_DB);
                        request.onsuccess = () => resolve();
                        request.onerror = () => reject(request.error);
                    });

                    console.log('[CLEAR_ALL_IMAGES] All cached images deleted');
                    sendResponse({ ok: true });
                } catch (e) {
                    console.error('[CLEAR_ALL_IMAGES] Failed:', e);
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        // --- Auto Find Story (SONG SONG) ---
        if (msg?.type === "AUTO_FIND_STORY") {
            const { storyName, old_link, currentChapter } = msg;
            console.log(`[ServiceWorker] Auto Finding (Parallel): ${storyName}`);

            // Tìm kiếm SONG SONG: directSites + searchByName cùng lúc
            const candidates = await findAllCandidates(storyName);

            if (candidates.length > 0) {
                console.log(`[ServiceWorker] Found Candidates:`, candidates);
                const db = await loadDB();
                const key = normalizeUrl(old_link);

                if (db.byLink[key]) {
                    db.byLink[key].candidates = candidates;

                    if (!db.byLink[key].new_link) {
                        const best = candidates.find(c => c.status === 'ok') || candidates.find(c => c.status === 'blocked');
                        if (best) db.byLink[key].new_link = best.url;
                    }

                    await saveDB(db);
                }
                chrome.runtime.sendMessage({
                    type: "DB_UPDATED",
                    storyKey: old_link,
                    storyName,
                    candidates
                }).catch(() => { });
                sendResponse({ found: true, candidates, method: 'parallel' });
                return;
            }

            // Fallback: Google Search (Tab ẩn)
            console.log("[ServiceWorker] Parallel search failed. Fallback Google...");
            let searchQuery = storyName + " đọc truyện";
            if (currentChapter && currentChapter > 0) searchQuery += ` chương ${currentChapter}`;

            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
            const tab = await chrome.tabs.create({ url: searchUrl, active: false });

            const searchContext = {
                tabId: tab.id,
                storyName,
                currentChapter,
                old_link,
                timestamp: Date.now()
            };
            await chrome.storage.session.set({ [`search_${tab.id}`]: searchContext });

            setTimeout(async () => {
                try {
                    const results = await chrome.tabs.sendMessage(tab.id, { type: "GET_SEARCH_RESULTS" });
                    if (results?.links && results.links.length > 0) {
                        const bestLink = results.links[0];
                        const db = await loadDB();
                        const key = normalizeUrl(old_link);
                        if (db.byLink[key]) {
                            db.byLink[key].new_link = bestLink.url;
                            await saveDB(db);
                            chrome.runtime.sendMessage({ type: "DB_UPDATED" }).catch(() => { });
                        }
                        chrome.tabs.remove(tab.id);
                    } else {
                        chrome.tabs.remove(tab.id);
                    }
                } catch (err) {
                    chrome.tabs.remove(tab.id).catch(() => { });
                }
            }, 4000);

            sendResponse({ ok: true, processing: true });
            return;
        }

        sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" });
    })();

    return true; // keep message channel open
});
