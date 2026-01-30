(function () {
  const PJ = (window.PJ = window.PJ || {});
  const { typeOf, escapeHtml } = PJ.dom;

  function computeStats(data, charLen, sizeBytes) {
    let keys = 0, obj = 0, arr = 0, elems = 0, depth = 0;
    let s = 0, n = 0, b = 0, nu = 0;

    (function walk(v, d) {
      depth = Math.max(depth, d);
      const t = typeOf(v);
      if (t === "object") {
        obj++;
        const ks = Object.keys(v);
        keys += ks.length;
        elems++;
        if (ks.length === 0) nu++;
        ks.forEach((k) => walk(v[k], d + 1));
      } else if (t === "array") {
        arr++;
        elems++;
        if (v.length === 0) nu++;
        v.forEach((x) => walk(x, d + 1));
      } else {
        elems++;
        if (t === "string") {
          if (v === "") nu++;
          else s++;
        } else if (t === "number") n++;
        else if (t === "boolean") b++;
        else if (t === "null") nu++;
      }
    })(data, 1);

    return { keys, obj, arr, elems, depth, sizeBytes, counts: { string: s, number: n, boolean: b, null: nu }, charLen };
  }

  function extractData(data) {
    const keyMap = new Map();

    const uniq = {
      string: new Map(), // value -> count
      number: new Map(),
      boolean: new Map(),
      null: new Map(),
    };
    const totals = { stringTotal: 0, numberTotal: 0, booleanTotal: 0, nullTotal: 0 };

    const add = (map, key) => map.set(key, (map.get(key) || 0) + 1);

    (function walk(v) {
      const t = typeOf(v);

      if (t === "object") {
        const ks = Object.keys(v);
        if (ks.length === 0) { totals.nullTotal++; add(uniq.null, "(empty-object)"); }
        ks.forEach((k) => {
          keyMap.set(k, (keyMap.get(k) || 0) + 1);
          walk(v[k]);
        });
      } else if (t === "array") {
        if (v.length === 0) { totals.nullTotal++; add(uniq.null, "(empty-array)"); }
        else v.forEach(walk);
      } else if (t === "string") {
        if (v === "") { totals.nullTotal++; add(uniq.null, "(empty)"); }
        else { totals.stringTotal++; add(uniq.string, v); }
      } else if (t === "number") {
        totals.numberTotal++; add(uniq.number, String(v));
      } else if (t === "boolean") {
        totals.booleanTotal++; add(uniq.boolean, v ? "true" : "false");
      } else if (t === "null") {
        totals.nullTotal++; add(uniq.null, "null");
      }
    })(data);

    const listify = (m, num = false) =>
      Array.from(m.entries()).sort((a, b) => (num ? Number(a[0]) - Number(b[0]) : String(a[0]).localeCompare(String(b[0]))));

    return {
      keys: Array.from(keyMap.entries()).sort((a, b) => b[1] - a[1]),
      uniques: {
        string: listify(uniq.string),
        number: listify(uniq.number, true),
        boolean: listify(uniq.boolean),
        null: listify(uniq.null),
      },
      totals,
    };
  }

  function renderStats(ctx, st) {
    ctx.statsPills.innerHTML = "";
    if (!st) return;

    const add = (txt) => {
      const span = document.createElement("span");
      span.className = "pill";
      span.textContent = txt;
      ctx.statsPills.appendChild(span);
    };

    add(`Tổng khóa: ${st.keys.toLocaleString()}`);
    add(`Objects: ${st.obj.toLocaleString()}`);
    add(`Arrays: ${st.arr.toLocaleString()}`);
    add(`Phần tử: ${st.elems.toLocaleString()}`);
    add(`Độ sâu tối đa: ${st.depth}`);
    add(`Kích thước: ~${st.sizeBytes.toLocaleString()} B`);
    add(`string: ${st.counts.string}`);
    add(`number: ${st.counts.number}`);
    add(`boolean: ${st.counts.boolean}`);
    add(`null: ${st.counts.null}`);
  }

  function renderLists(ctx, ex, state) {
    // clear
    [ctx.listStrings, ctx.listNumbers, ctx.listBooleans, ctx.listNulls].forEach((el) => el && (el.innerHTML = ""));

    const setHead = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    if (!ex) {
      setHead("headBool", "Boolean (tổng 0)");
      setHead("headNull", "Null (tổng 0)");
      setHead("headString", "String (tổng 0)");
      setHead("headNumber", "Number (tổng 0)");
      ctx.keysList.innerHTML = "";
      return;
    }

    setHead("headBool", `Boolean (tổng ${ex.totals.booleanTotal})`);
    setHead("headNull", `Null (tổng ${ex.totals.nullTotal})`);
    setHead("headString", `String (tổng ${ex.totals.stringTotal})`);
    setHead("headNumber", `Number (tổng ${ex.totals.numberTotal})`);

    const mkTags = (arr, cls) =>
      arr
        .map(([v, c]) => `<span class="tag ${cls}" data-q="${escapeHtml(v)}">${escapeHtml(v)} <span class="small">×${c}</span></span>`)
        .join("");

    ctx.listBooleans.innerHTML = mkTags(ex.uniques.boolean, "boolean");
    ctx.listNulls.innerHTML = mkTags(ex.uniques.null, "null");

    const mkLines = (arr, cls) =>
      arr
        .map(([v, c]) => `<span class="val-item ${cls}" data-q="${escapeHtml(v)}" title="${escapeHtml(v)}">${escapeHtml(v)} <span class="small">×${c}</span></span>`)
        .join("");

    ctx.listStrings.innerHTML = mkLines(ex.uniques.string, "string");
    ctx.listNumbers.innerHTML = mkLines(ex.uniques.number, "number");

    // Click on values -> search
    const wireClick = (root) =>
      root.addEventListener("click", (e) => {
        const x = e.target.closest("[data-q]");
        if (!x) return;
        let q = x.getAttribute("data-q");

        // map (empty) -> "" để khớp hiển thị trong cây
        if (q === "(empty)") q = '""';
        else if (q === "(empty-array)") q = "[]";
        else if (q === "(empty-object)") q = "{}";

        ctx.search.value = q;
        PJ.dom.toggleShow(ctx.btnClearSearch, !!q.trim());
        PJ.search.applySearch(ctx, state);
        ctx.search.focus({ preventScroll: true });
      });

    [ctx.listBooleans, ctx.listNulls, ctx.listStrings, ctx.listNumbers].forEach((el) => el && wireClick(el));

    // Key list
    ctx.keysList.innerHTML = ex.keys
      .map(([k, c]) => `<span class="pill key-pill" data-key="${escapeHtml(k)}">${escapeHtml(k)} <span class="small">×${c}</span></span>`)
      .join("");

    ctx.keysList.onclick = (e) => {
      const it = e.target.closest(".pill");
      if (!it) return;

      ctx.search.value = it.dataset.key;

      // bật whole-match khi click key
      state.searchFlags.whole = true;
      PJ.search.syncSearchUIFromFlags(ctx, state);

      PJ.dom.toggleShow(ctx.btnClearSearch, !!ctx.search.value.trim());
      PJ.search.applySearch(ctx, state);
      ctx.search.focus({ preventScroll: true });
    };
  }

  PJ.stats = { computeStats, extractData, renderStats, renderLists };
})();