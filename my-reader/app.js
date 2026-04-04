const STORAGE_KEYS = {
  theme: 'story_reader_theme',
  fontSize: 'story_reader_font_size',
  lastStoryId: 'story_reader_last_story_id',
  lastChapterId: 'story_reader_last_chapter_id',
  scrollPrefix: 'story_reader_scroll_',
  sidebarCollapsed: 'story_reader_sidebar_collapsed'
};

const state = {
  stories: [],
  filteredStories: [],
  selectedStory: null,
  selectedMeta: null,
  currentChapterId: null,
  currentChapterIndex: -1,
  fontSize: Number(localStorage.getItem(STORAGE_KEYS.fontSize) || 20),
  sidebarCollapsed: localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === 'true',
  descriptionExpanded: false,
};

const el = {
  body: document.body,
  storySearch: document.getElementById('storySearch'),
  storyList: document.getElementById('storyList'),
  libraryGrid: document.getElementById('libraryGrid'),
  libraryView: document.getElementById('libraryView'),
  detailView: document.getElementById('detailView'),
  readerView: document.getElementById('readerView'),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  detailTitle: document.getElementById('detailTitle'),
  detailMeta: document.getElementById('detailMeta'),
  detailDescription: document.getElementById('detailDescription'),
  chapterList: document.getElementById('chapterList'),
  chapterCount: document.getElementById('chapterCount'),
  continueReadingBtn: document.getElementById('continueReadingBtn'),
  readerStoryTitle: document.getElementById('readerStoryTitle'),
  readerChapterTitle: document.getElementById('readerChapterTitle'),
  readerContent: document.getElementById('readerContent'),

  prevChapterBtn: document.getElementById('prevChapterBtn'),
  nextChapterBtn: document.getElementById('nextChapterBtn'),
  openChapterListBtn: document.getElementById('openChapterListBtn'),
  bottomPrevChapterBtn: document.getElementById('bottomPrevChapterBtn'),
  bottomOpenChapterListBtn: document.getElementById('bottomOpenChapterListBtn'),
  bottomNextChapterBtn: document.getElementById('bottomNextChapterBtn'),

  themeToggleBtn: document.getElementById('themeToggleBtn'),
  increaseFontBtn: document.getElementById('increaseFontBtn'),
  decreaseFontBtn: document.getElementById('decreaseFontBtn'),
  backToLibraryBtn: document.getElementById('backToLibraryBtn'),
  appShell: document.querySelector('.app-shell'),
  sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
  pageLoadingOverlay: document.getElementById('pageLoadingOverlay'),
  toggleDescriptionBtn: document.getElementById('toggleDescriptionBtn'),
};

