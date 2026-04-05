// --- PHẦN 1: GHI NHỚ DỮ LIỆU ---

// Khi mở popup, lấy dữ liệu đã lưu ra điền vào các ô input
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['titleSel', 'contentSel', 'fname'], (data) => {
    if (data.titleSel) document.getElementById('titleSelector').value = data.titleSel;
    if (data.contentSel) document.getElementById('contentSelector').value = data.contentSel;
    if (data.fname) document.getElementById('filename').value = data.fname;
  });
});

// Mỗi khi người dùng gõ chữ, tự động lưu lại ngay lập tức
const inputs = ['titleSelector', 'contentSelector', 'filename'];
inputs.forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    chrome.storage.local.set({
      titleSel: document.getElementById('titleSelector').value,
      contentSel: document.getElementById('contentSelector').value,
      fname: document.getElementById('filename').value
    });
  });
});


// --- PHẦN 2: QUÉT VÀ TẢI FILE ---

document.getElementById('scrapeBtn').addEventListener('click', async () => {
  const titleSelector = document.getElementById('titleSelector').value;
  const contentSelector = document.getElementById('contentSelector').value;
  const filename = document.getElementById('filename').value || 'truyen';

  if (!contentSelector) {
    alert("Bạn chưa nhập thẻ nội dung!");
    return;
  }

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (tSel, cSel) => {
      // 1. Lấy tiêu đề
      const titleEl = document.querySelector(tSel);
      const titleText = titleEl ? titleEl.innerText.trim() : "Không có tiêu đề";

      // 2. Lấy toàn bộ nội dung (các thẻ p)
      const contentEls = document.querySelectorAll(cSel);
      const contentLines = Array.from(contentEls)
        .map(el => el.innerText.trim())
        .filter(text => text.length > 0);

      // 3. Ghép lại: Tiêu đề ở đầu, rồi đến nội dung
      return `${titleText}\n\n${contentLines.join('\n\n')}`;
    },
    args: [titleSelector, contentSelector]
  }, (results) => {
    if (results && results[0].result) {
      downloadTxt(results[0].result, filename);
    } else {
      alert("Không tìm thấy gì! Hãy kiểm tra lại thẻ.");
    }
  });
});

function downloadTxt(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.txt`;
  a.click();
}