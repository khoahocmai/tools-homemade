console.log("[Story Rescue] Sidepanel script loading...");
const $ = (id) => document.getElementById(id);
const tpl = $("storyTemplate");
const listEl = $("storyList");

const STORE_KEY = "story_rescue_db_v1";

let allStories = []; // Array of objects
let storiesMap = {}; // Map by old_link to object

// --- DATA MANAGEMENT ---

async function loadData() {
    console.log("[SidePanel] Requesting DB from background...");
    const res = await chrome.runtime.sendMessage({ type: "GET_DB" });
    const db = res?.db || { byLink: {} };
    storiesMap = db.byLink || {};
    allStories = Object.values(storiesMap);
    console.log("[SidePanel] DB Loaded. Count:", allStories.length);
    render(allStories);
    updateStats();
}

async function saveData() {
    console.log("[SidePanel] Saving updated data to storage...");
    // Convert storiesMap back to DB structure
    const db = { byLink: storiesMap, updatedAt: Date.now() };
    await chrome.storage.local.set({ ["story_rescue_db_v1"]: db }); // Using same key as service_worker
    console.log("[SidePanel] Storage updated.");
    updateStats();
}

function updateStats() {
    $("totalStories").textContent = `${allStories.length} truyện`;
    const found = allStories.filter(s => s.new_link && s.new_link.startsWith("http")).length;
    $("foundStories").textContent = `${found} đã tìm thấy`;
}

// --- IMPORT / EXPORT ---

$("btnImport").onclick = () => $("fileInput").click();
// $("btnImportEmpty").onclick = () => $("fileInput").click();

$("fileInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
        const text = evt.target.result;
        parseCSV(text);
        e.target.value = ""; // reset
    };
    reader.readAsText(file);
};

function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    let count = 0;

    // Simple CSV parser handling quotes
    const parseLine = (line) => {
        const res = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { inQuote = !inQuote; continue; }
            if (c === ',' && !inQuote) { res.push(cur); cur = ""; continue; }
            cur += c;
        }
        res.push(cur);
        return res;
    }

    for (let i = 1; i < lines.length; i++) { // Skip header
        const line = lines[i].trim();
        if (!line) continue;

        // Format cũ: Name, Link, Cur, Total, Img, New (có thể có hoặc không)
        const cols = parseLine(line);
        if (cols.length < 2) continue;

        const [name, old_link, cur, total, img, new_link] = cols;

        if (!old_link) continue;

        // Merge if exists
        if (!storiesMap[old_link]) {
            storiesMap[old_link] = {
                name: name || "Không Tên",
                old_link,
                cur: parseInt(cur) || 0,
                total: parseInt(total) || 0,
                img: img || "",
                new_link: new_link || ""
            };
            count++;
        } else {
            // Update info if exist
            if (new_link) storiesMap[old_link].new_link = new_link;
        }
    }

    allStories = Object.values(storiesMap);
    saveData();
    render(allStories);
    alert(`Đã nhập thành công ${count} truyện mới!`);
}

$("btnExport").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "EXPORT_CSV" });
};

$("btnClear").onclick = async () => {
    if (confirm("Bạn có chắc muốn xóa toàn bộ dữ liệu không?\n\nBao gồm cả ảnh đã lưu.")) {
        storiesMap = {};
        allStories = [];
        await saveData();

        // Clear all cached images
        try {
            await chrome.runtime.sendMessage({ type: "CLEAR_ALL_IMAGES" });
        } catch (e) {
            console.error("Failed to clear images:", e);
        }

        render([]);
    }
}

// --- RENDER ---

function removeVietnameseTones(str) {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str;
}