function setTheme(theme) {
  if (theme === 'dark') {
    el.body.classList.add('dark');
    el.themeToggleBtn.textContent = '☀️';
  } else {
    el.body.classList.remove('dark');
    el.themeToggleBtn.textContent = '🌙';
  }
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

function applyFontSize() {
  document.documentElement.style.setProperty('--reader-font-size', `${state.fontSize}px`);
  localStorage.setItem(STORAGE_KEYS.fontSize, String(state.fontSize));
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatText(content) {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Không thể tải ${path}`);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Không thể tải ${path}`);
  return response.text();
}

function showView(viewName) {
  [el.libraryView, el.detailView, el.readerView].forEach(view => view.classList.remove('active'));
  if (viewName === 'library') {
    el.libraryView.classList.add('active');
    el.backToLibraryBtn.classList.add('hidden');
  }
  if (viewName === 'detail') {
    el.detailView.classList.add('active');
    el.backToLibraryBtn.classList.remove('hidden');
  }
  if (viewName === 'reader') {
    el.readerView.classList.add('active');
    el.backToLibraryBtn.classList.remove('hidden');
  }
}

function renderSidebarStories() {
  if (!state.filteredStories.length) {
    el.storyList.innerHTML = '<div class="empty-state">Không tìm thấy truyện.</div>';
    return;
  }

  el.storyList.innerHTML = state.filteredStories.map(story => {
    const isActive = state.selectedStory?.id === story.id;
    return `
      <button class="story-list-item ${isActive ? 'active' : ''}" data-story-id="${story.id}">
        <strong>${escapeHtml(story.title)}</strong>
        <span>${escapeHtml(story.author || 'Chưa có tác giả')}</span>
      </button>
    `;
  }).join('');

  el.storyList.querySelectorAll('[data-story-id]').forEach(button => {
    button.addEventListener('click', () => {
      const storyId = button.dataset.storyId;
      openStory(storyId);
    });
  });
}

function renderLibraryGrid() {
  if (!state.filteredStories.length) {
    el.libraryGrid.innerHTML = '<div class="empty-state">Chưa có truyện nào.</div>';
    return;
  }

  el.libraryGrid.innerHTML = state.filteredStories.map(story => `
    <button class="story-card" data-story-id="${story.id}">
      <strong>${escapeHtml(story.title)}</strong>
      <span>${escapeHtml(story.author || 'Chưa có tác giả')}</span>
      <div class="tag">${escapeHtml(story.genre || 'Offline TXT')}</div>
    </button>
  `).join('');

  el.libraryGrid.querySelectorAll('[data-story-id]').forEach(button => {
    button.addEventListener('click', () => {
      const storyId = button.dataset.storyId;
      openStory(storyId);
    });
  });
}

function filterStories(keyword) {
  const q = keyword.trim().toLowerCase();
  state.filteredStories = state.stories.filter(story => {
    return [story.title, story.author, story.genre].filter(Boolean).some(v => v.toLowerCase().includes(q));
  });
  renderSidebarStories();
  renderLibraryGrid();
}

function renderStoryDetail() {
  const meta = state.selectedMeta;
  const story = state.selectedStory;
  if (!meta || !story) return;

  el.pageTitle.textContent = story.title;
  el.pageSubtitle.textContent = 'Chọn chương để đọc';
  el.detailTitle.textContent = meta.title || story.title;
  el.detailMeta.textContent = `${meta.author || 'Không rõ tác giả'} • ${meta.chapters?.length || 0} chương`;
  el.detailDescription.textContent = meta.description || 'Chưa có mô tả.';
  state.descriptionExpanded = false;
  el.detailDescription.classList.remove('expanded');
  el.detailDescription.classList.add('clamp');

  requestAnimationFrame(() => {
    updateDescriptionToggle();
  });

  el.chapterCount.textContent = `${meta.chapters?.length || 0} chương`;

  const lastChapterId = getLastChapterIdForStory(story.id);
  const chapters = meta.chapters || [];

  el.chapterList.innerHTML = chapters.map((chapter, index) => {
    const reading = String(chapter.id) === String(lastChapterId);
    return `
      <button class="chapter-item ${reading ? 'reading' : ''}" data-chapter-id="${chapter.id}">
        <strong>${index + 1}. ${escapeHtml(chapter.title || `Chương ${index + 1}`)}</strong>
        <span>${reading ? 'Đang đọc gần nhất' : 'Mở chương'}</span>
      </button>
    `;
  }).join('');

  el.chapterList.querySelectorAll('[data-chapter-id]').forEach(button => {
    button.addEventListener('click', () => openChapter(button.dataset.chapterId));
  });
}

function getChapterPath(chapterId) {
  return `data/${state.selectedStory.folder}/${chapterId}.txt`;
}

function getScrollKey(storyId, chapterId) {
  return `${STORAGE_KEYS.scrollPrefix}${storyId}_${chapterId}`;
}

function getLastChapterIdForStory(storyId) {
  try {
    const map = JSON.parse(localStorage.getItem(STORAGE_KEYS.lastChapterId) || '{}');
    return map[storyId] || null;
  } catch {
    return null;
  }
}

function setLastChapterIdForStory(storyId, chapterId) {
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(STORAGE_KEYS.lastChapterId) || '{}');
  } catch { }
  map[storyId] = chapterId;
  localStorage.setItem(STORAGE_KEYS.lastChapterId, JSON.stringify(map));
}

async function openStory(storyId) {
  const story = state.stories.find(item => item.id === storyId);
  if (!story) return;

  try {
    const meta = await fetchJson(`data/${story.folder}/meta.json`);
    state.selectedStory = story;
    state.selectedMeta = meta;
    localStorage.setItem(STORAGE_KEYS.lastStoryId, story.id);

    renderSidebarStories();
    renderStoryDetail();
    showView('detail');
  } catch (error) {
    alert(error.message);
  }
}

