(() => {
  // ========= Utilities =========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const monthISO = (d = new Date()) => d.toISOString().slice(0, 7);
  const uid = () => (crypto?.randomUUID?.() ?? ("id_" + Math.random().toString(16).slice(2) + Date.now()));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmtVND = (n) => {
    const x = Number(n || 0);
    try { return x.toLocaleString('vi-VN') + " ₫"; }
    catch { return String(x) + " ₫"; }
  };
  const parseMoney = (s) => {
    if (typeof s === 'number') return Math.round(s);
    const raw = String(s ?? "").trim().replace(/[^\d\-]/g, '');
    const n = Number(raw || 0);
    return Math.round(n);
  };
  const fmtInputVND = (n) => {
    const x = Math.abs(parseMoney(n));
    return x ? String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : "";
  };
  function formatMoneyInput(el) {
    if (!el) return;
    const digits = String(el.value ?? '').replace(/[^\d]/g, '');
    el.value = digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
    try { el.setSelectionRange(el.value.length, el.value.length); } catch { }
  }
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  const splitTags = (s) =>
    String(s ?? "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => t.replace(/\s+/g, ' '))
      .slice(0, 24);

  const toast = (title, desc = "") => {
    $('#toastTitle').textContent = title;
    $('#toastDesc').textContent = desc;
    const el = $('#toast');
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
  };

  // ========= Theme (Dark/Light) =========
  const THEME_KEY = "mini_cashflow_theme_v1";
  const applyTheme = (theme) => {
    const t = theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = t;
    const btn = $('#btnTheme');
    if (btn) {
      const isDark = t === 'dark';
      // Icon shows the *other* theme you can switch to
      btn.textContent = isDark ? '☀️' : '🌙';
      btn.title = isDark ? 'Chuyển sang Light theme' : 'Chuyển sang Dark theme';
    }
  };
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

  // Theme toggle button
  $('#btnTheme')?.addEventListener('click', () => {
    const current = document.body.dataset.theme === 'light' ? 'light' : 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    toast("Theme", next === 'light' ? 'Light theme' : 'Dark theme');
  });

  // ========= State =========
  const STORAGE_KEY = "mini_cashflow_bank_v1";
  const DEFAULT_CATEGORIES = [
    "Ăn uống", "Di chuyển", "Nhà cửa", "Điện nước", "Mua sắm",
    "Sức khoẻ", "Giải trí", "Giáo dục", "Gia đình", "Đầu tư",
    "Lương/Thu nhập", "Khác"
  ];

  /** @type {{
   *  version: number,
   *  categories: string[],
   *  accounts: {id:string,name:string,opening:number,note?:string,createdAt:string}[],
   *  tx: {id:string,date:string,type:'income'|'expense'|'transfer', amount:number,
   *       accountId?:string, fromId?:string, toId?:string,
   *       category:string, tags:string[], note:string, ref?:string, createdAt:string, updatedAt?:string}[],
   *  budgets: Record<string, Record<string, number>>, // legacy budgets[YYYY-MM][category]=amount
   *  budgetsV2: Record<string, Record<string, Record<string, number>>>, // budgetsV2[YYYY-MM][scopeId][category]=amount
   *  budgetVisible: Record<string, Record<string, string[]>> // budgetVisible[YYYY-MM][scopeId]=categories[]
   * }} */
  let state = loadState();

  function makeEmptyState() {
    return {
      version: 1,
      categories: [...DEFAULT_CATEGORIES],
      accounts: [],
      tx: [],
      budgets: {}, // legacy
      budgetsV2: {},
      budgetVisible: {}
    };
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s && s.version === 1) return sanitizeState(s);
      } catch { }
    }
    // ✅ First run: empty state (0đ)
    const empty = makeEmptyState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    return empty;
  }

  function sanitizeState(s) {
    s.version = 1;
    s.categories = Array.isArray(s.categories) && s.categories.length ? s.categories : [...DEFAULT_CATEGORIES];
    s.accounts = Array.isArray(s.accounts) ? s.accounts : [];
    s.tx = Array.isArray(s.tx) ? s.tx : [];
    s.budgets = (s.budgets && typeof s.budgets === 'object') ? s.budgets : {};
    s.budgetsV2 = (s.budgetsV2 && typeof s.budgetsV2 === 'object') ? s.budgetsV2 : {};
    s.budgetVisible = (s.budgetVisible && typeof s.budgetVisible === 'object') ? s.budgetVisible : {};

    // Migrate legacy budgets -> budgetsV2[month][__all__]
    const ALL = '__all__';
    for (const m in s.budgets) {
      const legacyM = s.budgets[m] || {};
      if (!s.budgetsV2[m]) s.budgetsV2[m] = {};
      if (!s.budgetsV2[m][ALL]) s.budgetsV2[m][ALL] = {};
      const v2 = s.budgetsV2[m][ALL];
      for (const cat in legacyM) {
        if (v2[cat] == null) v2[cat] = parseMoney(legacyM[cat]);
      }
    }

    // Sanitize budgetsV2 numeric
    for (const m in s.budgetsV2) {
      const scopes = s.budgetsV2[m] || {};
      if (typeof scopes !== 'object') { s.budgetsV2[m] = {}; continue; }
      for (const scopeId in scopes) {
        const bm = scopes[scopeId] || {};
        if (typeof bm !== 'object') { scopes[scopeId] = {}; continue; }
        for (const cat in bm) {
          bm[cat] = parseMoney(bm[cat]);
        }
      }
    }

    // Sanitize budgetVisible arrays
    for (const m in s.budgetVisible) {
      const scopes = s.budgetVisible[m] || {};
      if (typeof scopes !== 'object') { s.budgetVisible[m] = {}; continue; }
      for (const scopeId in scopes) {
        const arr = scopes[scopeId];
        scopes[scopeId] = Array.isArray(arr) ? arr.map(String) : [];
      }
    }
    // Ensure required fields
    s.accounts = s.accounts.map(a => ({
      id: String(a.id || uid()),
      name: String(a.name || "Unnamed"),
      opening: parseMoney(a.opening),
      note: String(a.note || ""),
      createdAt: a.createdAt || new Date().toISOString()
    }));
    s.tx = s.tx.map(t => ({
      id: String(t.id || uid()),
      date: String(t.date || todayISO()),
      type: (t.type === 'income' || t.type === 'expense' || t.type === 'transfer') ? t.type : 'expense',
      amount: Math.abs(parseMoney(t.amount)),
      accountId: t.accountId ? String(t.accountId) : undefined,
      fromId: t.fromId ? String(t.fromId) : undefined,
      toId: t.toId ? String(t.toId) : undefined,
      category: String(t.category || "Khác"),
      tags: Array.isArray(t.tags) ? t.tags.map(x => String(x)).filter(Boolean) : [],
      note: String(t.note || ""),
      ref: String(t.ref || ""),
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || undefined
    }));
    return s;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    scheduleDbSave();
  }

  // ========= DB file (my-bank-info.json) =========
  // Dùng File System Access API (Chrome/Edge). Nếu không hỗ trợ thì fallback localStorage.
  const DB_HANDLE_DB = "mini_cashflow_bank_handles_v1";
  const DB_HANDLE_STORE = "handles";
  const DB_HANDLE_KEY = "main";

  const DB = {
    mode: "local", // "local" | "file"
    handle: null,
    fileName: "",
    lastSavedAt: ""
  };

  const canUseFileApi = !!(window.showOpenFilePicker && window.showSaveFilePicker);

  function updateStorageBadge() {
    const badge = $('#storageBadge');

    // Settings panel (details live here)
    const title = $('#settingsDbTitle');
    const sub = $('#settingsDbSub');
    const hint = $('#settingsDbHint');

    const setSettings = (t, sHtml, hHtml) => {
      if (title) title.textContent = t || "";
      if (sub) sub.innerHTML = sHtml || "";
      if (hint) hint.innerHTML = hHtml || "";
    };

    // Sidebar badge: keep minimal, avoid noisy DB messages in sidebar
    if (badge) {
      if (!canUseFileApi) badge.textContent = "offline";
      else if (DB.mode === "file" && DB.handle) badge.textContent = "offline";
      else badge.textContent = "offline";
    }

    // If Settings tab isn't in DOM (older build), stop here
    if (!title && !sub && !hint) return;

    if (!canUseFileApi) {
      setSettings(
        "localStorage (không hỗ trợ DB file)",
        `Dữ liệu đang lưu trong <span class="kbd">localStorage</span>. Trình duyệt của bạn chưa hỗ trợ <b>File System Access API</b>.`,
        `Gợi ý: dùng Chrome/Edge bản mới để có thể chọn/tạo file <span class="kbd">my-bank-info.json</span> và tự lưu.`
      );
      return;
    }

    if (DB.mode === "file" && DB.handle) {
      const fn = escapeHtml(DB.fileName || "my-bank-info.json");
      const saved =
        DB.lastSavedAt
          ? `Lần lưu gần nhất: <span class="kbd">${escapeHtml(DB.lastSavedAt.slice(11, 19))}</span>.`
          : `Chưa có lần lưu nào.`;
      setSettings(
        `DB file: ${DB.fileName || "my-bank-info.json"}`,
        `Đang <b>tự lưu</b> khi thay đổi. ${saved}`,
        `DB file: <span class="kbd">${fn}</span>. Import dùng để <b>ghi đè</b> hoặc <b>gộp</b> dữ liệu từ file khác.`
      );
    } else {
      setSettings(
        "localStorage",
        `Chưa chọn DB file. Dữ liệu đang lưu tạm trong <span class="kbd">localStorage</span>.`,
        `Bấm <span class="kbd">DB file</span> để chọn/tạo <span class="kbd">my-bank-info.json</span> và bật tự lưu.`
      );
    }
  }

  function openHandleDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_HANDLE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_HANDLE_STORE)) db.createObjectStore(DB_HANDLE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSetHandle(handle) {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_HANDLE_STORE, 'readwrite');
      tx.objectStore(DB_HANDLE_STORE).put(handle, DB_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGetHandle() {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_HANDLE_STORE, 'readonly');
      const req = tx.objectStore(DB_HANDLE_STORE).get(DB_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbClearHandle() {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_HANDLE_STORE, 'readwrite');
      tx.objectStore(DB_HANDLE_STORE).delete(DB_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function ensureFilePermission(handle, write = false) {
    if (!handle) return false;
    try {
      const opts = { mode: write ? 'readwrite' : 'read' };
      if ((await handle.queryPermission(opts)) === 'granted') return true;
      if ((await handle.requestPermission(opts)) === 'granted') return true;
      return false;
    } catch {
      return false;
    }
  }

  async function readStateFromHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    if (!String(text || "").trim()) {
      const empty = makeEmptyState();
      await writeStateToHandle(handle, empty);
      return empty;
    }
    const data = JSON.parse(text);
    return sanitizeState(data);
  }

  async function writeStateToHandle(handle, st) {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(st, null, 2));
    await writable.close();
    DB.lastSavedAt = new Date().toISOString();
  }

  let _dbSaveTimer = null;
  function scheduleDbSave() {
    if (DB.mode !== "file" || !DB.handle) return;
    clearTimeout(_dbSaveTimer);
    _dbSaveTimer = setTimeout(() => {
      saveToDbNow().catch(err => toast("Lỗi lưu DB", String(err?.message || err)));
    }, 350);
  }

  async function saveToDbNow() {
    if (DB.mode !== "file" || !DB.handle) return;
    const ok = await ensureFilePermission(DB.handle, true);
    if (!ok) {
      toast("Mất quyền ghi file", "Chuyển tạm về localStorage. Bấm DB file để cấp lại quyền.");
      DB.mode = "local";
      DB.handle = null;
      DB.fileName = "";
      updateStorageBadge();
      return;
    }
    await writeStateToHandle(DB.handle, state);
    updateStorageBadge();
  }

  async function initDbAuto() {
    if (!canUseFileApi) {
      updateStorageBadge();
      return;
    }
    try {
      const handle = await idbGetHandle();
      if (!handle) {
        updateStorageBadge();
        return;
      }
      const ok = await ensureFilePermission(handle, false);
      if (!ok) {
        updateStorageBadge();
        return;
      }
      DB.handle = handle;
      DB.fileName = handle.name || "my-bank-info.json";
      DB.mode = "file";

      try {
        const loaded = await readStateFromHandle(handle);
        state = loaded;
        // sync local cache (không bắt buộc, nhưng an toàn)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderAll();
        toast("Đã tải DB file", DB.fileName);
      } catch {
        toast("Không đọc được DB file", "Giữ dữ liệu localStorage hiện tại");
      }

      updateStorageBadge();
    } catch {
      updateStorageBadge();
    }
  }

  async function pickDbFileFlow() {
    if (!canUseFileApi) {
      toast("Trình duyệt không hỗ trợ", "Hãy dùng Chrome/Edge để lưu trực tiếp vào file JSON");
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "my-bank-info.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
      });

      const ok = await ensureFilePermission(handle, true);
      if (!ok) {
        toast("Không có quyền file", "Bạn cần cho phép đọc/ghi file để dùng DB file");
        return;
      }

      DB.handle = handle;
      DB.fileName = handle.name || "my-bank-info.json";
      DB.mode = "file";
      await idbSetHandle(handle);

      // load or init
      try {
        state = await readStateFromHandle(handle);
      } catch {
        state = makeEmptyState();
        await writeStateToHandle(handle, state);
      }

      saveState(); // sẽ autosave lại, nhưng ok
      renderAll();
      updateStorageBadge();
      toast("Đã chọn DB file", DB.fileName);
    } catch (err) {
      // user cancelled
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mergeStates(current, incoming) {
    const out = sanitizeState(deepClone(current));
    const inc = sanitizeState(deepClone(incoming));

    // categories: union (giữ thứ tự)
    const seen = new Set(out.categories.map(norm));
    for (const c of inc.categories) {
      const k = norm(c);
      if (!seen.has(k)) {
        out.categories.push(c);
        seen.add(k);
      }
    }

    // accounts: tránh trùng id
    const existingIds = new Set(out.accounts.map(a => a.id));
    const remapAccId = new Map();

    for (const a of inc.accounts) {
      if (!existingIds.has(a.id)) {
        out.accounts.push(a);
        existingIds.add(a.id);
        continue;
      }

      const curAcc = out.accounts.find(x => x.id === a.id);
      const same = curAcc && norm(curAcc.name) === norm(a.name);
      if (same) continue;

      const newId = uid();
      remapAccId.set(a.id, newId);
      out.accounts.push({ ...a, id: newId });
      existingIds.add(newId);
    }

    // tx: tránh trùng id, remap account refs nếu cần
    const txIds = new Set(out.tx.map(t => t.id));
    for (const t0 of inc.tx) {
      let t = { ...t0 };

      if (t.accountId && remapAccId.has(t.accountId)) t.accountId = remapAccId.get(t.accountId);
      if (t.fromId && remapAccId.has(t.fromId)) t.fromId = remapAccId.get(t.fromId);
      if (t.toId && remapAccId.has(t.toId)) t.toId = remapAccId.get(t.toId);

      if (txIds.has(t.id)) {
        const ex = out.tx.find(x => x.id === t.id);
        if (ex && JSON.stringify(ex) === JSON.stringify(t)) continue;
        t.id = uid();
      }
      txIds.add(t.id);
      out.tx.push(t);
    }

    // budgets (legacy): merge (ưu tiên dữ liệu hiện tại, chỉ điền thiếu)
    for (const m in inc.budgets) {
      if (!out.budgets[m]) out.budgets[m] = {};
      const outM = out.budgets[m];
      const inM = inc.budgets[m] || {};
      for (const cat in inM) {
        if (outM[cat] == null) outM[cat] = parseMoney(inM[cat]);
      }
    }

    // budgetsV2: merge (ưu tiên dữ liệu hiện tại, chỉ điền thiếu)
    out.budgetsV2 = (out.budgetsV2 && typeof out.budgetsV2 === 'object') ? out.budgetsV2 : {};
    for (const m in inc.budgetsV2) {
      if (!out.budgetsV2[m]) out.budgetsV2[m] = {};
      const outScopes = out.budgetsV2[m];
      const inScopes = inc.budgetsV2[m] || {};
      for (const scopeId in inScopes) {
        if (!outScopes[scopeId]) outScopes[scopeId] = {};
        const outM = outScopes[scopeId];
        const inM = inScopes[scopeId] || {};
        for (const cat in inM) {
          if (outM[cat] == null) outM[cat] = parseMoney(inM[cat]);
        }
      }
    }

    // budgetVisible: union (ưu tiên dữ liệu hiện tại, chỉ thêm thiếu)
    out.budgetVisible = (out.budgetVisible && typeof out.budgetVisible === 'object') ? out.budgetVisible : {};
    for (const m in inc.budgetVisible) {
      if (!out.budgetVisible[m]) out.budgetVisible[m] = {};
      const outScopes = out.budgetVisible[m];
      const inScopes = inc.budgetVisible[m] || {};
      for (const scopeId in inScopes) {
        if (!outScopes[scopeId]) outScopes[scopeId] = [];
        const outArr = Array.isArray(outScopes[scopeId]) ? outScopes[scopeId] : (outScopes[scopeId] = []);
        const inArr = Array.isArray(inScopes[scopeId]) ? inScopes[scopeId] : [];
        const set = new Set(outArr.map(norm));
        for (const c of inArr) {
          const k = norm(c);
          if (!set.has(k)) { outArr.push(c); set.add(k); }
        }
      }
    }

    return out;
  }

  async function importFromOtherFileFlow(fileObj = null) {
    try {
      let text = "";
      if (fileObj) {
        text = await fileObj.text();
      } else if (canUseFileApi) {
        const [h] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
        });
        const f = await h.getFile();
        text = await f.text();
      } else {
        // fallback: dùng input file cũ
        $('#fileImport').click();
        return;
      }

      const incoming = sanitizeState(JSON.parse(text));
      const overwrite = confirm(
        "Import dữ liệu:\n\nOK = GHI ĐÈ toàn bộ dữ liệu hiện tại\nCancel = GỘP (merge) vào dữ liệu hiện tại"
      );

      state = overwrite ? incoming : mergeStates(state, incoming);
      saveState();
      await saveToDbNow(); // flush ngay nếu đang dùng DB file
      renderAll();
      toast("Import xong", overwrite ? "Đã ghi đè" : "Đã gộp dữ liệu");
    } catch {
      toast("Import thất bại", "File JSON không hợp lệ");
    }
  }

  // ========= Derived calculations =========
  function getAccountById(id) {
    return state.accounts.find(a => a.id === id);
  }

  function computeBalances() {
    const bal = new Map();
    for (const a of state.accounts) {
      bal.set(a.id, parseMoney(a.opening));
    }
    for (const t of state.tx) {
      const amt = parseMoney(t.amount);
      if (t.type === 'income') {
        if (t.accountId && bal.has(t.accountId)) bal.set(t.accountId, bal.get(t.accountId) + amt);
      } else if (t.type === 'expense') {
        if (t.accountId && bal.has(t.accountId)) bal.set(t.accountId, bal.get(t.accountId) - amt);
      } else if (t.type === 'transfer') {
        if (t.fromId && bal.has(t.fromId)) bal.set(t.fromId, bal.get(t.fromId) - amt);
        if (t.toId && bal.has(t.toId)) bal.set(t.toId, bal.get(t.toId) + amt);
      }
    }
    let total = 0;
    for (const v of bal.values()) total += v;
    return { bal, total };
  }

  function monthOf(dateISO) { return String(dateISO).slice(0, 7); }

  function monthSummary(month) {
    let income = 0, expense = 0;
    for (const t of state.tx) {
      if (monthOf(t.date) !== month) continue;
      const amt = parseMoney(t.amount);
      if (t.type === 'income') income += amt;
      if (t.type === 'expense') expense += amt;
      // transfer does not affect net
    }
    return { income, expense, net: income - expense };
  }

  function spendByCategory(month) {
    const m = new Map();
    for (const t of state.tx) {
      if (monthOf(t.date) !== month) continue;
      if (t.type !== 'expense') continue;
      const k = t.category || "Khác";
      m.set(k, (m.get(k) || 0) + parseMoney(t.amount));
    }
    return m;
  }

  function collectTags(month) {
    const freq = new Map();
    for (const t of state.tx) {
      if (month && monthOf(t.date) !== month) continue;
      for (const tag of (t.tags || [])) {
        const k = tag.trim();
        if (!k) continue;
        freq.set(k, (freq.get(k) || 0) + 1);
      }
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
  }

  function txMatchesFilters(t, f) {
    if (f.month && monthOf(t.date) !== f.month) return false;
    if (f.type && t.type !== f.type) return false;

    if (f.account) {
      // For income/expense: accountId; transfer: fromId/toId
      if (t.type === 'transfer') {
        if (t.fromId !== f.account && t.toId !== f.account) return false;
      } else {
        if (t.accountId !== f.account) return false;
      }
    }

    if (f.category && (t.category || "") !== f.category) return false;

    if (f.tag) {
      const needle = norm(f.tag);
      const tags = (t.tags || []).map(norm);
      if (!tags.some(x => x.includes(needle))) return false;
    }

    if (f.search) {
      const s = norm(f.search);
      const accA = t.accountId ? (getAccountById(t.accountId)?.name || "") : "";
      const accF = t.fromId ? (getAccountById(t.fromId)?.name || "") : "";
      const accT = t.toId ? (getAccountById(t.toId)?.name || "") : "";
      const hay = [
        t.note, t.ref, t.category,
        accA, accF, accT,
        ...(t.tags || [])
      ].map(norm).join(" | ");
      if (!hay.includes(s)) return false;
    }

    return true;
  }

  // ========= UI: tabs =========
  function setTab(tab) {
    $$('#tabs .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
    $('#tab_tx').style.display = (tab === 'tx') ? '' : 'none';
    $('#tab_bud').style.display = (tab === 'bud') ? '' : 'none';
    $('#tab_acc').style.display = (tab === 'acc') ? '' : 'none';
    $('#tab_ins').style.display = (tab === 'ins') ? '' : 'none';
    $('#tab_set').style.display = (tab === 'set') ? '' : 'none';
    renderAll();
  }

  $('#tabs').addEventListener('click', (e) => {
    const el = e.target.closest('.tab');
    if (!el) return;
    setTab(el.dataset.tab);
  });

  // ========= UI: filters =========
  const filters = {
    month: monthISO(),
    type: "",
    account: "",
    category: "",
    tag: "",
    search: ""
  };

  function initFilters() {
    $('#filterMonth').value = filters.month;
    $('#budgetMonth').value = filters.month;
    $('#filterType').value = filters.type;
    $('#filterTag').value = filters.tag;
    $('#globalSearch').value = filters.search;

    $('#filterMonth').addEventListener('change', () => { filters.month = $('#filterMonth').value || ""; renderAll(); });
    $('#filterType').addEventListener('change', () => { filters.type = $('#filterType').value || ""; renderAll(); });
    $('#filterAccount').addEventListener('change', () => { filters.account = $('#filterAccount').value || ""; renderAll(); });
    $('#filterCategory').addEventListener('change', () => { filters.category = $('#filterCategory').value || ""; renderAll(); });
    $('#filterTag').addEventListener('input', () => { filters.tag = $('#filterTag').value; renderAllDebounced(); });
    $('#globalSearch').addEventListener('input', () => { filters.search = $('#globalSearch').value; renderAllDebounced(); });

    $('#btnClearFilters').addEventListener('click', () => {
      filters.month = monthISO();
      filters.type = "";
      filters.account = "";
      filters.category = "";
      filters.tag = "";
      filters.search = "";
      $('#filterMonth').value = filters.month;
      $('#filterType').value = "";
      $('#filterAccount').value = "";
      $('#filterCategory').value = "";
      $('#filterTag').value = "";
      $('#globalSearch').value = "";
      $('#budgetMonth').value = filters.month;
      renderAll();
      toast("Đã clear filters");
    });
  }

  let _rAF = null;
  function renderAllDebounced() {
    if (_rAF) cancelAnimationFrame(_rAF);
    _rAF = requestAnimationFrame(() => renderAll());
  }

  // ========= UI: render sidebar =========
  function monthFlowByAccount(month) {
    const map = new Map();
    for (const a of state.accounts) {
      map.set(a.id, { accountId: a.id, name: a.name, income: 0, expense: 0, transferIn: 0, transferOut: 0 });
    }
    for (const t of state.tx) {
      if (monthOf(t.date) !== month) continue;
      const amt = parseMoney(t.amount);
      if (t.type === 'income' && t.accountId && map.has(t.accountId)) {
        map.get(t.accountId).income += amt;
      }
      if (t.type === 'expense' && t.accountId && map.has(t.accountId)) {
        map.get(t.accountId).expense += amt;
      }
      if (t.type === 'transfer') {
        if (t.toId && map.has(t.toId)) map.get(t.toId).transferIn += amt;
        if (t.fromId && map.has(t.fromId)) map.get(t.fromId).transferOut += amt;
      }
    }
    const out = [];
    for (const v of map.values()) {
      const inflow = v.income + v.transferIn;
      const outflow = v.expense + v.transferOut;
      out.push({
        ...v,
        inflow,
        outflow,
        net: inflow - outflow
      });
    }
    return out;
  }

  function renderSidebar() {
    const { bal, total } = computeBalances();
    $('#kpiTotal').textContent = fmtVND(total);
    $('#kpiTotalSub').textContent = `${state.accounts.length} accounts · ${state.tx.length} giao dịch`;

    const month = filters.month || monthISO();
    const ms = monthSummary(month);
    $('#kpiNetMonth').textContent = fmtVND(ms.net);
    $('#kpiNetMonth').style.color = (ms.net >= 0) ? 'var(--good)' : 'var(--bad)';
    $('#kpiNetMonthSub').textContent = `Thu ${fmtVND(ms.income)} · Chi ${fmtVND(ms.expense)}`;

    const wrap = $('#accountsList');
    wrap.innerHTML = "";
    if (state.accounts.length === 0) {
      wrap.innerHTML = `<div class="muted">Chưa có account. Hãy tạo Cash/Bank trước.</div>`;
      const mb = $('#monthByAccountList');
      if (mb) mb.innerHTML = `<div class="muted">—</div>`;
      return;
    }

    for (const a of state.accounts) {
      const v = bal.get(a.id) || 0;
      const pillClass = v >= 0 ? 'good' : 'bad';
      const row = document.createElement('div');
      row.className = "row";
      row.style.justifyContent = "space-between";
      row.style.gap = "10px";
      row.innerHTML = `
        <div class="col" style="gap:2px; min-width:0">
          <div style="font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(a.name)}</div>
          <div class="muted" style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(a.note || "")}</div>
        </div>
        <div class="pill ${pillClass} mono">${fmtVND(v)}</div>
      `;
      wrap.appendChild(row);
    }

    // month flow by account (includes transfers)
    const mb = $('#monthByAccountList');
    if (mb) {
      mb.innerHTML = "";
      const flows = monthFlowByAccount(month);
      for (const f of flows) {
        const netClass = f.net >= 0 ? 'good' : 'bad';
        const item = document.createElement('div');
        item.className = 'row';
        item.style.justifyContent = 'space-between';
        item.style.gap = '10px';
        item.style.cursor = 'pointer';
        item.dataset.accId = f.accountId;
        item.innerHTML = `
              <div class="col" style="gap:2px; min-width:0">
                <div style="font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(f.name)}</div>
                <div class="muted mono" style="font-size:12px">
                  +${fmtVND(f.inflow)} · -${fmtVND(f.outflow)}
                  ${f.transferIn || f.transferOut ? ` · ↔ ${fmtVND(f.transferIn)} in / ${fmtVND(f.transferOut)} out` : ``}
                </div>
              </div>
              <div class="pill ${netClass} mono">${f.net >= 0 ? '+' : '-'} ${fmtVND(Math.abs(f.net))}</div>
            `;
        mb.appendChild(item);
      }
    }
  }

  // ========= UI: render select options =========
  function renderOptions() {
    // Categories
    const catSel = $('#filterCategory');
    const txCat = $('#txCategory');
    catSel.innerHTML = `<option value="">Tất cả</option>`;
    txCat.innerHTML = "";
    for (const c of state.categories) {
      catSel.innerHTML += `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`;
      txCat.innerHTML += `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`;
    }
    catSel.value = filters.category || "";

    // Accounts filter + tx selects
    const accSel = $('#filterAccount');
    const txAcc = $('#txAccount');
    const txFrom = $('#txFrom');
    const txTo = $('#txTo');
    accSel.innerHTML = `<option value="">Tất cả</option>`;
    txAcc.innerHTML = "";
    txFrom.innerHTML = "";
    txTo.innerHTML = "";

    for (const a of state.accounts) {
      const opt = `<option value="${escapeAttr(a.id)}">${escapeHtml(a.name)}</option>`;
      accSel.innerHTML += opt;
      txAcc.innerHTML += opt;
      txFrom.innerHTML += opt;
      txTo.innerHTML += opt;
    }
    accSel.value = filters.account || "";

    // Budgets scope select
    renderBudgetScopeOptions();
    renderBudgetScopePills(getBudgetMonth());
  }

  const BUDGET_SCOPE_ALL = '__all__';
  const DEFAULT_BUDGET_VISIBLE = ['Ăn uống', 'Lương/Thu nhập', 'Khác'];
  const BUDGET_SCOPE_KEY = 'mini_cashflow_budget_scope_v1';
  const BUDGET_SCOPE_MONTH_PREFIX = 'mini_cashflow_budget_scope_month_v1:';

  function getBudgetMonth() {
    return $('#budgetMonth')?.value || filters.month || monthISO();
  }
  function getBudgetScope(m) {
    // Budget is GLOBAL (All accounts) to keep it simple.
    const sel = $('#budgetScope');
    if (sel) sel.value = BUDGET_SCOPE_ALL;
    return BUDGET_SCOPE_ALL;
  }
  function setBudgetScope(m, scopeId) {
    // no-op (locked to All)
    const sel = $('#budgetScope');
    if (sel) sel.value = BUDGET_SCOPE_ALL;
  }

  function renderBudgetScopePills(m) {
    const wrap = $('#budgetScopePills');
    const help = $('#budgetScopeHelp');
    if (!wrap || !help) return;
    const mm = m || getBudgetMonth();
    const scopeId = getBudgetScope(mm);

    wrap.innerHTML = '';

    const addBtn = (id, label) => {
      const b = document.createElement('button');
      b.className = 'pillbtn' + (id === scopeId ? ' active' : '');
      b.dataset.scope = id;
      b.textContent = label;
      wrap.appendChild(b);
    };

    addBtn(BUDGET_SCOPE_ALL, 'All accounts');
    for (const a of state.accounts) addBtn(a.id, a.name);

    const scopeName = scopeId === BUDGET_SCOPE_ALL ? 'All accounts' : (getAccountById(scopeId)?.name || 'Account');
    help.textContent = `Scope đang chọn: ${scopeName}. (Budget tách riêng theo scope)`;
  }

  function renderBudgetScopeOptions() {
    const sel = $('#budgetScope');
    if (!sel) return;
    const m = getBudgetMonth();
    const current = localStorage.getItem(BUDGET_SCOPE_MONTH_PREFIX + m) || sel.value || localStorage.getItem(BUDGET_SCOPE_KEY) || BUDGET_SCOPE_ALL;
    sel.innerHTML = '';
    sel.innerHTML += `<option value="${escapeAttr(BUDGET_SCOPE_ALL)}">All accounts</option>`;
    for (const a of state.accounts) {
      sel.innerHTML += `<option value="${escapeAttr(a.id)}">${escapeHtml(a.name)}</option>`;
    }
    // keep current if exists
    const exists = Array.from(sel.options).some(o => o.value === current);
    sel.value = exists ? current : BUDGET_SCOPE_ALL;
  }

  $('#budgetScope')?.addEventListener('change', () => {
    setBudgetScope(getBudgetMonth(), $('#budgetScope').value || BUDGET_SCOPE_ALL);
    renderAll();
  });

  $('#budgetScopePills')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-scope]');
    if (!btn) return;
    setBudgetScope(getBudgetMonth(), btn.dataset.scope || BUDGET_SCOPE_ALL);
    renderAll();
  });

  // click in sidebar month-by-account list => filter transactions
  $('#monthByAccountList')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-acc-id]');
    if (!row) return;
    const accId = row.dataset.accId;
    filters.account = accId;
    $('#filterAccount').value = accId;
    setTab('tx');
    renderAll();
  });

  // ========= UI: render transactions table =========
  function typePill(type) {
    if (type === 'income') return `<span class="pill good">Income</span>`;
    if (type === 'expense') return `<span class="pill bad">Expense</span>`;
    return `<span class="pill warn">Transfer</span>`;
  }

  function txAccountText(t) {
    if (t.type === 'transfer') {
      const f = getAccountById(t.fromId)?.name || "—";
      const to = getAccountById(t.toId)?.name || "—";
      return `${escapeHtml(f)} → ${escapeHtml(to)}`;
    }
    const a = getAccountById(t.accountId)?.name || "—";
    return escapeHtml(a);
  }

  function renderTxTable() {
    const tbody = $('#txTbody');
    tbody.innerHTML = "";

    const list = state.tx
      .slice()
      .sort((a, b) => (b.date.localeCompare(a.date)) || ((b.createdAt || "").localeCompare(a.createdAt || "")));

    const filtered = list.filter(t => txMatchesFilters(t, filters));
    $('#txCountPill').textContent = `${filtered.length} giao dịch`;

    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="8" class="muted" style="padding:18px">
    Chưa có giao dịch nào (hãy bấm “Thêm giao dịch”).
  </td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const t of filtered) {
      const tr = document.createElement('tr');
      const amt = parseMoney(t.amount);
      const amtSign = (t.type === 'income') ? '+' : (t.type === 'expense' ? '-' : '↔');
      const amtColor = (t.type === 'income') ? 'var(--good)' : (t.type === 'expense' ? 'var(--bad)' : 'var(--warn)');
      const tagsHtml = (t.tags && t.tags.length)
        ? `<div class="chips">${t.tags.map(x => `<span class="chip">${escapeHtml(x)}</span>`).join('')}</div>`
        : `<span class="muted">—</span>`;

      tr.innerHTML = `
        <td class="mono">${escapeHtml(t.date)}</td>
        <td>${typePill(t.type)}</td>
        <td>${txAccountText(t)}</td>
        <td>${escapeHtml(t.category || "Khác")}</td>
        <td class="mono" style="font-weight:900; color:${amtColor}">
          ${amtSign} ${fmtVND(amt)}
        </td>
        <td>${tagsHtml}</td>
        <td>${t.ref ? `<div class="muted" style="font-size:12px">Ref: ${escapeHtml(t.ref)}</div>` : ``}
            ${t.note ? escapeHtml(t.note) : `<span class="muted">—</span>`}
        </td>
        <td>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn small" data-act="edit" data-id="${escapeAttr(t.id)}">✏️ Edit</button>
            <button class="btn small" data-act="dup" data-id="${escapeAttr(t.id)}">🧬 Dup</button>
            <button class="btn small danger" data-act="del" data-id="${escapeAttr(t.id)}">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  $('#txTbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const t = state.tx.find(x => x.id === id);
    if (!t) return;

    if (act === 'edit') openTxModal(t);
    if (act === 'dup') duplicateTx(t);
    if (act === 'del') deleteTx(t.id);
  });

  // ========= Budgets =========
  function isIncomeCategory(cat) {
    const k = norm(cat);
    return k.includes('thu nhap') || k.includes('luong') || k.includes('lương');
  }

  function migrateBudgetsToAll() {
    // If user previously created budgets per-account, merge them into All accounts
    // (take the max value per category; union visible categories).
    try {
      state.budgetsV2 = (state.budgetsV2 && typeof state.budgetsV2 === 'object') ? state.budgetsV2 : {};
      state.budgetVisible = (state.budgetVisible && typeof state.budgetVisible === 'object') ? state.budgetVisible : {};
      for (const m of Object.keys(state.budgetsV2)) {
        const byScope = state.budgetsV2[m] || {};
        if (!byScope[BUDGET_SCOPE_ALL]) {
          const scopes = Object.keys(byScope).filter(s => s !== BUDGET_SCOPE_ALL);
          if (scopes.length) {
            const all = {};
            for (const s of scopes) {
              const obj = byScope[s] || {};
              for (const [cat, val] of Object.entries(obj)) {
                const n = parseMoney(val);
                if (all[cat] == null || n > all[cat]) all[cat] = n;
              }
            }
            byScope[BUDGET_SCOPE_ALL] = all;
            state.budgetsV2[m] = byScope;
          }
        }

        const visByScope = (state.budgetVisible[m] && typeof state.budgetVisible[m] === 'object') ? state.budgetVisible[m] : {};
        if (!visByScope[BUDGET_SCOPE_ALL]) {
          const scopes = Object.keys(visByScope).filter(s => s !== BUDGET_SCOPE_ALL);
          if (scopes.length) {
            const set = new Set();
            for (const s of scopes) {
              for (const c of (visByScope[s] || [])) set.add(c);
            }
            visByScope[BUDGET_SCOPE_ALL] = [...set];
            state.budgetVisible[m] = visByScope;
          }
        }
      }
    } catch { }
  }



  function ensureBudgetV2(month, scopeId) {
    const m = month || monthISO();
    const s = scopeId || BUDGET_SCOPE_ALL;
    state.budgetsV2 = (state.budgetsV2 && typeof state.budgetsV2 === 'object') ? state.budgetsV2 : {};
    state.budgetVisible = (state.budgetVisible && typeof state.budgetVisible === 'object') ? state.budgetVisible : {};

    if (!state.budgetsV2[m]) state.budgetsV2[m] = {};
    if (!state.budgetsV2[m][s]) state.budgetsV2[m][s] = {};

    if (!state.budgetVisible[m]) state.budgetVisible[m] = {};
    if (!Array.isArray(state.budgetVisible[m][s])) {
      const base = [];
      const seen = new Set();
      for (const c of DEFAULT_BUDGET_VISIBLE) {
        if (state.categories.includes(c) && !seen.has(norm(c))) {
          base.push(c);
          seen.add(norm(c));
        }




      }
      const existing = state.budgetsV2[m][s] || {};
      for (const c of Object.keys(existing)) {
        if (!seen.has(norm(c))) {
          base.push(c);
          seen.add(norm(c));
        }
      }
      state.budgetVisible[m][s] = base;
    }

    // keep visible categories valid
    state.budgetVisible[m][s] = state.budgetVisible[m][s].filter(c => state.categories.includes(c));
  }

  function sumByCategory(month, scopeId, type) {
    const out = new Map();
    for (const t of state.tx) {
      if (monthOf(t.date) !== month) continue;
      if (t.type !== type) continue;
      if (scopeId && scopeId !== BUDGET_SCOPE_ALL) {
        if (t.accountId !== scopeId) continue;
      }
      const k = t.category || 'Khác';
      out.set(k, (out.get(k) || 0) + parseMoney(t.amount));
    }
    return out;
  }

  function renderBudgetAddCatOptions(month, scopeId) {
    const sel = $('#budgetAddCat');
    if (!sel) return;
    const m = month || monthISO();
    const s = scopeId || BUDGET_SCOPE_ALL;
    ensureBudgetV2(m, s);
    const visible = state.budgetVisible[m][s] || [];
    const visSet = new Set(visible.map(norm));
    const remaining = state.categories.filter(c => !visSet.has(norm(c)));

    sel.innerHTML = '';
    if (remaining.length === 0) {
      sel.innerHTML = '<option value="">(Không còn mục)</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Chọn mục…</option>';
    for (const c of remaining) {
      sel.innerHTML += `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`;
    }
  }

  function renderBudgets() {
    const m = $('#budgetMonth').value || filters.month || monthISO();
    const scopeId = getBudgetScope(m);
    $('#budMonthLabel').textContent = scopeId === BUDGET_SCOPE_ALL
      ? `${m} · All accounts`
      : `${m} · ${getAccountById(scopeId)?.name || 'Account'}`;

    ensureBudgetV2(m, scopeId);
    renderBudgetScopePills(m);

    const btnCopy = $('#btnCopyAllToScope');
    if (btnCopy) {
      const allHas = !!(state.budgetVisible?.[m]?.[BUDGET_SCOPE_ALL]?.length);
      btnCopy.style.display = (scopeId !== BUDGET_SCOPE_ALL && allHas) ? '' : 'none';
    }

    // build spend/earned maps for this scope
    const spentMap = sumByCategory(m, scopeId, 'expense');
    const earnedMap = sumByCategory(m, scopeId, 'income');

    const list = $('#budgetList');
    list.innerHTML = '';

    const visibleCats = state.budgetVisible[m][scopeId] || [];
    if (visibleCats.length === 0) {
      list.innerHTML = `<div class="muted">Chưa có budget nào cho scope này. Bấm “Budget mặc định”, hoặc “Copy từ All” (nếu có).</div>`;
      renderBudgetAddCatOptions(m, scopeId);
      return;
    }

    for (const cat of visibleCats) {
      const mode = isIncomeCategory(cat) ? 'income' : 'expense';
      const actual = (mode === 'income') ? (earnedMap.get(cat) || 0) : (spentMap.get(cat) || 0);
      const budget = parseMoney((state.budgetsV2[m][scopeId] || {})[cat] || 0);
      const ratio = budget > 0 ? actual / budget : 0;
      const pct = budget > 0 ? clamp(Math.round(ratio * 100), 0, 999) : 0;

      let barClass = 'good';
      if (budget <= 0) barClass = 'warn';
      else if (mode === 'expense') {
        if (ratio >= 1) barClass = 'bad';
        else if (ratio >= 0.8) barClass = 'warn';
      } else {
        if (ratio >= 1) barClass = 'good';
        else if (ratio >= 0.8) barClass = 'warn';
        else barClass = 'bad';
      }

      const metricLabel = mode === 'income' ? 'Earned' : 'Spent';
      const row = document.createElement('div');
      row.className = 'kpi';
      row.innerHTML = `
            <div class="row" style="justify-content:space-between; flex-wrap:wrap; gap:10px">
              <div style="font-weight:900">${escapeHtml(cat)}</div>
              <div class="row" style="gap:8px; flex-wrap:wrap">
                <span class="pill ${barClass} mono">${budget > 0 ? (pct + '%') : 'no budget'}</span>
                <span class="pill mono">${metricLabel}: ${fmtVND(actual)}</span>
                <span class="pill mono">Budget: ${fmtVND(budget)}</span>
                <span class="pill ${mode === 'income' ? 'good' : 'bad'}">${mode === 'income' ? 'Income target' : 'Expense cap'}</span>
              </div>
            </div>
            <div class="progress" aria-label="budget progress">
              <div class="bar ${barClass}" style="width:${budget > 0 ? clamp(ratio * 100, 0, 100) : 0}%"></div>
            </div>
            <div class="row" style="margin-top:10px; flex-wrap:wrap">
              <div class="field" style="flex:1; min-width:240px">
                <label>Set budget (VND)</label>
                <input class="input mono" data-bud-cat="${escapeAttr(cat)}" value="${budget ? fmtInputVND(budget) : ''}" placeholder="vd: 1.500.000" />
              </div>
              <button class="btn small" data-bud-save="${escapeAttr(cat)}" style="align-self:flex-end">💾 Save</button>
              <button class="btn small danger" data-bud-del="${escapeAttr(cat)}" style="align-self:flex-end">🗑️ Xoá</button>
            </div>
          `;
      list.appendChild(row);
    }

    renderBudgetAddCatOptions(m, scopeId);
  }

  $('#budgetMonth').addEventListener('change', () => renderAll());

  $('#budgetList').addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-bud-cat]');
    if (!inp) return;
    formatMoneyInput(inp);
  });

  $('#budgetList').addEventListener('click', (e) => {
    const saveBtn = e.target.closest('button[data-bud-save]');
    const delBtn = e.target.closest('button[data-bud-del]');
    if (!saveBtn && !delBtn) return;
    const cat = saveBtn ? saveBtn.dataset.budSave : delBtn.dataset.budDel;
    const m = $('#budgetMonth').value || filters.month || monthISO();
    const scopeId = getBudgetScope(m);
    ensureBudgetV2(m, scopeId);

    if (delBtn) {
      const scopeName = scopeId === BUDGET_SCOPE_ALL ? 'All accounts' : (getAccountById(scopeId)?.name || 'Account');
      const ok = confirm(`Xoá budget "${cat}" (${m} · ${scopeName})?`);
      if (!ok) return;

      if (state.budgetsV2[m]?.[scopeId]) delete state.budgetsV2[m][scopeId][cat];
      const vis = state.budgetVisible[m]?.[scopeId] || [];
      state.budgetVisible[m][scopeId] = vis.filter(x => norm(x) !== norm(cat));

      saveState();
      renderAll();
      toast('Đã xoá budget', cat);
      return;
    }

    const inp = $(`#budgetList input[data-bud-cat="${CSS.escape(cat)}"]`);
    const val = parseMoney(inp.value);
    state.budgetsV2[m][scopeId][cat] = val;

    // auto-add to visible if missing
    const vis = state.budgetVisible[m][scopeId] || [];
    if (!vis.some(x => norm(x) === norm(cat))) vis.push(cat);

    saveState();
    renderAll();
    toast('Saved budget', `${cat}: ${fmtVND(val)} (${m})`);
  });

  $('#btnInitBudgets').addEventListener('click', () => {
    const m = $('#budgetMonth').value || filters.month || monthISO();
    const scopeId = getBudgetScope(m);
    ensureBudgetV2(m, scopeId);

    // set visible = default categories only
    const vis = [];
    const seen = new Set();
    for (const c of DEFAULT_BUDGET_VISIBLE) {
      if (state.categories.includes(c) && !seen.has(norm(c))) {
        vis.push(c);
        seen.add(norm(c));
      }
    }
    state.budgetVisible[m][scopeId] = vis;

    // suggest values from current month
    const spentMap = sumByCategory(m, scopeId, 'expense');
    const earnedMap = sumByCategory(m, scopeId, 'income');
    for (const cat of vis) {
      if (state.budgetsV2[m][scopeId][cat] == null) {
        const mode = isIncomeCategory(cat) ? 'income' : 'expense';
        const actual = (mode === 'income') ? (earnedMap.get(cat) || 0) : (spentMap.get(cat) || 0);
        state.budgetsV2[m][scopeId][cat] = actual > 0 ? Math.round(actual * 1.1 / 1000) * 1000 : 0;
      }
    }

    saveState();
    renderAll();
    toast('Đã tạo budget mặc định', `Hiển thị: ${vis.join(', ')}`);
  });

  $('#btnCopyAllToScope')?.addEventListener('click', () => {
    const m = getBudgetMonth();
    const scopeId = getBudgetScope(m);
    if (scopeId === BUDGET_SCOPE_ALL) { toast('Chọn account', 'Nút này dùng khi đang chọn 1 account'); return; }

    ensureBudgetV2(m, BUDGET_SCOPE_ALL);
    ensureBudgetV2(m, scopeId);

    const allVis = (state.budgetVisible[m][BUDGET_SCOPE_ALL] || []).slice();
    if (allVis.length === 0) { toast('All accounts chưa có budget', 'Hãy tạo “Budget mặc định” cho All accounts trước'); return; }

    const scopeName = getAccountById(scopeId)?.name || 'Account';
    const ok = confirm(`Copy budget từ All accounts sang "${scopeName}"? (Các mục trùng tên sẽ ghi đè)`);
    if (!ok) return;

    state.budgetVisible[m][scopeId] = allVis.slice();

    const allBud = state.budgetsV2[m][BUDGET_SCOPE_ALL] || {};
    const dst = state.budgetsV2[m][scopeId] || (state.budgetsV2[m][scopeId] = {});
    for (const cat of allVis) dst[cat] = parseMoney(allBud[cat] || 0);

    saveState();
    renderAll();
    toast('Đã copy budget', `${scopeName} (${m})`);
  });


  $('#btnAddBudgetCat')?.addEventListener('click', () => {
    const m = $('#budgetMonth').value || filters.month || monthISO();
    const scopeId = getBudgetScope(m);
    const cat = $('#budgetAddCat')?.value;
    if (!cat) { toast('Chọn 1 mục', 'Bạn cần chọn category để thêm'); return; }
    ensureBudgetV2(m, scopeId);

    const vis = state.budgetVisible[m][scopeId] || (state.budgetVisible[m][scopeId] = []);
    if (!vis.some(x => norm(x) === norm(cat))) vis.push(cat);

    if (state.budgetsV2[m][scopeId][cat] == null) state.budgetsV2[m][scopeId][cat] = 0;
    saveState();
    renderAll();
    toast('Đã thêm budget mục', cat);
  });
  // ========= Accounts table =========
  function renderAccountsTable() {
    const { bal } = computeBalances();
    const tbody = $('#accTbody');
    tbody.innerHTML = "";
    for (const a of state.accounts) {
      const cur = bal.get(a.id) || 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:900">${escapeHtml(a.name)}</td>
        <td class="mono">${fmtVND(a.opening)}</td>
        <td class="mono" style="font-weight:900; color:${cur >= 0 ? 'var(--good)' : 'var(--bad)'}">${fmtVND(cur)}</td>
        <td>${a.note ? escapeHtml(a.note) : `<span class="muted">—</span>`}</td>
        <td>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn small" data-acc-act="edit" data-acc-id="${escapeAttr(a.id)}">✏️ Edit</button>
            <button class="btn small danger" data-acc-act="del" data-acc-id="${escapeAttr(a.id)}">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  $('#accTbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-acc-act]');
    if (!btn) return;
    const id = btn.dataset.accId;
    const act = btn.dataset.accAct;
    const a = state.accounts.find(x => x.id === id);
    if (!a) return;

    if (act === 'edit') openAccModal(a);
    if (act === 'del') deleteAccount(id);
  });

  // ========= Insights =========
  function renderInsights() {
    const m = filters.month || monthISO();
    $('#insMonthLabel').textContent = m;

    // top category spend
    const spend = spendByCategory(m);
    const top = [...spend.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      $('#topCatLabel').textContent = `${top[0]} · ${fmtVND(top[1])}`;
      const totalSpend = [...spend.values()].reduce((a, b) => a + b, 0);
      const pct = totalSpend > 0 ? Math.round(top[1] / totalSpend * 100) : 0;
      $('#topCatSub').textContent = `Chiếm ~${pct}% tổng chi tháng`;
    } else {
      $('#topCatLabel').textContent = "—";
      $('#topCatSub').textContent = "Chưa có expense trong tháng";
    }

    // tags
    const tags = collectTags(m);
    const wrap = $('#insTags');
    wrap.innerHTML = "";
    for (const [tag, n] of tags) {
      const el = document.createElement('span');
      el.className = "chip";
      el.textContent = `${tag} · ${n}`;
      el.style.cursor = "pointer";
      el.title = "Click để filter tag";
      el.addEventListener('click', () => {
        setTab('tx');
        $('#filterTag').value = tag;
        filters.tag = tag;
        renderAll();
      });
      wrap.appendChild(el);
    }

    // tips
    const ms = monthSummary(m);
    const { total } = computeBalances();
    const tipLines = [];
    tipLines.push(`• Net tháng: ${fmtVND(ms.net)} (Thu ${fmtVND(ms.income)} · Chi ${fmtVND(ms.expense)})`);
    tipLines.push(`• Tổng số dư hiện tại: ${fmtVND(total)}.`);
    if (ms.expense > ms.income) tipLines.push(`• Tháng này đang “âm dòng tiền”. Cân nhắc đặt budget cho 1–2 category lớn nhất.`);
    else tipLines.push(`• Dòng tiền ổn. Thử gắn tag mục tiêu (vd: saving, đầu tư) để theo dõi hiệu quả.`);
    $('#insTips').textContent = tipLines.join("\n");

    // chart net per day
    drawNetChart(m);
  }

  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  function drawNetChart(ym) {
    const canvas = $('#insCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, W, H);

    const days = daysInMonth(ym);
    const netByDay = Array.from({ length: days }, () => 0);

    for (const t of state.tx) {
      if (monthOf(t.date) !== ym) continue;
      const d = Number(t.date.slice(8, 10)) - 1;
      const amt = parseMoney(t.amount);
      if (t.type === 'income') netByDay[d] += amt;
      if (t.type === 'expense') netByDay[d] -= amt;
    }

    const maxAbs = Math.max(1, ...netByDay.map(x => Math.abs(x)));
    const pad = 18;
    const chartW = W - pad * 2;
    const chartH = H - pad * 2;
    const baseY = pad + chartH / 2;

    // axis line
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, baseY);
    ctx.lineTo(W - pad, baseY);
    ctx.stroke();

    const barW = chartW / days;
    for (let i = 0; i < days; i++) {
      const v = netByDay[i];
      const h = (Math.abs(v) / maxAbs) * (chartH / 2 - 6);
      const x = pad + i * barW + 1;
      const y = v >= 0 ? baseY - h : baseY;
      // color-ish via alpha only (no fixed palette)
      ctx.fillStyle = v >= 0 ? "rgba(61,220,151,0.70)" : "rgba(255,107,107,0.70)";
      ctx.fillRect(x, y, Math.max(1, barW - 2), h);
    }

    // label
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(`Net/day — ${ym} (scale ~ ${fmtVND(maxAbs)})`, pad, 14);
  }

  // ========= Modals: transactions =========
  let editingTxId = null;

  function openTxModal(tx = null) {
    editingTxId = tx?.id || null;
    $('#txModalTitle').textContent = tx ? "✏️ Sửa giao dịch" : "➕ Thêm giao dịch";
    $('#btnDeleteTx').style.display = tx ? "" : "none";
    $('#btnDuplicateTx').style.display = tx ? "" : "none";

    $('#txDate').value = tx?.date || todayISO();
    $('#txType').value = tx?.type || 'expense';
    $('#txAmount').value = tx ? fmtInputVND(tx.amount) : "";
    $('#txCategory').value = tx?.category || state.categories[0] || "Khác";
    $('#txTags').value = tx?.tags?.join(", ") || "";
    $('#txNote').value = tx?.note || "";
    $('#txRef').value = tx?.ref || "";

    // accounts
    $('#txAccount').value = tx?.accountId || (state.accounts[0]?.id || "");
    $('#txFrom').value = tx?.fromId || (state.accounts[0]?.id || "");
    $('#txTo').value = tx?.toId || (state.accounts[1]?.id || state.accounts[0]?.id || "");

    syncTxTypeUI();
    $('#txModal').classList.add('show');
  }

  function closeTxModal() {
    $('#txModal').classList.remove('show');
    editingTxId = null;
  }

  function syncTxTypeUI() {
    const type = $('#txType').value;
    const isTransfer = type === 'transfer';
    $('#fieldAccountFrom').style.display = isTransfer ? "none" : "";
    $('#fieldTransferFrom').style.display = isTransfer ? "" : "none";
    $('#fieldTransferTo').style.display = isTransfer ? "" : "none";
  }

  $('#txType').addEventListener('change', syncTxTypeUI);
  $('#btnAddTx').addEventListener('click', () => {
    setTab('tx');
    if (state.accounts.length === 0) {
      toast("Chưa có account", "Hãy tạo account trước (Cash/Bank...)");
      openAccModal(null);
      return;
    }
    openTxModal(null);
  });
  $('#btnCloseTxModal').addEventListener('click', closeTxModal);
  $('#btnCancelTx').addEventListener('click', closeTxModal);

  $('#btnSaveTx').addEventListener('click', () => {
    const type = $('#txType').value;
    const date = $('#txDate').value || todayISO();
    const amount = Math.abs(parseMoney($('#txAmount').value));
    const category = $('#txCategory').value || "Khác";
    const tags = splitTags($('#txTags').value);
    const note = String($('#txNote').value || "");
    const ref = String($('#txRef').value || "");

    if (!amount || amount <= 0) {
      toast("Thiếu amount", "Nhập số tiền > 0");
      return;
    }

    const now = new Date().toISOString();
    const base = {
      date, type, amount, category, tags, note, ref,
      updatedAt: now
    };

    if (type === 'transfer') {
      const fromId = $('#txFrom').value;
      const toId = $('#txTo').value;
      if (!fromId || !toId || fromId === toId) {
        toast("Transfer không hợp lệ", "From và To phải khác nhau");
        return;
      }
      base.fromId = fromId;
      base.toId = toId;
      base.accountId = undefined;
    } else {
      const accountId = $('#txAccount').value;
      if (!accountId) {
        toast("Thiếu account", "Chọn account cho giao dịch");
        return;
      }
      base.accountId = accountId;
      base.fromId = undefined;
      base.toId = undefined;
    }

    if (editingTxId) {
      const idx = state.tx.findIndex(x => x.id === editingTxId);
      if (idx >= 0) {
        state.tx[idx] = { ...state.tx[idx], ...base };
      }
      toast("Đã cập nhật", `Giao dịch ${editingTxId.slice(0, 6)}...`);
    } else {
      state.tx.push({
        id: uid(),
        createdAt: now,
        ...base
      });
      toast("Đã thêm giao dịch", `${type} · ${fmtVND(amount)}`);
    }

    saveState();
    closeTxModal();
    renderAll();
  });

  $('#btnDeleteTx').addEventListener('click', () => {
    if (!editingTxId) return;
    deleteTx(editingTxId);
    closeTxModal();
  });

  $('#btnDuplicateTx').addEventListener('click', () => {
    if (!editingTxId) return;
    const t = state.tx.find(x => x.id === editingTxId);
    if (!t) return;
    duplicateTx(t);
    closeTxModal();
  });

  function deleteTx(id) {
    const before = state.tx.length;
    state.tx = state.tx.filter(x => x.id !== id);
    saveState();
    renderAll();
    toast("Đã xoá", before !== state.tx.length ? `Tx ${id.slice(0, 6)}...` : "Không tìm thấy");
  }

  function duplicateTx(t) {
    const now = new Date().toISOString();
    const copy = { ...t, id: uid(), createdAt: now, updatedAt: now };
    state.tx.push(copy);
    saveState();
    renderAll();
    toast("Đã duplicate", `${t.type} · ${fmtVND(t.amount)}`);
  }

  // ========= Modals: accounts =========
  let editingAccId = null;

  function openAccModal(acc = null) {
    editingAccId = acc?.id || null;
    $('#accModalTitle').textContent = acc ? "✏️ Sửa account" : "🏦 Thêm account";
    $('#btnDeleteAcc').style.display = acc ? "" : "none";

    $('#accName').value = acc?.name || "";
    $('#accOpening').value = acc ? fmtInputVND(acc.opening) : "";
    $('#accNote').value = acc?.note || "";

    $('#accModal').classList.add('show');
  }
  // format money inputs (thêm dấu chấm mỗi 3 số)
  $('#txAmount')?.addEventListener('input', () => formatMoneyInput($('#txAmount')));
  $('#accOpening')?.addEventListener('input', () => formatMoneyInput($('#accOpening')));

  function closeAccModal() {
    $('#accModal').classList.remove('show');
    editingAccId = null;
  }

  const btnAddAccount = $('#btnAddAccount');
  if (btnAddAccount) btnAddAccount.addEventListener('click', () => openAccModal(null));
  $('#btnCloseAccModal').addEventListener('click', closeAccModal);
  $('#btnCancelAcc').addEventListener('click', closeAccModal);

  $('#btnSaveAcc').addEventListener('click', () => {
    const name = String($('#accName').value || "").trim();
    const opening = parseMoney($('#accOpening').value);
    const note = String($('#accNote').value || "");
    if (!name) {
      toast("Thiếu name", "Nhập tên account");
      return;
    }
    const now = new Date().toISOString();

    if (editingAccId) {
      const idx = state.accounts.findIndex(a => a.id === editingAccId);
      if (idx >= 0) {
        state.accounts[idx] = { ...state.accounts[idx], name, opening, note };
        toast("Đã cập nhật account", name);
      }
    } else {
      state.accounts.push({ id: uid(), name, opening, note, createdAt: now });
      toast("Đã thêm account", name);
    }
    saveState();
    closeAccModal();
    renderAll();
  });

  $('#btnDeleteAcc').addEventListener('click', () => {
    if (!editingAccId) return;
    deleteAccount(editingAccId);
    closeAccModal();
  });

  function deleteAccount(id) {
    // Prevent delete if used in any tx
    const used = state.tx.some(t => t.accountId === id || t.fromId === id || t.toId === id);
    const acc = getAccountById(id);
    if (!acc) return;

    if (used) {
      toast("Không thể xoá", "Account đang được dùng trong giao dịch. Hãy đổi giao dịch trước.");
      return;
    }

    state.accounts = state.accounts.filter(a => a.id !== id);
    saveState();
    renderAll();
    toast("Đã xoá account", acc.name);
  }

  // ========= DB/Import/Reset =========
  $('#btnDbFile').addEventListener('click', () => pickDbFileFlow());

  $('#btnImport').addEventListener('click', () => importFromOtherFileFlow());

  // fallback input (nếu trình duyệt không hỗ trợ file picker)
  $('#fileImport').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importFromOtherFileFlow(file);
    e.target.value = "";
  });

  $('#btnReset').addEventListener('click', async () => {
    const ok = confirm("Reset sẽ xoá toàn bộ dữ liệu hiện tại (và ghi lại vào DB file nếu đã chọn). Bạn chắc chứ?");
    if (!ok) return;

    state = makeEmptyState();
    saveState();
    await saveToDbNow(); // flush ngay nếu đang dùng DB file
    renderAll();
    toast("Đã reset", "Dữ liệu đã về 0₫ (trống hoàn toàn)");
  });

  // ========= Escape helpers =========
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ========= Global render =========
  function renderAll() {
    renderOptions();
    renderSidebar();
    renderTxTable();
    renderBudgets();
    renderAccountsTable();
    renderInsights();
  }

  // ========= Init =========
  function init() {
    initFilters();
    migrateBudgetsToAll();
    // (migration is in-memory; will persist on next save)
    renderOptions();

    // Ensure month default if empty
    if (!filters.month) filters.month = monthISO();
    $('#filterMonth').value = filters.month;
    $('#budgetMonth').value = filters.month;

    // Bind quick access
    document.addEventListener('keydown', (e) => {
      if (e.key === "Escape") {
        closeTxModal();
        closeAccModal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('#globalSearch').focus();
      }
    });

    updateStorageBadge();
    initDbAuto();

    renderAll();
  }

  init();
})();