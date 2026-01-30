(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.displayDetailedDiffRows = function displayDetailedDiffRows(diffResult, containerId) {
    const container = TC.$(containerId);
    if (!container) return;
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "diff-rows";

    for (let i = 0; i < diffResult.length; i++) {
      const item = diffResult[i];

      const row = document.createElement("div");
      row.className = "diff-row";

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(i + 1);

      const content = document.createElement("div");
      content.className = "content";

      if (item.type === "modified") {
        content.innerHTML = item.content;
        content.classList.add("modified");
      } else if (item.type === "added") {
        content.textContent = item.content;
        content.classList.add("added");
      } else if (item.type === "removed") {
        content.textContent = item.content;
        content.classList.add("removed");
      } else if (item.type === "missing") {
        content.innerHTML = "&nbsp;";
        content.classList.add("missing");
      } else {
        content.textContent = item.content;
        content.classList.add("unchanged");
      }

      row.appendChild(num);
      row.appendChild(content);
      wrapper.appendChild(row);
    }

    container.appendChild(wrapper);
  };

  TC.syncAllRowHeights = function syncAllRowHeights() {
    const rows1 = document.querySelectorAll("#diff1 .diff-row");
    const rows2 = document.querySelectorAll("#diff2 .diff-row");

    const rowCount = Math.min(rows1.length, rows2.length);
    for (let i = 0; i < rowCount; i++) {
      const c1 = rows1[i].querySelector(".content");
      const c2 = rows2[i].querySelector(".content");
      if (!c1 || !c2) continue;

      c1.style.minHeight = "";
      c2.style.minHeight = "";

      const h1 = c1.offsetHeight;
      const h2 = c2.offsetHeight;

      if (Math.abs(h1 - h2) > 1) {
        const maxH = Math.max(h1, h2);
        c1.style.minHeight = maxH + "px";
        c2.style.minHeight = maxH + "px";
      }
    }
  };

  TC.syncAllRowHeightsSoon = function syncAllRowHeightsSoon() {
    requestAnimationFrame(() => requestAnimationFrame(TC.syncAllRowHeights));
  };

  let diffResizeObserver;
  TC.attachDiffObservers = function attachDiffObservers() {
    if (diffResizeObserver) diffResizeObserver.disconnect();
    diffResizeObserver = new ResizeObserver(() => TC.syncAllRowHeightsSoon());
    document.querySelectorAll("#diff1 .content, #diff2 .content").forEach((el) => diffResizeObserver.observe(el));
  };
})();
