// ============================================
// MODERN DICTIONARY LOOKUP - JAVASCRIPT
// ============================================

const html = document.documentElement;
const searchInput = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('suggestions');
const resultEl = document.getElementById('result');
const historyListEl = document.getElementById('historyList');
const historyContainer = document.getElementById('historyContainer');
const loadingIndicator = document.getElementById('loadingIndicator');
const themeToggle = document.getElementById('themeToggle');

let history = JSON.parse(localStorage.getItem('dict_history') || '[]');
let selectedIndex = -1;
let debounceTimer;
const lucide = window.lucide; // Declare lucide variable

const refreshIcons = () => {
  try { window.lucide?.createIcons?.(); } catch (e) { }
};


// ============================================
// THEME MANAGEMENT
// ============================================

const initTheme = () => {
  const savedTheme = localStorage.getItem('dict_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (savedTheme === null && prefersDark);

  if (isDark) {
    html.classList.add('dark');
  }
};

const toggleTheme = () => {
  const isDark = html.classList.toggle('dark');
  localStorage.setItem('dict_theme', isDark ? 'dark' : 'light');
  updateThemeIcons();
  refreshIcons();
};

const updateThemeIcons = () => {
  const isDark = html.classList.contains('dark');
  document.getElementById('sunIcon').classList.toggle('hidden', !isDark);
  document.getElementById('moonIcon').classList.toggle('hidden', isDark);
};

// Initialize theme
initTheme();
updateThemeIcons();
refreshIcons();
themeToggle.addEventListener('click', toggleTheme);

// ============================================
// HISTORY MANAGEMENT
// ============================================

const updateHistoryUI = () => {
  if (history.length === 0) {
    historyContainer.classList.add('hidden');
    return;
  }

  historyContainer.classList.remove('hidden');
  historyListEl.innerHTML = history
    .map(
      (word) =>
        `<button class="history-tag" data-word="${word}">${word}</button>`
    )
    .join('');

  document.querySelectorAll('.history-tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      searchInput.value = tag.dataset.word;
      lookup(tag.dataset.word);
    });
  });
};

const addToHistory = (word) => {
  history = [word, ...history.filter((w) => w !== word)].slice(0, 8);
  localStorage.setItem('dict_history', JSON.stringify(history));
  updateHistoryUI();
};

document.getElementById('clearHistory').addEventListener('click', () => {
  history = [];
  localStorage.removeItem('dict_history');
  updateHistoryUI();
});

// ============================================
// TEXT-TO-SPEECH
// ============================================

const speak = (text) => {
  try {
    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.95;
    speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('[v0] Speech synthesis error:', err);
  }
};

const API_BASE = "https://dict.minhqnd.com/api/v1";

const fetchJson = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
};

// ============================================
// DICTIONARY API FUNCTIONS
// ============================================

const lookup = async (word) => {
  if (!word.trim()) return;

  suggestionsEl.classList.add('hidden');
  loadingIndicator.classList.remove('hidden');
  selectedIndex = -1;

  try {
    const data = await fetchJson(`${API_BASE}/lookup?word=${encodeURIComponent(word)}`, 8000);
    console.log('[v0] Lookup data:', data);
    if (!data.exists) {
      resultEl.innerHTML = `
        <div class="error-message">
          ⚠️ Từ "<strong>${word}</strong>" không tìm thấy trong từ điển.
        </div>
      `;
      loadingIndicator.classList.add('hidden');
      return;
    }

    // Add to history
    addToHistory(data.word);

    // Render results
    renderResults(data);
    refreshIcons();
  } catch (err) {
    console.error('[v0] Lookup error:', err);
    resultEl.innerHTML = `
      <div class="error-message">
        ⚠️ Lỗi kết nối hệ thống. Vui lòng thử lại sau.
      </div>
    `;
  } finally {
    loadingIndicator.classList.add('hidden');
  }
};

const suggest = async (prefix) => {
  if (!prefix.trim()) {
    suggestionsEl.classList.add('hidden');
    return;
  }

  try {
    const data = await fetchJson(`${API_BASE}/suggest?q=${encodeURIComponent(prefix)}`, 5000);
    if (!data.suggestions || data.suggestions.length === 0) {
      suggestionsEl.classList.add('hidden');
      return;
    }

    selectedIndex = -1;
    renderSuggestions(data.suggestions);
    suggestionsEl.classList.remove('hidden');
  } catch (err) {
    console.error('[v0] Suggest error:', err);
    suggestionsEl.classList.add('hidden');
  }
};

