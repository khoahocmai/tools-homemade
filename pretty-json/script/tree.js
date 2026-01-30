(function () {
  const PJ = (window.PJ = window.PJ || {});
  const { escapeHtml, typeOf, setPill } = PJ.dom;

  function renderScalar(v) {
    const t = typeOf(v);
    if (t === "string") return `<span class="val-str">"${escapeHtml(v)}"</span>`;
    if (t === "number") return `<span class="val-num">${v}</span>`;
    if (t === "boolean") return `<span class="val-bool">${v}</span>`;
    if (t === "null") return `<span class="val-null">null</span>`;
    return `<span>${escapeHtml(String(v))}</span>`;
  }

  function buildTree(value, key = null, depth = 0) {
    const node = document.createElement("div");
    node.className = "node" + (depth === 0 ? " root" : "");
    const t = typeOf(value);
    const isContainer = t === "object" || t === "array";
    const childCount = isContainer ? (t === "array" ? value.length : Object.keys(value).length) : 0;

    const line = document.createElement("div");
    line.className = "line";

    const caret = document.createElement("span");
    caret.className = "caret" + (isContainer ? "" : " disabled");
    caret.textContent = isContainer ? "−" : "";
    caret.setAttribute("aria-label", isContainer ? "Collapse" : "Leaf");

    const label = document.createElement("span");
    label.className = "label";
    label.innerHTML =
      (key !== null ? `<span class="key" data-key="${escapeHtml(key)}">"${escapeHtml(key)}"</span>: ` : "") +
      (isContainer
        ? `<span class="type">${t}${t === "array" ? `[${childCount}]` : `{${childCount}}`}</span>`
        : renderScalar(value));

    // Attach metadata for search
    if (isContainer) {
      line._childKeys = t === "array" ? value.map((_, i) => String(i)) : Object.keys(value).map(String);
      line._nodeType = t;
    } else {
      line._childKeys = [];
      line._nodeType = "leaf";
    }

    line.appendChild(caret);
    line.appendChild(label);
    node.appendChild(line);

    if (isContainer) {
      const children = document.createElement("div");
      children.className = "children";

      const entries = t === "array" ? value.map((v, i) => [i, v]) : Object.entries(value);
      for (const [k, v] of entries) children.appendChild(buildTree(v, k, depth + 1));
      node.appendChild(children);

      caret.onclick = (ev) => {
        ev.stopPropagation();
        const hidden = children.classList.toggle("hidden");
        caret.textContent = hidden ? "+" : "−";
        caret.setAttribute("aria-label", hidden ? "Expand" : "Collapse");
      };
    }

    return node;
  }

  function openParentsOfLine(line) {
    let node = line?.closest(".node");
    while (node) {
      const parent = node.parentElement?.closest(".node");
      if (!parent) break;

      const children = parent.querySelector(":scope > .children");
      const caret = parent.querySelector(":scope > .line > .caret");
      if (children && children.classList.contains("hidden")) {
        children.classList.remove("hidden");
        if (caret) caret.textContent = "−";
      }
      node = parent;
    }
  }

  function expandAll(treeEl) {
    const nodes = treeEl.querySelectorAll(".node");
    nodes.forEach((n) => {
      const c = n.querySelector(":scope > .children");
      const caret = n.querySelector(":scope > .line > .caret");
      if (!c || !caret) return;
      c.classList.remove("hidden");
      caret.textContent = "−";
    });
  }

  function collapseToTopLevel(treeEl) {
    const rootChildren = treeEl.querySelector(".node.root > .children");
    if (rootChildren) rootChildren.classList.remove("hidden");

    const nodes = treeEl.querySelectorAll(".node:not(.root)");
    nodes.forEach((n) => {
      const c = n.querySelector(":scope > .children");
      const caret = n.querySelector(":scope > .line > .caret");
      if (!c || !caret) return;
      c.classList.add("hidden");
      caret.textContent = "+";
    });
  }

  function bindHoverAndLock(ctx, state) {
    const { tree, childInfo } = ctx;

    function updateChildCount(line) {
      if (!line) { setPill(childInfo, ""); return; }
      const n = Array.isArray(line._childKeys) ? line._childKeys.length : 0;
      setPill(childInfo, `Con trực tiếp: ${n}`);
    }

    tree.addEventListener("mouseover", (e) => {
      if (state.lockedLine) return;
      const line = e.target.closest(".line");
      if (!line || !tree.contains(line)) return;
      updateChildCount(line);
    });

    tree.addEventListener("click", (e) => {
      const keyEl = e.target.closest(".key");
      if (!keyEl) return;
      const line = keyEl.closest(".line");
      if (!line || !tree.contains(line)) return;
      if (line._nodeType === "leaf") return;

      const node = line.parentElement;
      if (state.lockedLine === line) {
        line.classList.remove("selected");
        node.classList.remove("selected-subtree");
        state.lockedLine = null;
        state.lockedNode = null;
        setPill(childInfo, "");
      } else {
        if (state.lockedLine) state.lockedLine.classList.remove("selected");
        if (state.lockedNode) state.lockedNode.classList.remove("selected-subtree");
        state.lockedLine = line;
        state.lockedNode = node;
        line.classList.add("selected");
        node.classList.add("selected-subtree");
        updateChildCount(line);
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!state.lockedLine) return;
      state.lockedLine.classList.remove("selected");
      state.lockedLine = null;
      if (state.lockedNode) {
        state.lockedNode.classList.remove("selected-subtree");
        state.lockedNode = null;
      }
      setPill(childInfo, "");
    });
  }

  PJ.tree = { buildTree, renderScalar, openParentsOfLine, expandAll, collapseToTopLevel, bindHoverAndLock };
})();