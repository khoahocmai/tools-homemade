// background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "downloadFile") {
    // Chuyển nội dung text sang Data URL để API Downloads có thể đọc được
    const blob = new Blob([message.content], { type: message.type });

    // Đọc Blob thành chuỗi base64
    const reader = new FileReader();
    reader.onloadend = function () {
      const dataUrl = reader.result;

      chrome.downloads.download({
        url: dataUrl,
        filename: message.fullPath, // API này cho phép dùng dấu / để tạo folder
        saveAs: false,
        conflictAction: "overwrite"
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("Lỗi tải xuống:", chrome.runtime.lastError.message);
        }
      });
    };
    reader.readAsDataURL(blob);
  }
});