// ============================================
// RENDERING FUNCTIONS
// ============================================

const renderSuggestions = (suggestions) => {
  suggestionsEl.innerHTML = suggestions
    .map(
      (word, idx) =>
        `
    <li class="suggestion-item" data-index="${idx}">
      <span class="suggestion-text">${word}</span>
      <i data-lucide="arrow-up-right" class="suggestion-icon"></i>
    </li>
    `
    )
    .join('');

  refreshIcons();

  document.querySelectorAll('.suggestion-item').forEach((li) => {
    li.addEventListener('click', () => {
      const word = li.querySelector('.suggestion-text').textContent;
      searchInput.value = word;
      lookup(word);
    });
  });
};

const renderResults = (data) => {
  const word = data?.word ?? "";

  // Flatten: results[].meanings[] => 1 list để render
  const items = (data?.results ?? [])
    .flatMap((r) => (r?.meanings ?? []).map((m) => ({
      langName: r?.lang_name || r?.lang_code || "",
      pos: m?.pos || "",
      subPos: m?.sub_pos || "",
      definition: m?.definition || "",
      example: m?.example || "",
      source: m?.source || "",
      defLang: m?.definition_lang || "",
      links: Array.isArray(m?.links) ? m.links : [],
    })))
    .filter((x) => x.definition);

  if (items.length === 0) {
    resultEl.innerHTML = `
      <div class="error-message">
        ⚠️ Không có dữ liệu nghĩa cho "<strong>${word}</strong>".
      </div>
    `;
    return;
  }

  const meaningsHTML = items.map((x) => `
    <div class="meaning-card">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        ${x.langName ? `<span class="meaning-pos">${x.langName}</span>` : ""}
        ${x.pos ? `<span class="meaning-pos">${x.pos}</span>` : ""}
        ${x.subPos ? `<span class="meaning-pos" style="opacity:.75">${x.subPos}</span>` : ""}
        ${x.source ? `<span class="meaning-pos" style="opacity:.65">${x.source}</span>` : ""}
        ${x.defLang ? `<span class="meaning-pos" style="opacity:.65">${x.defLang}</span>` : ""}
      </div>

      <p class="meaning-definition">${x.definition}</p>

      ${x.example ? `<p class="meaning-example">"${x.example}"</p>` : ""}

      ${x.links?.length ? `
        <div class="links" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
          ${x.links.map(t => `<span class="history-tag" style="cursor:default">${t}</span>`).join("")}
        </div>
      ` : ""}
    </div>
  `).join("");

  const safeWord = String(word).replace(/'/g, "\\'");
  resultEl.innerHTML = `
    <div class="word-result">
      <div class="word-header">
        <div class="word-title">
          <h2>${word}</h2>
        </div>
        <button class="speak-btn" onclick="playWordAudio('${safeWord}')">
          <i data-lucide="volume-2" class="icon"></i>
          NGHE
        </button>
      </div>
      <div class="meanings-container">
        ${meaningsHTML}
      </div>
    </div>
  `;

  refreshIcons(); // thay vì lucide.createIcons()
};

// ============================================
// EVENT LISTENERS
// ============================================

searchInput.addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    suggest(e.target.value.trim());
  }, 150);
});

searchInput.addEventListener('keydown', (e) => {
  const items = suggestionsEl.querySelectorAll('.suggestion-item');

  if (suggestionsEl.classList.contains('hidden') || items.length === 0) {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookup(searchInput.value.trim());
    }
    return;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      updateSuggestionSelection(items);
      break;

    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateSuggestionSelection(items);
      break;

    case 'Enter':
      e.preventDefault();
      if (selectedIndex > -1) {
        const word = items[selectedIndex]
          .querySelector('.suggestion-text')
          .textContent.trim();
        searchInput.value = word;
        lookup(word);
      } else {
        lookup(searchInput.value.trim());
      }
      break;

    case 'Escape':
      e.preventDefault();
      suggestionsEl.classList.add('hidden');
      selectedIndex = -1;
      break;
  }
});

const updateSuggestionSelection = (items) => {
  items.forEach((item, i) => {
    item.classList.toggle('active', i === selectedIndex);
    if (i === selectedIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
};

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener('DOMContentLoaded', refreshIcons);

updateHistoryUI();
searchInput.focus();

// Set focus on page load for better UX
window.addEventListener('load', () => {
  searchInput.focus();
});
