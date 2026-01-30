(function () {
  const PJ = (window.PJ = window.PJ || {});

  function sortKeysRecursively(obj, order = "asc") {
    if (Array.isArray(obj)) {
      return obj.map((item) => sortKeysRecursively(item, order));
    }
    if (obj && typeof obj === "object" && obj.constructor === Object) {
      const keys = Object.keys(obj).sort((a, b) => (order === "asc" ? a.localeCompare(b) : b.localeCompare(a)));
      const result = {};
      keys.forEach((k) => (result[k] = sortKeysRecursively(obj[k], order)));
      return result;
    }
    return obj;
  }

  function updateSortButtonLabel(ctx, state) {
    const btn = ctx.btnSortAZ;
    if (!btn) return;
    if (state.sortState === 0) {
      btn.textContent = "🔠 Sort A–Z";
      btn.title = "Nhấn để sắp xếp A → Z";
    } else if (state.sortState === 1) {
      btn.textContent = "🔡 Sort Z–A";
      btn.title = "Nhấn để sắp xếp Z → A";
    } else {
      btn.textContent = "↩️ Restore";
      btn.title = "Nhấn để khôi phục dữ liệu gốc";
    }
  }

  function cycleSort(ctx, state) {
    const raw = ctx.input.value.trim();
    if (!raw) return;

    let data = JSON.parse(PJ.normalize.normalizeJson(raw));

    if (state.sortState === 0) {
      state.originalJson = data;
      data = sortKeysRecursively(data, "asc");
      state.sortState = 1;
    } else if (state.sortState === 1) {
      data = sortKeysRecursively(data, "desc");
      state.sortState = 2;
    } else {
      if (state.originalJson) {
        data = state.originalJson;
        state.sortState = 0;
      } else {
        return;
      }
    }

    // Render tree without changing input
    ctx.tree.innerHTML = "";
    ctx.tree.appendChild(PJ.tree.buildTree(data));

    const base = JSON.stringify(data, null, 2);
    ctx.pretty.textContent = state.unquoteKeys ? PJ.app.removeQuotesFromKeys(base) : base;

    updateSortButtonLabel(ctx, state);
    PJ.dom.setPill(ctx.err, ""); // clear error if any
    PJ.search.applySearch(ctx, state); // keep search highlight after sorting
  }

  PJ.sort = { sortKeysRecursively, updateSortButtonLabel, cycleSort };
})();