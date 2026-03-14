(function () {
  const PJ = (window.PJ = window.PJ || {});
  const { $, debounce, setPill, toggleShow, copyText, blobSize } = PJ.dom;

  const ctx = {
    // main
    input: $("#input"),
    tree: $("#tree"),
    pretty: $("#pretty"),
    meta: $("#meta"),
    rc: $("#resultCount"),
    err: $("#err"),
    childInfo: $("#childInfo"),

    // search (top)
    search: $("#search"),
    btnClearSearch: $("#btnClearSearch"),
    navHits: $("#navHits"),
    btnPrevHit: $("#btnPrevHit"),
    btnNextHit: $("#btnNextHit"),
    optCase: $("#optCase"),
    optWhole: $("#optWhole"),
    resultSearchBar: $("#resultSearchBar"),

    // floating search
    searchFloat: $("#searchFloat"),
    floatHandle: $("#floatHandle"),
    search2: $("#search2"),
    btnClearSearch2: $("#btnClearSearch2"),
    optCase2: $("#optCase2"),
    optWhole2: $("#optWhole2"),
    floatPrev: $("#floatPrev"),
    floatNext: $("#floatNext"),
    floatCounter: $("#floatCounter"),

    // stats & lists
    statsPills: $("#statsPills"),
    keysList: $("#keysList"),
    listStrings: $("#listStrings"),
    listNumbers: $("#listNumbers"),
    listBooleans: $("#listBooleans"),
    listNulls: $("#listNulls"),

    // header buttons
    btnToggleTheme: $("#btnToggleTheme"),
    fileInput: $("#fileInput"),
    btnSample: $("#btnSample"),
    btnCopy: $("#btnCopy"),
    btnZoomIn: $("#btnZoomIn"),
    btnZoomOut: $("#btnZoomOut"),
    btnZoomReset: $("#btnZoomReset"),
    btnToggleAll: $("#btnToggleAll"),
    btnToggleQuotes: $("#btnToggleQuotes"),
    btnSortAZ: $("#btnSortAZ"),
    btnDownload: $("#btnDownload"),
    btnClear: $("#btnClear"),
    brand: $("#brand"),
  };

  const state = {
    unquoteKeys: false,
    isCollapsedView: false,
    lockedLine: null,
    lockedNode: null,

    searchFlags: { case: false, whole: false },
    searchHits: [],
    currentHitIndex: -1,

    sortState: 0, // 0 original, 1 A-Z, 2 Z-A
    originalJson: null,
  };

  PJ.ctx = ctx;
  PJ.state = state;

  const UI_ZOOM_KEY = "pj_ui_zoom";
  const UI_ZOOM_MIN = 0.8;
  const UI_ZOOM_MAX = 1.4;
  const UI_ZOOM_STEP = 0.1;

  function setUiZoom(z) {
    const zoom = Math.max(UI_ZOOM_MIN, Math.min(UI_ZOOM_MAX, Number(z) || 1));
    document.documentElement.style.setProperty("--ui-zoom", String(zoom));
    localStorage.setItem(UI_ZOOM_KEY, String(zoom));
    if (ctx.btnZoomReset) ctx.btnZoomReset.textContent = `${Math.round(zoom * 100)}%`;

    // vì bạn có sticky offset theo header height, nên update lại cho chuẩn
    updateStickyOffset();
  }

  function removeQuotesFromKeys(txt) {
    return txt.replace(/^(\s*)"(.*?)"\s*:(\s)/gm, "$1$2:$3");
  }

  function updateQuotesBtn() {
    if (!ctx.btnToggleQuotes) return;
    ctx.btnToggleQuotes.textContent = state.unquoteKeys ? '🔤 Giữ " " field' : '🔤 Bỏ " " field';
  }

  function updateToggleBtn() {
    if (!ctx.btnToggleAll) return;
    ctx.btnToggleAll.textContent = state.isCollapsedView ? "⤢ Expand all" : "⤡ Collapse all";
  }

  function getUiZoom() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--ui-zoom").trim();
    const z = Number(v);
    return Number.isFinite(z) && z > 0 ? z : 1;
  }

  function updateStickyOffset() {
    const headerH = document.querySelector("header")?.offsetHeight || 0;
    const zoom = getUiZoom();

    // 8px là khoảng cách bạn đang cộng thêm trong CSS trước đây
    const topPx = (headerH + 8) / zoom;

    document.documentElement.style.setProperty("--stickyTopOffset", `${topPx}px`);

    const barH = document.querySelector("#resultSearchBar")?.offsetHeight || 0;
    document.documentElement.style.setProperty("--resultBarH", barH + "px");
  }

  PJ.ui = PJ.ui || {};
  PJ.ui.updateStickyOffset = updateStickyOffset;

  function analyze() {
    ctx.tree.innerHTML = "";
    ctx.pretty.textContent = "";
    setPill(ctx.err, "");
    setPill(ctx.rc, "");
    setPill(ctx.childInfo, "");

    // unlock selection on re-render
    if (state.lockedLine) state.lockedLine.classList.remove("selected");
    if (state.lockedNode) state.lockedNode.classList.remove("selected-subtree");
    state.lockedLine = null;
    state.lockedNode = null;

    const raw = (ctx.input.value || "").trim();
    if (!raw) {
      ctx.meta.textContent = "";
      PJ.stats.renderStats(ctx, null);
      PJ.stats.renderLists(ctx, null, state);
      PJ.search.updateFloatingNav(ctx, state);
      return;
    }

    let data;
    try {
      data = JSON.parse(PJ.normalize.normalizeJson(raw));
    } catch (e) {
      setPill(ctx.err, `❌ JSON không hợp lệ: ${e.message}`);
      ctx.meta.textContent = "";
      PJ.stats.renderStats(ctx, null);
      PJ.stats.renderLists(ctx, null, state);
      PJ.search.updateFloatingNav(ctx, state);
      return;
    }

    ctx.tree.appendChild(PJ.tree.buildTree(data));

    const base = JSON.stringify(data, null, 2);
    ctx.pretty.textContent = state.unquoteKeys ? removeQuotesFromKeys(base) : base;

    const sizeBytes = blobSize(raw);
    ctx.meta.textContent = `Ký tự: ${raw.length.toLocaleString()} • Minified: ${JSON.stringify(data).length.toLocaleString()} • Kích thước ~${sizeBytes.toLocaleString()} B`;

    // collapse reset
    state.isCollapsedView = false;
    updateToggleBtn();

    const stats = PJ.stats.computeStats(data, raw.length, sizeBytes);
    PJ.stats.renderStats(ctx, stats);
    const extraction = PJ.stats.extractData(data);
    PJ.stats.renderLists(ctx, extraction, state);

    // re-apply search if any
    if ((ctx.search.value || "").trim()) PJ.search.applySearch(ctx, state);
    PJ.search.updateFloatingNav(ctx, state);
  }

  // Expose for other modules
  PJ.app = { analyze, removeQuotesFromKeys };

  /* ===== Init & events ===== */
  // init zoom
  setUiZoom(localStorage.getItem(UI_ZOOM_KEY) || 1);

  // events
  ctx.btnZoomIn?.addEventListener("click", () => {
    const cur = Number(localStorage.getItem(UI_ZOOM_KEY) || 1);
    setUiZoom(cur + UI_ZOOM_STEP);
  });

  ctx.btnZoomOut?.addEventListener("click", () => {
    const cur = Number(localStorage.getItem(UI_ZOOM_KEY) || 1);
    setUiZoom(cur - UI_ZOOM_STEP);
  });

  ctx.btnZoomReset?.addEventListener("click", () => setUiZoom(1));

  // theme: default dark
  document.body.setAttribute("data-theme", "dark");
  if (ctx.btnToggleTheme) ctx.btnToggleTheme.textContent = "🌙";

  ctx.btnToggleTheme?.addEventListener("click", () => {
    const cur = document.body.getAttribute("data-theme");
    if (cur === "light") {
      document.body.setAttribute("data-theme", "dark");
      ctx.btnToggleTheme.textContent = "🌙";
    } else {
      document.body.setAttribute("data-theme", "light");
      ctx.btnToggleTheme.textContent = "🌞";
    }
  });

  // scroll to top
  ctx.brand?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  window.addEventListener("resize", updateStickyOffset);
  updateStickyOffset();

  // bind search + tree behaviors
  PJ.search.bindSearchUI(ctx, state);
  PJ.tree.bindHoverAndLock(ctx, state);

  // input -> analyze (debounced)
  const debouncedAnalyze = debounce(() => {
    state.sortState = 0;
    state.originalJson = null;
    PJ.sort.updateSortButtonLabel(ctx, state);
    analyze();
  }, 200);
  ctx.input.addEventListener("input", debouncedAnalyze);

  // file open
  ctx.fileInput?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      ctx.input.value = String(r.result || "");
      state.sortState = 0;
      state.originalJson = null;
      PJ.sort.updateSortButtonLabel(ctx, state);
      analyze();
    };
    r.readAsText(f);
  });

  // sample (use backtick to avoid quote issues)
  const SAMPLE = `{ "field-1": "value-1", "field-2": 200, "array-1": [ { "array-field-1": "a", "array-field-2": 1 }, { "array-field-1": "b", "array-field-2": 2 }, { "array-field-1": "c", "array-field-2": 3, "emptyArr": [], "emptyObj": {} } ], "object-1": { "field-1a": true, "field-1b": null, "emptyArr": [], "emptyObj": {}, "nested": { "deeperEmptyArr": [], "deeperEmptyObj": {} } }, "emptyArrayTop": [], "emptyObjectTop": {} }`;

  ctx.btnSample?.addEventListener("click", () => {
    ctx.input.value = SAMPLE;
    state.sortState = 0;
    state.originalJson = null;
    PJ.sort.updateSortButtonLabel(ctx, state);
    analyze();
  });

  // copy
  ctx.btnCopy?.addEventListener("click", async () => {
    const txt = ctx.pretty.textContent || "";
    if (!txt) return;
    await copyText(txt);
    setPill(ctx.err, "✅ Đã copy JSON.");
    setTimeout(() => setPill(ctx.err, ""), 1500);
  });

  // download
  ctx.btnDownload?.addEventListener("click", () => {
    const txt = ctx.pretty.textContent || ctx.input.value || "";
    const blob = new Blob([txt], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // clear
  ctx.btnClear?.addEventListener("click", () => {
    ctx.input.value = "";
    ctx.tree.innerHTML = "";
    ctx.pretty.textContent = "";
    ctx.meta.textContent = "";
    setPill(ctx.err, "");
    setPill(ctx.rc, "");
    setPill(ctx.childInfo, "");

    ctx.search.value = "";
    if (ctx.search2) ctx.search2.value = "";
    toggleShow(ctx.btnClearSearch, false);
    toggleShow(ctx.btnClearSearch2, false);

    PJ.search.resetSearchFlags(ctx, state);
    state.searchHits = [];
    state.currentHitIndex = -1;

    state.sortState = 0;
    state.originalJson = null;
    PJ.sort.updateSortButtonLabel(ctx, state);

    PJ.stats.renderStats(ctx, null);
    PJ.stats.renderLists(ctx, null, state);
    PJ.search.updateFloatingNav(ctx, state);
  });

  // collapse/expand all
  ctx.btnToggleAll?.addEventListener("click", () => {
    if (state.isCollapsedView) {
      PJ.tree.expandAll(ctx.tree);
      state.isCollapsedView = false;
    } else {
      PJ.tree.collapseToTopLevel(ctx.tree);
      state.isCollapsedView = true;
    }
    updateToggleBtn();
  });
  updateToggleBtn();

  // toggle unquote keys
  ctx.btnToggleQuotes?.addEventListener("click", () => {
    state.unquoteKeys = !state.unquoteKeys;
    updateQuotesBtn();
    analyze();
  });
  updateQuotesBtn();

  // sort
  ctx.btnSortAZ?.addEventListener("click", () => {
    try {
      PJ.sort.cycleSort(ctx, state);
      setPill(ctx.err, "");
    } catch (e) {
      setPill(ctx.err, "❌ JSON không hợp lệ hoặc không thể sắp xếp.");
      console.error(e);
    }
  });
  PJ.sort.updateSortButtonLabel(ctx, state);

  // first render
  analyze();
})();