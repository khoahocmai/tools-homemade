// --- TRỢ GIÚP: Lấy domain hiện tại ---
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

// --- PHẦN 1: QUẢN LÝ DỮ LIỆU THEO DOMAIN ---

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getCurrentTab();
  const domain = getHostname(tab.url);

  // Lấy dữ liệu của domain cụ thể này
  chrome.storage.local.get(['configs'], (data) => {
    const configs = data.configs || {};
    const siteConfig = configs[domain] || {};

    if (siteConfig.titleSel) document.getElementById('titleSelector').value = siteConfig.titleSel;
    if (siteConfig.contentSel) document.getElementById('contentSelector').value = siteConfig.contentSel;

    // Tự động gợi ý tên file theo tiêu đề nếu chưa nhập
    if (siteConfig.fname) {
      document.getElementById('filename').value = siteConfig.fname;
    } else {
      document.getElementById('filename').placeholder = "Tự động lấy tiêu đề làm tên file";
    }

    // Nếu đã có đủ cấu hình, bạn có thể gọi hàm click() để nó tự quét luôn (tùy chọn)
    // if (siteConfig.titleSel && siteConfig.contentSel) {
    //   document.getElementById('scrapeBtn').click();
    // }
  });
});

// Lưu dữ liệu mỗi khi nhập
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


// --- PHẦN 2: QUÉT VÀ TẢI FILE ---

document.getElementById('scrapeBtn').addEventListener('click', async () => {
  const titleSelector = document.getElementById('titleSelector').value;
  const contentSelector = document.getElementById('contentSelector').value;
  let filenameInput = document.getElementById('filename').value;

  if (!contentSelector) {
    alert("Bạn chưa nhập thẻ nội dung!");
    return;
  }

  let tab = await getCurrentTab();

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (tSel, cSel) => {
      const titleEl = document.querySelector(tSel);
      const titleText = titleEl ? titleEl.innerText.trim() : "Chương-Khong-Ten";

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
    if (results && results[0].result) {
      const data = results[0].result;

      // Nếu không nhập tên file, dùng tiêu đề đã quét được, bỏ dấu tiếng Việt/khoảng cách
      let finalFileName = filenameInput || data.detectedTitle;
      finalFileName = slugify(finalFileName);

      downloadTxt(data.fullText, finalFileName);
    } else {
      alert("Không tìm thấy nội dung! Hãy kiểm tra lại Selector.");
    }
  });
});

// Hàm dọn dẹp tên file (bỏ dấu tiếng Việt, ký tự đặc biệt)
function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Bỏ dấu
    .replace(/[^\w\s-]/g, '') // Bỏ ký tự đặc biệt
    .replace(/[\s_-]+/g, '-') // Thay khoảng trắng bằng -
    .replace(/^-+|-+$/g, ''); // Cắt gạch ngang thừa
}

function downloadTxt(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.txt`;
  a.click();
}