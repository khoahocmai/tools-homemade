// content.js

function autoProcess() {
  const domain = window.location.hostname;

  chrome.storage.local.get(['configs'], (data) => {
    const configs = data.configs || {};
    const cfg = configs[domain];

    if (!cfg || !cfg.autoMode) return;

    // --- BƯỚC 1: KIỂM TRA TRANG LỖI ---
    const errorText = "An error occurred while processing your request";
    if (document.body.innerText.includes(errorText)) {
      console.log("Phát hiện lỗi Server! Thử lại sau 10s...");
      setTimeout(() => location.reload(), 10000);
      return;
    }

    // --- BƯỚC 2: QUÉT NỘI DUNG ---
    const titleEl = document.querySelector(cfg.titleSel);
    const contentEl = document.querySelector(cfg.contentSel);
    const nextBtn = cfg.nextSel ? document.querySelector(cfg.nextSel) : null;

    if (!titleEl || !contentEl) {
      if (!nextBtn) return console.log("Hết chương hoặc không tìm thấy nội dung.");
      setTimeout(() => location.reload(), 5000);
      return;
    }

    const titleText = titleEl.innerText.trim();
    const pTags = contentEl.querySelectorAll('p');
    const finalContent = pTags.length > 0
      ? Array.from(pTags).map(p => p.innerText.trim()).filter(t => t).join('\n\n')
      : contentEl.innerText.trim();

    // --- BƯỚC 3: TÍNH TOÁN BATCH & FOLDER ---
    // Tìm số chương từ tiêu đề (ví dụ: "Chương 150" -> 150)
    const chapterMatch = titleText.match(/\d+/);
    const chapterId = chapterMatch ? parseInt(chapterMatch[0]) : 0;

    if (chapterId === 0) return console.log("Không xác định được số chương.");

    /**
     * Công thức tính số Batch:
     * Mỗi batch chứa 100 chương.
     * $$BatchIndex = \lfloor \frac{chapterId - 1}{100} \rfloor + 1$$
     */
    const batchIndex = Math.floor((chapterId - 1) / 100) + 1;
    const batchFolderName = `batch-${String(batchIndex).padStart(3, '0')}`;

    // Tên folder truyện (lấy từ Prefix hoặc slug tiêu đề)
    const storyFolder = cfg.fname ? slugify(cfg.fname) : "my-story";

    // --- BƯỚC 4: TỰ ĐỘNG TẠO BATCH.JSON ---
    // Kiểm tra nếu đây là chương đầu tiên của một batch (ví dụ: 1, 101, 201...)
    const isStartOfBatch = (chapterId - 1) % 100 === 0;

    if (isStartOfBatch) {
      const batchData = {
        "batch": batchIndex,
        "folder": batchFolderName,
        "from": (batchIndex - 1) * 100 + 1,
        "to": batchIndex * 100,
        "count": 100,
        "chapters": []
      };

      const batchJsonPath = `${storyFolder}/${batchFolderName}/batch.json`;
      downloadFile(JSON.stringify(batchData, null, 2), batchJsonPath, 'application/json');
    }

    // --- BƯỚC 5: TẢI CHƯƠNG ---
    const prefixSlug = cfg.fname ? slugify(cfg.fname) : "story";
    const chapterNumPadded = String(chapterId).padStart(3, '0');

    // Tên file theo format: StoryFolder/batch-XXX/prefix_chuong-XXX.txt
    const chapterFileName = `${storyFolder}/${batchFolderName}/${prefixSlug}_chuong-${chapterNumPadded}.txt`;

    downloadFile(`${titleText}\n\n${finalContent}`, chapterFileName, 'text/plain');

    // --- BƯỚC 6: CHUYỂN CHƯƠNG ---
    if (nextBtn) {
      console.log(`Đã tải xong chương ${chapterId} vào ${batchFolderName}. Chuyển chương sau 2s...`);
      setTimeout(() => nextBtn.click(), 2000);
    } else {
      console.log("Hoàn thành bộ truyện.");
    }
  });
}

// Hàm hỗ trợ tải file với đường dẫn folder giả lập
function downloadFile(content, fullPath, type) {
  // Gửi tin nhắn sang background.js để thực hiện tải file có folder
  chrome.runtime.sendMessage({
    action: "downloadFile",
    content: content,
    fullPath: fullPath,
    type: type
  });
}

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

if (document.readyState === 'complete') autoProcess();
else window.addEventListener('load', autoProcess);