async function openChapter(chapterId, restoreScroll = true) {
  if (!state.selectedStory || !state.selectedMeta) return;

  const chapters = state.selectedMeta.chapters || [];
  const chapterIndex = chapters.findIndex(item => String(item.id) === String(chapterId));
  if (chapterIndex < 0) return;

  const shouldShowLoading = !restoreScroll;

  try {
    if (shouldShowLoading) {
      showPageLoading();
    }

    if (!restoreScroll) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    const content = await fetchText(getChapterPath(chapterId));
    const chapter = chapters[chapterIndex];

    state.currentChapterId = chapterId;
    state.currentChapterIndex = chapterIndex;

    el.pageTitle.textContent = state.selectedStory.title;
    el.pageSubtitle.textContent = chapter.title || `Chương ${chapterIndex + 1}`;
    el.readerStoryTitle.textContent = state.selectedStory.title;
    el.readerChapterTitle.textContent = chapter.title || `Chương ${chapterIndex + 1}`;
    el.readerContent.innerHTML = formatText(content);

    // 1. Lấy chapterId đã lưu trước đó
    const savedChapterId = getLastChapterIdForStory(state.selectedStory.id);

    // 2. Tìm index của chương đã lưu đó trong danh sách chapters
    const savedChapterIndex = chapters.findIndex(item => String(item.id) === String(savedChapterId));

    // 3. Chỉ cập nhật nếu chương hiện tại có index lớn hơn chương đã lưu
    // (Hoặc nếu chưa có chương nào được lưu - savedChapterIndex === -1)
    if (chapterIndex > savedChapterIndex) {
      setLastChapterIdForStory(state.selectedStory.id, chapterId);
    }

    localStorage.setItem(STORAGE_KEYS.lastStoryId, state.selectedStory.id);

    renderStoryDetail();
    showView('reader');
    updateChapterButtons();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (restoreScroll) {
          const savedScroll = Number(localStorage.getItem(getScrollKey(state.selectedStory.id, chapterId)) || 0);
          window.scrollTo({ top: savedScroll, behavior: 'auto' });
          hidePageLoading();
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });

          setTimeout(() => {
            hidePageLoading();
          }, 300);
        }
      });
    });
  } catch (error) {
    hidePageLoading();
    alert(error.message);
  }
}

function updateChapterButtons() {
  const chapters = state.selectedMeta?.chapters || [];
  const isPrevDisabled = state.currentChapterIndex <= 0;
  const isNextDisabled = state.currentChapterIndex >= chapters.length - 1;

  el.prevChapterBtn.disabled = isPrevDisabled;
  el.nextChapterBtn.disabled = isNextDisabled;

  el.bottomPrevChapterBtn.disabled = isPrevDisabled;
  el.bottomNextChapterBtn.disabled = isNextDisabled;
}

function saveCurrentScroll() {
  if (!state.selectedStory || !state.currentChapterId || !el.readerView.classList.contains('active')) return;
  localStorage.setItem(
    getScrollKey(state.selectedStory.id, state.currentChapterId),
    String(window.scrollY)
  );
}

async function continueReading() {
  if (!state.selectedStory || !state.selectedMeta) return;

  const chapters = state.selectedMeta.chapters || [];
  if (!chapters.length) return;

  // Lấy ID chương cuối hoặc chương đầu tiên nếu chưa đọc
  const lastChapterId = getLastChapterIdForStory(state.selectedStory.id) || chapters[0].id;

  // Gọi hàm mở chương để vào thẳng Reader UI
  openChapter(lastChapterId);
}

function goToLibrary() {
  el.pageTitle.textContent = 'Thư viện truyện';
  el.pageSubtitle.textContent = 'Chọn một truyện để bắt đầu đọc';
  showView('library');
}

