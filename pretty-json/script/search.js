(function () {
  const PJ = (window.PJ = window.PJ || {});
  const { setPill, toggleShow } = PJ.dom;

  function clearMarks(el) {
    if (!el) return;
    el.querySelectorAll("mark.mark").forEach((m) => {
      const textNode = document.createTextNode(m.textContent || "");
      m.replaceWith(textNode);
    });
    el.normalize();
  }

  function highlightText(el, re) {
    if (!el) return;
    const reLocal = new RegExp(re.source, re.flags);

    const walker = document.createNodeIterator(el, NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let n; (n = walker.nextNode());) texts.push(n);

    texts.forEach((node) => {
      const s = node.nodeValue;
      if (!s) return;
      reLocal.lastIndex = 0;
      if (!reLocal.test(s)) return;
      reLocal.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = reLocal.exec(s))) {
        if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        const mark = document.createElement("mark");
        mark.className = "mark";
        mark.textContent = m[0];
        frag.appendChild(mark);
        last = m.index + m[0].length;
      }
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    });
  }

  function isElementInViewport(el) {
    if (!el) return true;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }

  function syncSearchUIFromFlags(ctx, state) {
    const setBtn = (btn, on, textOn, textOff, titleOn, titleOff) => {
      if (!btn) return;
      btn.classList.toggle("active", !!on);
      btn.textContent = on ? textOn : textOff;
      btn.title = on ? titleOn : titleOff;
    };

    setBtn(ctx.optCase, state.searchFlags.case, "Aa*", "Aa", "Phân biệt HOA/thường", "Không phân biệt HOA/thường");
    setBtn(ctx.optCase2, state.searchFlags.case, "Aa*", "Aa", "Phân biệt HOA/thường", "Không phân biệt HOA/thường");

    setBtn(ctx.optWhole, state.searchFlags.whole, "🔍*", "🔍", "Tìm kiếm chính xác", "Tìm kiếm không chính xác");
    setBtn(ctx.optWhole2, state.searchFlags.whole, "🔍*", "🔍", "Tìm kiếm chính xác", "Tìm kiếm không chính xác");
  }

  function updateNavButtons(ctx, state) {
    const has = state.searchHits.length > 0;
    if (ctx.navHits) ctx.navHits.style.display = has ? "flex" : "none";
    if (has) setPill(ctx.rc, `Kết quả: ${state.searchHits.length} (${state.currentHitIndex + 1}/${state.searchHits.length})`);
    else setPill(ctx.rc, "");
  }

  function focusHit(ctx, state, i, smooth = false) {
    if (i < 0 || i >= state.searchHits.length) return;
    ctx.tree.querySelectorAll(".hit-focus").forEach((n) => n.classList.remove("hit-focus"));
    const line = state.searchHits[i];
    PJ.tree.openParentsOfLine(line);
    line.classList.add("hit-focus");
    line.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
    state.currentHitIndex = i;
    setPill(ctx.rc, `Kết quả: ${state.searchHits.length} (${state.currentHitIndex + 1}/${state.searchHits.length})`);
    updateFloatingNav(ctx, state);
  }

  function updateFloatingNav(ctx, state) {
    const barVisible = isElementInViewport(ctx.resultSearchBar);
    const q = (ctx.search.value || "").trim();
    const show = !!q && !barVisible;

    if (!ctx.searchFloat) return;
    ctx.searchFloat.style.display = show ? "grid" : "none";
    ctx.searchFloat.setAttribute("aria-hidden", show ? "false" : "true");
    if (!show) return;

    // sync text
    if (ctx.search2 && ctx.search2.value !== ctx.search.value) {
      ctx.search2.value = ctx.search.value;
      toggleShow(ctx.btnClearSearch2, !!ctx.search2.value.trim());
    }

    syncSearchUIFromFlags(ctx, state);

    if (ctx.floatCounter) {
      const has = state.searchHits.length > 0;
      const cur = has ? (state.currentHitIndex + 1) : 0;
      ctx.floatCounter.textContent = `${cur}/${state.searchHits.length}`;
    }
  }

  function applySearch(ctx, state) {
    const q = (ctx.search.value || "").trim();
    const lines = ctx.tree.querySelectorAll(".node .line");

    // clear
    lines.forEach((n) => {
      n.classList.remove("hit", "hit-focus");
      const label = n.querySelector(".label");
      if (label) clearMarks(label);
    });

    state.searchHits = [];
    state.currentHitIndex = -1;
    updateNavButtons(ctx, state);

    if (!q) { updateFloatingNav(ctx, state); return; }

    // Special: [] or {}
    if (q === "[]" || q === "{}") {
      const want = q === "[]" ? "array" : "object";
      lines.forEach((line) => {
        if (line._nodeType === want && Array.isArray(line._childKeys) && line._childKeys.length === 0) {
          line.classList.add("hit");
          const t = line.querySelector(".type");
          if (t) t.innerHTML = `<mark class="mark">${t.textContent}</mark>`;
          PJ.tree.openParentsOfLine(line);
          state.searchHits.push(line);
        }
      });
      state.currentHitIndex = state.searchHits.length ? 0 : -1;
      updateNavButtons(ctx, state);
      if (state.searchHits.length) focusHit(ctx, state, 0, true);
      updateFloatingNav(ctx, state);
      return;
    }

    // Build regex
    let reTest = null, reHL = null;
    if (state.searchFlags.regex) {
      try {
        reTest = new RegExp(q, state.searchFlags.case ? "" : "i");
        reHL = new RegExp(q, state.searchFlags.case ? "g" : "gi");
      } catch {
        updateFloatingNav(ctx, state);
        return;
      }
    } else {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flagsHL = state.searchFlags.case ? "g" : "gi";

      if (state.searchFlags.whole) {
        // Modern engines: lookaround
        try {
          const pattern = `(?<![A-Za-z0-9_-])${safe}(?![A-Za-z0-9_-])`;
          reTest = new RegExp(pattern, state.searchFlags.case ? "" : "i");
          reHL = new RegExp(pattern, flagsHL);
        } catch {
          // Fallback without lookbehind
          const pattern = `(^|[^A-Za-z0-9_-])(${safe})(?![A-Za-z0-9_-])`;
          reTest = new RegExp(pattern, state.searchFlags.case ? "" : "i");
          reHL = new RegExp(pattern, flagsHL);
        }
      } else {
        reTest = new RegExp(safe, state.searchFlags.case ? "" : "i");
        reHL = new RegExp(safe, flagsHL);
      }
    }

    let count = 0;
    lines.forEach((line) => {
      const label = line.querySelector(".label");
      const keyText = label?.querySelector(".key")?.textContent || "";
      const valueText = label?.querySelector(".val-str, .val-num, .val-bool, .val-null")?.textContent || "";
      const haystack = keyText + " " + valueText;

      const reCheck = reTest ? new RegExp(reTest.source, reTest.flags.replace("g", "")) : null;
      const ok = reCheck ? reCheck.test(haystack) : haystack.toLowerCase().includes(q.toLowerCase());
      if (!ok) return;

      count++;
      line.classList.add("hit");

      if (label && reHL) {
        const targets = label.querySelectorAll(".key, .val-str, .val-num, .val-bool, .val-null");
        targets.forEach((el) => highlightText(el, reHL));
      }

      PJ.tree.openParentsOfLine(line);
      state.searchHits.push(line);
    });

    if (count) focusHit(ctx, state, 0, true);
    else { setPill(ctx.rc, ""); }

    updateNavButtons(ctx, state);
    updateFloatingNav(ctx, state);
  }

  function resetSearchFlags(ctx, state) {
    state.searchFlags = { case: false, whole: false };
    syncSearchUIFromFlags(ctx, state);
  }

  function bindSearchUI(ctx, state) {
    const { debounce, toggleShow } = PJ.dom;

    const debounced = debounce(() => applySearch(ctx, state), 300);

    ctx.search.addEventListener("input", () => {
      toggleShow(ctx.btnClearSearch, !!ctx.search.value.trim());
      debounced();
    });

    ctx.search.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      applySearch(ctx, state);
    });

    ctx.btnClearSearch?.addEventListener("click", () => {
      ctx.search.value = "";
      toggleShow(ctx.btnClearSearch, false);
      applySearch(ctx, state);
      ctx.search.focus({ preventScroll: true });
    });

    // Prev/Next on main bar
    if (!window.__PJ_navBound) {
      ctx.btnNextHit?.addEventListener("click", () => {
        if (!state.searchHits.length) return;
        const next = (state.currentHitIndex + 1) % state.searchHits.length;
        focusHit(ctx, state, next, true);
      });
      ctx.btnPrevHit?.addEventListener("click", () => {
        if (!state.searchHits.length) return;
        const prev = (state.currentHitIndex - 1 + state.searchHits.length) % state.searchHits.length;
        focusHit(ctx, state, prev, true);
      });
      window.__PJ_navBound = true;
    }

    // Toggle flags
    ctx.optCase?.addEventListener("click", () => {
      state.searchFlags.case = !state.searchFlags.case;
      syncSearchUIFromFlags(ctx, state);
      applySearch(ctx, state);
    });
    ctx.optWhole?.addEventListener("click", () => {
      state.searchFlags.whole = !state.searchFlags.whole;
      syncSearchUIFromFlags(ctx, state);
      applySearch(ctx, state);
    });

    // Floating search
    window.addEventListener("scroll", () => updateFloatingNav(ctx, state), { passive: true });
    window.addEventListener("resize", () => updateFloatingNav(ctx, state));

    ctx.search2?.addEventListener("input", () => {
      ctx.search.value = ctx.search2.value;
      toggleShow(ctx.btnClearSearch, !!ctx.search.value.trim());
      toggleShow(ctx.btnClearSearch2, !!ctx.search2.value.trim());
      debounced();
    });

    ctx.search2?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      ctx.search.value = ctx.search2.value;
      toggleShow(ctx.btnClearSearch, !!ctx.search.value.trim());
      toggleShow(ctx.btnClearSearch2, !!ctx.search2.value.trim());
      applySearch(ctx, state);
      updateFloatingNav(ctx, state);
    });

    ctx.btnClearSearch2?.addEventListener("click", () => {
      ctx.search.value = "";
      ctx.search2.value = "";
      toggleShow(ctx.btnClearSearch, false);
      toggleShow(ctx.btnClearSearch2, false);
      applySearch(ctx, state);
      updateFloatingNav(ctx, state);
      ctx.search2.focus({ preventScroll: true });
    });

    ctx.optCase2?.addEventListener("click", () => {
      state.searchFlags.case = !state.searchFlags.case;
      syncSearchUIFromFlags(ctx, state);
      applySearch(ctx, state);
      updateFloatingNav(ctx, state);
    });

    ctx.optWhole2?.addEventListener("click", () => {
      state.searchFlags.whole = !state.searchFlags.whole;
      syncSearchUIFromFlags(ctx, state);
      applySearch(ctx, state);
      updateFloatingNav(ctx, state);
    });

    // Floating expand/collapse
    const floatExpand = () => {
      if (!ctx.searchFloat) return;
      ctx.searchFloat.classList.remove("is-collapsed");
      ctx.searchFloat.classList.add("is-expanded");
    };
    const floatCollapse = () => {
      if (!ctx.searchFloat) return;
      if (document.activeElement === ctx.search2) return;
      ctx.searchFloat.classList.remove("is-expanded");
      ctx.searchFloat.classList.add("is-collapsed");
    };

    ctx.searchFloat?.addEventListener("mouseenter", floatExpand);
    ctx.searchFloat?.addEventListener("mouseleave", floatCollapse);

    ctx.floatHandle?.addEventListener("click", () => {
      const expanded = ctx.searchFloat.classList.contains("is-expanded");
      if (expanded) floatCollapse();
      else { floatExpand(); ctx.search2?.focus({ preventScroll: true }); }
    });

    ctx.search2?.addEventListener("focus", floatExpand);
    ctx.search2?.addEventListener("blur", () => setTimeout(floatCollapse, 120));

    ctx.floatNext?.addEventListener("click", () => {
      if (!state.searchHits.length) return;
      const next = (state.currentHitIndex + 1) % state.searchHits.length;
      focusHit(ctx, state, next, true);
    });
    ctx.floatPrev?.addEventListener("click", () => {
      if (!state.searchHits.length) return;
      const prev = (state.currentHitIndex - 1 + state.searchHits.length) % state.searchHits.length;
      focusHit(ctx, state, prev, true);
    });

    // initial sync
    syncSearchUIFromFlags(ctx, state);
  }

  PJ.search = { applySearch, focusHit, updateNavButtons, updateFloatingNav, bindSearchUI, resetSearchFlags, syncSearchUIFromFlags };
})();