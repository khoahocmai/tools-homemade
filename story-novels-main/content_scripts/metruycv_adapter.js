const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function safeText(s) { return (s || "").replace(/\s+/g, " ").trim(); }

function extractProgress(text) {
    const m = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return { cur: 0, total: 0 };
    return { cur: parseInt(m[1], 10) || 0, total: parseInt(m[2], 10) || 0 };
}

function detectMetruycvShelf() {
    // Heuristic: có các span data-x-text item.book.name
    return !!document.querySelector('span[data-x-text="item.book.name"]');
}

function scanMetruycvPage() {
    console.log("[MetruycvAdapter] Scanning current page...");
    const nodes = document.querySelectorAll('span[data-x-text="item.book.name"]');
    const items = [];

    nodes.forEach(span => {
        try {
            const a = span.closest('a');
            if (!a || !a.href) return;

            const name = safeText(span.textContent);
            const old_link = a.href;

            const imgEl = a.querySelector('img');
            const img = imgEl ? (imgEl.src || imgEl.getAttribute('src') || "") : "";

            const row = a.closest('div.table-row') || a.parentElement;
            const fullText = safeText(row ? row.innerText : a.innerText);

            let { cur, total } = extractProgress(fullText);

            if (!cur && /chuong-(\d+)/.test(old_link)) {
                const m = old_link.match(/chuong-(\d+)/);
                if (m) cur = parseInt(m[1], 10) || 0;
            }

            items.push({
                name,
                old_link,
                cur,
                total,
                img,
                new_link: ""
            });
        } catch { }
    });

    console.log("[MetruycvAdapter] Found", items.length, "items on this page");
    return items;
}

function getNextButtonMetruycv() {
    const btn = document.querySelector('button[data-x-bind="NextPage"]');
    if (!btn) return null;
    const disabled = btn.hasAttribute('disabled') || btn.classList.contains('disabled');
    return disabled ? null : btn;
}

function getTabButtons() {
    return {
        reading: document.querySelector('#tab-button-reading'),
        bookmarks: document.querySelector('#tab-button-bookmarks')
    };
}

function isTabActive(tabButton) {
    return tabButton && (tabButton.classList.contains('bg-primary') || tabButton.classList.contains('text-white'));
}

// Nhận lệnh từ sidepanel/background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "PING_ADAPTER") {
        sendResponse({ ok: true, adapter: detectMetruycvShelf() ? "metruycv" : "none" });
        return true;
    }
});

async function runAutoScan({ maxPages = 999, delayMs = 900, scanBothTabs = true } = {}) {
    console.log("[MetruycvAdapter] Starting auto scan. ScanBothTabs:", scanBothTabs);
    let isRunning = true;

    const tabs = getTabButtons();
    const tabsToScan = [];

    if (scanBothTabs && tabs.reading && tabs.bookmarks) {
        tabsToScan.push({ name: 'reading', button: tabs.reading });
        tabsToScan.push({ name: 'bookmarks', button: tabs.bookmarks });
        console.log("[MetruycvAdapter] Will scan both tabs: Reading + Bookmarks");
    } else {
        console.log("[MetruycvAdapter] Will scan current tab only");
        tabsToScan.push({ name: 'current', button: null });
    }

    for (const tab of tabsToScan) {
        if (tab.button && !isTabActive(tab.button)) {
            console.log("[MetruycvAdapter] Switching to tab:", tab.name);
            tab.button.click();
            await sleep(1500); // Đợi tab load
        }

        let page = 0;
        while (page < maxPages && isRunning) {
            if (!detectMetruycvShelf()) {
                console.log("[MetruycvAdapter] No longer on shelf page, stopping");
                break;
            }

            // Quét page hiện tại
            const items = scanMetruycvPage();
            chrome.runtime.sendMessage({ type: "SCAN_RESULT", items });

            // Next
            const nextBtn = getNextButtonMetruycv();
            if (!nextBtn) {
                console.log("[MetruycvAdapter] No more pages in tab:", tab.name);
                break;
            }

            nextBtn.scrollIntoView({ block: "center" });
            await sleep(200);
            nextBtn.click();

            // chờ render
            await sleep(delayMs);
            page++;
        }
    }

    console.log("[MetruycvAdapter] Scan completed");
    chrome.runtime.sendMessage({ type: "SCAN_DONE" });
}

// Lắng nghe lệnh start/stop theo tab
let isRunning = false;
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "START_SCAN") {
        console.log("[MetruycvAdapter] Received START_SCAN command");
        if (isRunning) {
            console.log("[MetruycvAdapter] Already running, ignoring");
            return;
        }
        isRunning = true;
        runAutoScan(msg?.options).finally(() => {
            isRunning = false;
            console.log("[MetruycvAdapter] Scan finished");
        });
    }
    if (msg?.type === "STOP_SCAN") {
        console.log("[MetruycvAdapter] Received STOP_SCAN command");
        isRunning = false;
    }
    if (msg?.type === "TEST_CLICK_MODE") {
        console.log("[MetruycvAdapter] Received TEST_CLICK_MODE");
        runTestClickModeInPage();
    }
});

console.log("[MetruycvAdapter] Content script loaded");

async function runTestClickModeInPage() {
    console.log("[Adapter] TEST CLICK MODE INIT");
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
        box.innerHTML = `<div>${text}</div><div style="margin-top:8px;font-size:12px;cursor:pointer;border:1px solid white;padding:2px;text-align:center;">(Bấm để DỪNG)</div>`;
        box.onclick = () => { isTestRunning = false; box.remove(); };
    };

    let isTestRunning = true;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    let count = 0;
    log("🚀 Test Click (Content Script): Auto Next 3s");

    while (isTestRunning) {
        count++;

        let btn = document.querySelector('button[data-x-bind="NextPage"]');
        if (!btn || btn.disabled) btn = document.querySelector('button[aria-label="Next"]');

        if (!btn || btn.disabled) {
            const svgs = document.querySelectorAll('path[d="M9 6l6 6l-6 6"]');
            for (let p of svgs) {
                const b = p.closest('button');
                if (b && !b.disabled && b.offsetParent !== null) {
                    btn = b;
                    break;
                }
            }
        }

        if (btn) {
            log(`[#${count}] CLICK Next!`);
            btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
            btn.style.border = "4px solid red";
            await sleep(300);

            try {
                btn.click();
            } catch (e) { log("Err: " + e.message); }

            await sleep(500);
            btn.style.border = "";
            await sleep(2500);
        } else {
            log(`[#${count}] Không thấy nút Next. Đợi...`);
            await sleep(2000);
        }
    }
}