async function boot() {
  applyFontSize();
  setTheme(localStorage.getItem(STORAGE_KEYS.theme) || 'light');
  applySidebarState();

  try {
    state.stories = await fetchJson('data/stories.json');
    state.filteredStories = [...state.stories];
    renderSidebarStories();
    renderLibraryGrid();

    const lastStoryId = localStorage.getItem(STORAGE_KEYS.lastStoryId);
    if (lastStoryId && state.stories.some(story => story.id === lastStoryId)) {
      await openStory(lastStoryId);
    }
  } catch (error) {
    el.libraryGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function applySidebarState() {
  el.appShell.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  el.sidebarToggleBtn.textContent = state.sidebarCollapsed ? '☰' : '✕';
  el.sidebarToggleBtn.title = state.sidebarCollapsed ? 'Mở thanh bên' : 'Đóng thanh bên';
  localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, String(state.sidebarCollapsed));
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  applySidebarState();
}

function goPrevChapter() {
  const prev = state.selectedMeta?.chapters?.[state.currentChapterIndex - 1];
  if (prev) openChapter(prev.id, false);
}

function goNextChapter() {
  const next = state.selectedMeta?.chapters?.[state.currentChapterIndex + 1];
  if (next) openChapter(next.id, false);
}

function openChapterList() {
  if (state.selectedStory) {
    showView('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Đợi UI hiển thị xong mới tính toán lại logic "Xem thêm"
    requestAnimationFrame(() => {
      updateDescriptionToggle();
    });
  }
}

function updateDescriptionToggle() {
  const descriptionEl = el.detailDescription;
  const toggleBtn = el.toggleDescriptionBtn;

  if (!descriptionEl || !toggleBtn) return;

  const isOverflowing = descriptionEl.scrollHeight > descriptionEl.clientHeight + 4;

  if (isOverflowing || state.descriptionExpanded) {
    toggleBtn.classList.remove('hidden');
    toggleBtn.textContent = state.descriptionExpanded ? 'Thu gọn ▲' : 'Xem thêm ▼';
  } else {
    toggleBtn.classList.add('hidden');
  }
}

function showPageLoading() {
  el.pageLoadingOverlay.classList.remove('hidden');
  el.pageLoadingOverlay.setAttribute('aria-hidden', 'false');
}

function hidePageLoading() {
  el.pageLoadingOverlay.classList.add('hidden');
  el.pageLoadingOverlay.setAttribute('aria-hidden', 'true');
}

el.storySearch.addEventListener('input', (event) => {
  filterStories(event.target.value || '');
});

el.themeToggleBtn.addEventListener('click', () => {
  const nextTheme = el.body.classList.contains('dark') ? 'light' : 'dark';
  setTheme(nextTheme);
});

el.increaseFontBtn.addEventListener('click', () => {
  state.fontSize = Math.min(state.fontSize + 2, 32);
  applyFontSize();
});

el.decreaseFontBtn.addEventListener('click', () => {
  state.fontSize = Math.max(state.fontSize - 2, 14);
  applyFontSize();
});

el.openChapterListBtn.addEventListener('click', openChapterList);
el.prevChapterBtn.addEventListener('click', goPrevChapter);
el.nextChapterBtn.addEventListener('click', goNextChapter);
el.bottomOpenChapterListBtn.addEventListener('click', openChapterList);
el.bottomPrevChapterBtn.addEventListener('click', goPrevChapter);
el.bottomNextChapterBtn.addEventListener('click', goNextChapter);

el.sidebarToggleBtn.addEventListener('click', toggleSidebar);
el.backToLibraryBtn.addEventListener('click', goToLibrary);
el.continueReadingBtn.addEventListener('click', continueReading);

el.toggleDescriptionBtn.addEventListener('click', () => {
  state.descriptionExpanded = !state.descriptionExpanded;

  if (state.descriptionExpanded) {
    el.detailDescription.classList.remove('clamp');
    el.detailDescription.classList.add('expanded');
  } else {
    el.detailDescription.classList.remove('expanded');
    el.detailDescription.classList.add('clamp');
  }

  updateDescriptionToggle();
});

window.addEventListener('scroll', saveCurrentScroll);
window.addEventListener('beforeunload', saveCurrentScroll);

window.addEventListener('keydown', (event) => {
  const activeTag = document.activeElement?.tagName?.toLowerCase();

  // Nếu đang gõ trong input/textarea thì bỏ qua
  if (activeTag === 'input' || activeTag === 'textarea') return;

  // Chỉ cho phép phím tắt khi đang ở màn hình đọc
  if (!el.readerView.classList.contains('active')) return;

  const key = event.key.toLowerCase();

  if (key === 'a' || event.key === 'ArrowLeft') {
    event.preventDefault();
    goPrevChapter();
  }

  if (key === 'd' || event.key === 'ArrowRight') {
    event.preventDefault();
    goNextChapter();
  }
});

boot();