function render(rawList) {
    listEl.innerHTML = "";

    // UI DEDUPLICATE: Dùng LINK chuẩn hóa làm khóa chính
    const uniqueMap = new Map();
    (rawList || []).forEach(item => {
        // Dùng old_link làm key (đã được normalize ở backend)
        const key = item.old_link;
        if (!key) return;

        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, { ...item });
        } else {
            // MERGE: Cập nhật thông tin mới nhất
            const existing = uniqueMap.get(key);
            if ((item.cur || 0) > (existing.cur || 0)) existing.cur = item.cur;
            if ((item.total || 0) > (existing.total || 0)) existing.total = item.total;
            if (item.new_link && !existing.new_link) existing.new_link = item.new_link;
            if (item.img && !existing.img) existing.img = item.img;

            // Luôn cập nhật tác giả nếu có
            if (item.author_name) existing.author_name = item.author_name;
            if (item.author_local) existing.author_local = item.author_local;
        }
    });

    const list = Array.from(uniqueMap.values());

    // Sử dụng DocumentFragment để render "trong tối" trước khi đưa ra UI
    const fragment = document.createDocumentFragment();

    // Clear existing content
    listEl.innerHTML = "";

    if (list.length === 0) {
        listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <p>Danh sách trống</p>
        <p class="small-text"> Quét trang https://metruyencv.com/tai-khoan/tu-truyen</p>
            <svg viewBox="0 0 1320 300">
                    <text x="50%" y="50%" dy=".35em" text-anchor="middle" class="webstoryboy" style="font-size: 16rem;">
                        NHTS
                    </text>
                </svg>
         <img src="../Untitled image.ico" style="width: 50px; height: 50px;" class="nhts-icon margin-top: 10px;" alt="NHTS Icon">
      </div>`;
        return;
    }

    // SEARCH THÔNG MINH (Fuzzy)
    const rawQ = $("searchInput").value.trim();
    const qNoTone = removeVietnameseTones(rawQ).toLowerCase();

    const filtered = list.filter(item => {
        if (!rawQ) return true;

        const name = (item.name || "").toLowerCase();
        const nameNoTone = removeVietnameseTones(name).toLowerCase();

        return name.includes(rawQ.toLowerCase()) || nameNoTone.includes(qNoTone);
    });

    filtered.forEach(story => {
        const node = tpl.content.cloneNode(true);
        const card = node.querySelector(".story-card");

        // Add unique identifier for partial updates
        card.setAttribute("data-story-key", story.old_link);

        // Better image handling - Prioritize cached image
        const imgEl = node.querySelector(".story-cover");
        if (story.img) {
            // Try to load cached version first
            chrome.runtime.sendMessage({ type: "GET_CACHED_IMAGE", url: story.img }, (response) => {
                if (response?.data) {
                    imgEl.src = response.data; // Use base64 cached
                } else {
                    imgEl.src = story.img; // Fallback to original URL
                }
            });
        } else {
            imgEl.src = "https://via.placeholder.com/150x225?text=No+Cover";
        }

        imgEl.onerror = () => {
            imgEl.src = "https://via.placeholder.com/150x225?text=Error";
        };

        node.querySelector(".story-title").textContent = story.name;
        node.querySelector(".story-title").title = story.name; // tooltip

        // Author Info
        const authorEl = node.querySelector(".author-info");
        const authorName = story.author_name || "";
        const authorLocal = story.author_local ? `(${story.author_local})` : "";
        if (authorName || authorLocal) {
            authorEl.textContent = `${authorName} ${authorLocal}`.trim();
        } else {
            authorEl.textContent = "Đang cập nhật...";
        }

        node.querySelector(".chapter-info").textContent = `Chương ${story.cur}/${story.total}`;

        const hasLink = story.new_link && story.new_link.startsWith("http");

        const domainSpan = node.querySelector(".domain-info");
        if (hasLink) {
            try {
                domainSpan.textContent = new URL(story.new_link).hostname.replace("www.", "");
            } catch (e) { domainSpan.textContent = "Link lỗi"; }
        } else {
            domainSpan.textContent = "Chưa có nguồn";
            domainSpan.style.color = "#ef4444";
        }

        // Actions
        const btnFind = node.querySelector(".btn-action.find");
        const btnNew = node.querySelector(".btn-action.open-new");
        const manualInputDiv = node.querySelector(".manual-link-input");
        const inputLink = node.querySelector(".input-link");

        if (hasLink) {
            btnNew.href = story.new_link;
            btnNew.classList.remove("hidden");
            btnFind.textContent = "🔎 Tìm Lại";
            node.querySelector(".story-status-badge").style.display = "block";
            node.querySelector(".story-status-badge").textContent = "Xong";
        }

        // Handle Find Click (Smart Auto Find)
        btnFind.onclick = async () => {
            const originalText = btnFind.textContent;
            btnFind.textContent = "⏳...";
            btnFind.disabled = true;

            try {
                const res = await chrome.runtime.sendMessage({
                    type: "AUTO_FIND_STORY",
                    storyName: story.name,
                    currentChapter: story.cur,
                    old_link: story.old_link
                });

                if (res && res.found) {
                    btnFind.textContent = "✅ Có";
                    // UI sẽ tự reload khi nhận message DB_UPDATED
                } else if (res && res.processing) {
                    btnFind.textContent = "🔎 GG...";
                    // Đang chạy fallback Google, reset nút sau 5s
                    setTimeout(() => {
                        btnFind.textContent = originalText;
                        btnFind.disabled = false;
                    }, 5000);
                } else {
                    btnFind.textContent = "❌...";
                    setTimeout(() => {
                        btnFind.textContent = originalText;
                        btnFind.disabled = false;
                    }, 2000);
                }
            } catch (err) {
                console.error(err);
                btnFind.textContent = "Lỗi";
                btnFind.disabled = false;
            }
        };

        // Right click to show manual input
        card.oncontextmenu = (e) => {
            e.preventDefault();
            manualInputDiv.classList.toggle("hidden");
        };

        inputLink.value = story.new_link || "";
        inputLink.onchange = () => {
            story.new_link = inputLink.value.trim();
            saveData();
            render(allStories);
        };

        // Delete button handler
        const btnDelete = node.querySelector(".delete-story");
        btnDelete.onclick = async () => {
            if (!confirm(`Xóa truyện "${story.name}"?\n\nHành động này không thể hoàn tác.`)) {
                return;
            }

            try {
                await chrome.runtime.sendMessage({
                    type: "DELETE_STORY",
                    old_link: story.old_link
                });
                loadData(); // Reload to reflect changes
            } catch (err) {
                console.error("Delete failed:", err);
                alert("Xóa thất bại!");
            }
        };

        const foundDiv = node.querySelector(".found-links");
        if (story.candidates && story.candidates.length > 0) {
            foundDiv.classList.remove("hidden");
            foundDiv.innerHTML = "";
            story.candidates.forEach(cand => {
                const btn = document.createElement("button");
                btn.className = "candidate-chip " + (cand.status === 'blocked' ? 'blocked' : 'ok');
                const siteName = cand.site.length > 15 ? cand.site.substring(0, 12) + "..." : cand.site;
                btn.textContent = siteName;
                if (cand.status === 'blocked') btn.textContent += " ⚠️";
                btn.title = cand.url;

                btn.onclick = async () => {
                    chrome.tabs.create({ url: cand.url, active: true });
                    await chrome.runtime.sendMessage({
                        type: "UPDATE_STORY_LINK",
                        old_link: story.old_link,
                        new_link: cand.url
                    });
                    // DB_UPDATED message sẽ tự trigger reload (debounced)
                };
                foundDiv.appendChild(btn);
            });
        }

        fragment.appendChild(node);
    });

    listEl.innerHTML = "";
    listEl.appendChild(fragment);
}

// React-like partial update: Chỉ update 1 thẻ truyện
function updateSingleStory(storyKey) {
    const story = allStories.find(s => s.old_link === storyKey);
    if (!story) return;

    const existingCard = document.querySelector(`[data-story-key="${CSS.escape(storyKey)}"]`);
    if (!existingCard) return; // Card không có trong DOM (có thể bị filter)

    const tpl = $("storyTemplate");
    const newNode = tpl.content.cloneNode(true);
    const newCard = newNode.querySelector(".story-card");

    // Re-apply all data (copy logic from render)
    newCard.setAttribute("data-story-key", story.old_link);

    const imgEl = newNode.querySelector(".story-cover");
    if (story.img) {
        chrome.runtime.sendMessage({ type: "GET_CACHED_IMAGE", url: story.img }, (response) => {
            if (response?.data) {
                imgEl.src = response.data;
            } else {
                imgEl.src = story.img;
            }
        });
    } else {
        imgEl.src = "https://via.placeholder.com/150x225?text=No+Cover";
    }
    imgEl.onerror = () => { imgEl.src = "https://via.placeholder.com/150x225?text=Error"; };

    newNode.querySelector(".story-title").textContent = story.name;
    newNode.querySelector(".story-title").title = story.name;

    const authorEl = newNode.querySelector(".author-info");
    if (story.author_local || story.author || story.tacGia) {
        authorEl.textContent = "👤 " + (story.author_local || story.author || story.tacGia);
    }

    const chapterEl = newNode.querySelector(".chapter-info");
    chapterEl.textContent = story.total ? `Chương ${story.cur || 0}/${story.total}` : `Chương ${story.cur || 0}`;

    const domainEl = newNode.querySelector(".domain-info");
    if (story.new_link && story.new_link.startsWith("http")) {
        try {
            domainEl.textContent = new URL(story.new_link).hostname.replace("www.", "");
        } catch (e) { }
    }

    // Buttons
    const btnFind = newNode.querySelector(".find");
    const btnNew = newNode.querySelector(".open-new");
    const inputLink = newNode.querySelector(".input-link");

    if (story.new_link && story.new_link.startsWith("http")) {
        btnNew.href = story.new_link;
        btnNew.classList.remove("hidden");
        btnFind.textContent = "🔎 Tìm Lại";
    }

    // Bind event handler for Find button
    btnFind.onclick = async () => {
        const originalText = btnFind.textContent;
        btnFind.textContent = "⏳...";
        btnFind.disabled = true;

        try {
            const res = await chrome.runtime.sendMessage({
                type: "AUTO_FIND_STORY",
                storyName: story.name,
                currentChapter: story.cur,
                old_link: story.old_link
            });

            if (res && res.found) {
                btnFind.textContent = "✅ Có";
            } else if (res && res.processing) {
                btnFind.textContent = "🔎 GG...";
                setTimeout(() => {
                    btnFind.textContent = originalText;
                    btnFind.disabled = false;
                }, 5000);
            } else {
                btnFind.textContent = "❌...";
                setTimeout(() => {
                    btnFind.textContent = originalText;
                    btnFind.disabled = false;
                }, 2000);
            }
        } catch (err) {
            console.error(err);
            btnFind.textContent = "Lỗi";
            btnFind.disabled = false;
        }
    };

    // Candidates
    const foundDiv = newNode.querySelector(".found-links");
    if (story.candidates && story.candidates.length > 0) {
        foundDiv.classList.remove("hidden");
        foundDiv.innerHTML = "";
        story.candidates.forEach(cand => {
            const btn = document.createElement("button");
            btn.className = "candidate-chip " + (cand.status === 'blocked' ? 'blocked' : 'ok');
            const siteName = cand.site.length > 15 ? cand.site.substring(0, 12) + "..." : cand.site;
            btn.textContent = siteName;
            if (cand.status === 'blocked') btn.textContent += " ⚠️";
            btn.title = cand.url;

            btn.onclick = async () => {
                chrome.tabs.create({ url: cand.url, active: true });
                await chrome.runtime.sendMessage({
                    type: "UPDATE_STORY_LINK",
                    old_link: story.old_link,
                    new_link: cand.url
                });
            };
            foundDiv.appendChild(btn);
        });
    }

    // Replace old card with new one
    existingCard.replaceWith(newCard);
}

$("searchInput").addEventListener("input", () => render(allStories));

// --- CONNECT TO BACKGROUND / CONTENT SCRIPTS ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "DB_UPDATED") {
        // Nếu có storyKey cụ thể -> Partial update ngay lập tức
        if (msg.storyKey) {
            // Reload data từ storage để đảm bảo sync
            chrome.storage.local.get([STORE_KEY], (data) => {
                if (!data[STORE_KEY]) return;

                const db = data[STORE_KEY];
                const updatedStory = db.byLink[msg.storyKey];

                if (updatedStory) {
                    // Update local array
                    const idx = allStories.findIndex(s => s.old_link === msg.storyKey);
                    if (idx !== -1) {
                        allStories[idx] = updatedStory;
                        // Partial DOM update - Cực nhanh!
                        updateSingleStory(msg.storyKey);
                    }
                }
            });
            return; // Exit sớm, không debounce
        }

        // Nếu không có storyKey -> Bulk update, dùng debounce
        if (isHoveringList) {
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = true;
            return;
        }

        if (updateTimer && typeof updateTimer !== 'boolean') clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
            loadData();
            updateTimer = null;
        }, 2000);
    }

    if (msg.type === "SCAN_STATUS_UPDATE") {
        $("scanProgress").classList.remove("hidden");
        $("scanStatusText").textContent = msg.status;
        $("scanCountText").textContent = `${msg.count} truyện`;
        $("scanTabText").textContent = `Tab: ${msg.tabName}`;
        if (msg.progress) {
            $("scanProgressBar").style.width = `${msg.progress}%`;
        }
    }

    if (msg.type === "SCAN_DONE") {
        setTimeout(() => {
            $("scanProgress").classList.add("hidden");
            loadData();
        }, 2000);
    }
});

$("btnScan").onclick = async () => {
    console.log("[SidePanel] Starting scan...");
    $("scanProgress").classList.remove("hidden");
    $("scanStatusText").textContent = "Đang khởi tạo...";
    $("scanProgressBar").style.width = "5%";
    await chrome.runtime.sendMessage({ type: "START_SCAN_ACTIVE_TAB" });
};

$("btnCacheImages").onclick = async () => {
    if (!confirm(`Download và lưu tất cả ảnh bìa truyện?\n\nQuá trình này có thể mất vài phút.`)) {
        return;
    }

    const btn = $("btnCacheImages");
    const originalText = btn.textContent;
    btn.textContent = "⏳ 0/0";
    btn.disabled = true;

    // Listen for progress
    const progressListener = (msg) => {
        if (msg.type === "CACHE_PROGRESS") {
            btn.textContent = `⏳ ${msg.cached}/${msg.total}`;
        }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    try {
        const res = await chrome.runtime.sendMessage({ type: "CACHE_IMAGES" });
        chrome.runtime.onMessage.removeListener(progressListener);

        btn.textContent = "✅ Xong";
        alert(`Hoàn tất!\n\n✅ Cached: ${res.cached}\n❌ Failed: ${res.failed}\n📦 Total: ${res.total}`);

        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 3000);
    } catch (err) {
        chrome.runtime.onMessage.removeListener(progressListener);
        console.error(err);
        btn.textContent = "❌ Lỗi";
        btn.disabled = false;
    }
};

$("btnStopScanSide").onclick = async () => {
    // Gửi lệnh dừng tới tab đang quét
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: "STOP_SCAN_CMD" }).catch(() => { });
    }
    $("scanStatusText").textContent = "Đang dừng...";
    setTimeout(() => $("scanProgress").classList.add("hidden"), 1000);
};
$("btnAutoFindAll").onclick = async () => {
    console.log("[SidePanel] Auto finding all stories...");
    const notFound = allStories.filter(s => !s.new_link || !s.new_link.startsWith("http"));

    if (notFound.length === 0) {
        alert("Tất cả truyện đã có link mới rồi!");
        return;
    }

    if (!confirm(`Tìm tự động cho ${notFound.length} truyện chưa có link mới?\n\nQuá trình này sẽ mở nhiều tab tìm kiếm.`)) {
        return;
    }

    let processed = 0;
    for (const story of notFound) {
        console.log(`[SidePanel] Auto finding ${processed + 1}/${notFound.length}:`, story.name);

        try {
            await chrome.runtime.sendMessage({
                type: "AUTO_FIND_STORY",
                storyName: story.name,
                currentChapter: story.cur,
                old_link: story.old_link
            });

            // Đợi 4 giây giữa mỗi tìm kiếm để tránh spam
            await new Promise(r => setTimeout(r, 4000));
            processed++;

            // Cập nhật stats
            $("foundStories").textContent = `Đang tìm... ${processed}/${notFound.length}`;
        } catch (err) {
            console.error("[SidePanel] Auto find error:", err);
        }
    }

    alert(`Hoàn tất! Đã tìm cho ${processed} truyện.`);
    loadData(); // Reload để cập nhật UI
};

// Initial load
loadData();

// Debounce & Hover Protection
let isHoveringList = false;
let updateTimer = null;

$("storyList").onmouseenter = () => { isHoveringList = true; };
$("storyList").onmouseleave = () => {
    isHoveringList = false;
    // Nếu có update đang chờ (khi updateTimer là true), thực hiện ngay
    if (updateTimer === true) {
        updateTimer = null;
        loadData();
    }
};



