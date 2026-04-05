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

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getCurrentTab();
  const domain = getHostname(tab.url);

  chrome.storage.local.get(['configs'], (data) => {
    const configs = data.configs || {};
    const siteConfig = configs[domain] || {};

    // Điền dữ liệu cũ vào các ô input
    if (siteConfig.titleSel) document.getElementById('titleSelector').value = siteConfig.titleSel;
    if (siteConfig.contentSel) document.getElementById('contentSelector').value = siteConfig.contentSel;
    if (siteConfig.fname) document.getElementById('filename').value = siteConfig.fname;

    // TỰ ĐỘNG QUÉT: Nếu đã có đủ Selector, tự kích hoạt nút Quét ngay lập tức
    if (siteConfig.titleSel && siteConfig.contentSel) {
      // Đợi một chút (300ms) để UI ổn định rồi tự bấm nút
      setTimeout(() => {
        document.getElementById('scrapeBtn').click();
      }, 300);
    }
  });
});

// Lưu cấu hình ngay khi người dùng gõ phím (để lần sau mở lại là có luôn)
const inputs = ['titleSelector', 'contentSelector', 'filename'];
inputs.forEach(id => {
  document.getElementById(id).addEventListener('input', async () => {
    const tab = await getCurrentTab();
    const domain = getHostname(tab.url);

    chrome.storage.local.get(['configs'], (data) => {
      const configs = data.configs || {};
      configs[domain] = {
        titleSel: document.getElementById('titleSelector').value,
        contentSel: document.getElementById('contentSelector').value,
        fname: document.getElementById('filename').value
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

  if (!contentSelector) {
    // Nếu chưa có selector thì không làm gì (để người dùng tự nhập)
    return;
  }

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
      let finalFileName = "";

      if (prefix) {
        finalFileName = `${slugify(prefix)}_chuong-${chapterNum}`;
      } else {
        finalFileName = slugify(data.detectedTitle);
      }

      downloadTxt(data.fullText, finalFileName);
    }
  });
});

// --- PHẦN 3: CÁC HÀM BỔ TRỢ ---

function getPaddedChapterNumber(text) {
  const match = text.match(/\d+/);
  if (!match) return "000";
  let num = match[0];
  return num.padStart(3, '0');
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