// --- TRỢ GIÚP: Lấy thông tin Tab ---
async function getCurrentTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "default";
  }
}

// --- PHẦN 1: TỰ ĐỘNG LƯU & TẢI CẤU HÌNH ---

// 1. Thêm đầy đủ 4 ID vào danh sách theo dõi
const inputs = ['titleSelector', 'contentSelector', 'nextSelector', 'filename'];

// Hàm ánh xạ ID HTML sang Key lưu trữ trong Storage để đảm bảo đồng nhất
function getStorageKey(id) {
  const mapping = {
    'titleSelector': 'titleSel',
    'contentSelector': 'contentSel',
    'nextSelector': 'nextSel',
    'filename': 'fname'
  };
  return mapping[id];
}

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getCurrentTab();
  const domain = getHostname(tab.url);

  chrome.storage.local.get(['configs'], (data) => {
    const configs = data.configs || {};
    const siteConfig = configs[domain] || {};

    // Điền dữ liệu từ Storage vào các ô Input
    inputs.forEach(id => {
      const key = getStorageKey(id);
      if (siteConfig[key]) {
        document.getElementById(id).value = siteConfig[key];
      }
    });

    // Điền trạng thái nút Tự động
    document.getElementById('autoMode').checked = siteConfig.autoMode || false;
  });
});

// 2. Lưu cấu hình ngay khi có bất kỳ thay đổi nào (Change hoặc Input)
[...inputs, 'autoMode'].forEach(id => {
  const element = document.getElementById(id);

  // Lắng nghe sự kiện 'input' để lưu ngay khi đang gõ
  element.addEventListener('input', async () => {
    const tab = await getCurrentTab();
    const domain = getHostname(tab.url);

    chrome.storage.local.get(['configs'], (data) => {
      const configs = data.configs || {};

      // Cập nhật giá trị mới
      configs[domain] = {
        titleSel: document.getElementById('titleSelector').value,
        contentSel: document.getElementById('contentSelector').value,
        nextSel: document.getElementById('nextSelector').value,
        fname: document.getElementById('filename').value,
        autoMode: document.getElementById('autoMode').checked
      };

      chrome.storage.local.set({ configs });
    });
  });
});

// --- PHẦN 2: QUÉT NỘI DUNG VÀ TẢI FILE ---

document.getElementById('scrapeBtn').addEventListener('click', async () => {
  const titleSelector = document.getElementById('titleSelector').value;
  const contentSelector = document.getElementById('contentSelector').value;
  const prefix = document.getElementById('filename').value;

  if (!contentSelector) return;

  let tab = await getCurrentTab();

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (tSel, cSel) => {
      const titleEl = document.querySelector(tSel);
      const titleText = titleEl ? titleEl.innerText.trim() : "Chuong-Khong-Ten";

      const contentEl = document.querySelector(cSel);
      if (!contentEl) return null;

      const pTags = contentEl.querySelectorAll('p');
      let finalContent = "";

      if (pTags.length > 0) {
        finalContent = Array.from(pTags)
          .map(p => p.innerText.trim())
          .filter(t => t.length > 0)
          .join('\n\n');
      } else {
        finalContent = contentEl.innerText.trim();
      }

      return {
        fullText: `${titleText}\n\n${finalContent}`,
        detectedTitle: titleText
      };
    },
    args: [titleSelector, contentSelector]
  }, (results) => {
    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      const chapterNum = getPaddedChapterNumber(data.detectedTitle);
      let finalFileName = prefix
        ? `${slugify(prefix)}_chuong-${chapterNum}`
        : slugify(data.detectedTitle);

      downloadTxt(data.fullText, finalFileName);
    }
  });
});

// --- PHẦN 3: CÁC HÀM BỔ TRỢ ---

function getPaddedChapterNumber(text) {
  const match = text.match(/\d+/);
  if (!match) return "000";
  return match[0].padStart(3, '0');
}

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function downloadTxt(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}