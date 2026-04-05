// content.js

function autoProcess() {
  const domain = window.location.hostname;

  chrome.storage.local.get(['configs'], (data) => {
    const configs = data.configs || {};
    const cfg = configs[domain];

    // Chỉ chạy khi có cấu hình và đang bật chế độ Tự động
    if (!cfg || !cfg.autoMode) return;

    // --- BƯỚC 1: KIỂM TRA TRANG LỖI (NHƯ TRONG ẢNH) ---
    // Kiểm tra xem nội dung trang có chứa thông báo lỗi đặc trưng không
    const errorText = "An error occurred while processing your request";
    if (document.body.innerText.includes(errorText)) {
      console.log("Phát hiện lỗi Server! Sẽ tải lại trang sau 10 giây...");
      setTimeout(() => {
        location.reload();
      }, 10000); // Đợi 10 giây (10000ms)
      return; // Kết thúc hàm ở đây, không làm các bước dưới
    }

    // --- BƯỚC 2: QUÉT NỘI DUNG ---
    const titleEl = document.querySelector(cfg.titleSel);
    const contentEl = document.querySelector(cfg.contentSel);
    const nextBtn = cfg.nextSel ? document.querySelector(cfg.nextSel) : null;

    // Nếu không có Tiêu đề hoặc Nội dung (có thể do lỗi load trang khác hoặc sai Selector)
    if (!titleEl || !contentEl) {
      console.log("Không tìm thấy nội dung truyện. Kiểm tra lại Selector.");

      // Nếu không có nội dung mà CŨNG KHÔNG CÓ nút "Chương sau" -> Nghĩa là hết truyện thực sự
      if (!nextBtn) {
        console.log("Đã hết chương. Kết thúc quá trình.");
        return;
      }

      // Nếu không có nội dung nhưng VẪN CÓ nút "Chương sau" -> Có thể trang bị lỗi trắng, thử load lại sau 5s
      setTimeout(() => { location.reload(); }, 5000);
      return;
    }

    // --- BƯỚC 3: TẢI FILE (LOGIC CŨ CỦA BẠN) ---
    console.log("Crawl Pro: Đang xử lý chương...");
    const titleText = titleEl.innerText.trim();
    const pTags = contentEl.querySelectorAll('p');
    const finalContent = pTags.length > 0
      ? Array.from(pTags).map(p => p.innerText.trim()).filter(t => t).join('\n\n')
      : contentEl.innerText.trim();

    const chapterNum = (titleText.match(/\d+/) || ["000"])[0].padStart(3, '0');
    const fileName = cfg.fname
      ? `${cfg.fname.toLowerCase().replace(/\s+/g, '-')}_chuong-${chapterNum}`
      : `chuong-${chapterNum}`;

    const blob = new Blob([`${titleText}\n\n${finalContent}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    // --- BƯỚC 4: TỰ ĐỘNG CHUYỂN CHƯƠNG HOẶC KẾT THÚC ---
    if (nextBtn) {
      console.log("Crawl Pro: Sẽ chuyển sang chương tiếp theo sau 2 giây...");
      setTimeout(() => {
        nextBtn.click();
      }, 2000);
    } else {
      console.log("Đã đến chương cuối cùng. Hoàn thành tải truyện!");
    }
  });
}

// Chạy khi trang đã sẵn sàng
if (document.readyState === 'complete') {
  autoProcess();
} else {
  window.addEventListener('load', autoProcess);
}