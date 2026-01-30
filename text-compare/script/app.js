(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.updateStatistics = function updateStatistics(stats, rawText1, rawText2) {
    TC.$("addedCount").textContent = String(stats.added);
    TC.$("removedCount").textContent = String(stats.removed);
    TC.$("modifiedCount").textContent = String(stats.modified);

    const similarity = TC.similarityPercentByLevenshtein(rawText1, rawText2);
    TC.$("similarityPercent").textContent = similarity + "%";
  };

  TC.clearAll = function clearAll() {
    TC.setEditorText("text1", "");
    TC.setEditorText("text2", "");

    TC.$("diff1").innerHTML = "";
    TC.$("diff2").innerHTML = "";

    TC.$("addedCount").textContent = "0";
    TC.$("removedCount").textContent = "0";
    TC.$("modifiedCount").textContent = "0";
    TC.$("similarityPercent").textContent = "0%";

    TC.$("legend").style.display = "none";
    TC.$("results").style.display = "none";
    TC.$("stats").style.display = "none";

    // Reset row heights
    document.querySelectorAll("#diff1 .content, #diff2 .content").forEach((c) => (c.style.minHeight = ""));
    TC.updateLineNumbers("text1", "lineNumbers1");
    TC.updateLineNumbers("text2", "lineNumbers2");
  };

  TC.compareTexts = function compareTexts() {
    const raw1 = TC.getEditorText("text1").trim();
    const raw2 = TC.getEditorText("text2").trim();

    const text1 = TC.normalizeJson(raw1);
    const text2 = TC.normalizeJson(raw2);

    let isError = false;
    for (const id of ["text1", "text2"]) {
      const el = TC.$(id);
      if (!TC.getEditorText(id).trim()) {
        el.classList.add("error");
        isError = true;
      } else {
        el.classList.remove("error");
      }
    }
    if (isError) {
      TC.$("legend").style.display = "none";
      TC.$("results").style.display = "none";
      TC.$("stats").style.display = "none";
      return;
    }

    // Identical
    if (text1 === text2) {
      const lines = text1.split("\n");
      const identical = lines.map((line) => ({ content: line, type: "unchanged" }));

      TC.displayDetailedDiffRows(identical, "diff1");
      TC.displayDetailedDiffRows(identical, "diff2");

      TC.updateStatistics({ added: 0, removed: 0, modified: 0, unchanged: lines.length }, raw1, raw2);

      TC.$("legend").style.display = "block";
      TC.$("results").style.display = "grid";
      TC.$("stats").style.display = "block";
      TC.$("legend").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const lines1 = text1.split("\n");
    const lines2 = text2.split("\n");

    const quick = TC.performSimpleLineDiff(lines1, lines2);

    TC.displayDetailedDiffRows(quick.result1, "diff1");
    TC.displayDetailedDiffRows(quick.result2, "diff2");

    TC.syncAllRowHeightsSoon();
    TC.attachDiffObservers();

    TC.updateStatistics(quick.stats, raw1, raw2);

    TC.$("legend").style.display = "block";
    TC.$("results").style.display = "grid";
    TC.$("stats").style.display = "block";
    TC.$("legend").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function attachEditorEvents() {
    // Paste plain text into contenteditable editors.
    TC.qa(".textarea-with-lines").forEach((el) => {
      el.addEventListener("paste", function (e) {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        TC.insertPlainTextAtCursor(text);
      });

      // Keep line numbers in sync
      el.addEventListener("input", () => {
        const id = el.id;
        if (id === "text1") TC.updateLineNumbers("text1", "lineNumbers1");
        if (id === "text2") TC.updateLineNumbers("text2", "lineNumbers2");
      });

      el.addEventListener("scroll", () => {
        const id = el.id;
        if (id === "text1") TC.syncScroll("text1", "lineNumbers1");
        if (id === "text2") TC.syncScroll("text2", "lineNumbers2");
      });
    });

    // Enter behavior: if focused in editor -> newline; else run compare
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;

      const active = document.activeElement;
      const inEditor = active && (active.id === "text1" || active.id === "text2");
      if (inEditor) {
        e.preventDefault();
        TC.insertPlainTextAtCursor("\n");
      } else {
        e.preventDefault();
        TC.compareTexts();
      }
    });
  }

  function attachButtons() {
    const btnCompare = TC.$("btnCompare");
    const btnExample = TC.$("btnExample");
    const btnExampleJson = TC.$("btnExampleJson");
    const btnClear = TC.$("btnClearAll");

    btnCompare?.addEventListener("click", () => TC.compareTexts());
    btnExample?.addEventListener("click", () => TC.pasteExample());
    btnExampleJson?.addEventListener("click", () => TC.pasteJsonExample());
    btnClear?.addEventListener("click", () => TC.clearAll());
  }

  function attachResizeSync() {
    window.addEventListener("resize", () => TC.syncAllRowHeightsSoon());
  }

  function initDefaults() {
    // Keep original default content (you can remove if you want empty start)
    TC.setEditorText(
      "text1",
      "Công nghệ trí tuệ nhân tạo (AI) đang thay đổi cách chúng ta làm việc hàng ngày. Nó giúp tự động hóa các tác vụ lặp lại và tối ưu hóa quy trình sản xuất. Hệ thống AI có thể phân tích dữ liệu nhanh chóng hơn con người."
    );
    TC.setEditorText(
      "text2",
      "Công nghệ trí tuệ nhân tạo (AI) đang thay đổi cách chúng ta làm việc hàng ngày. Nó giúp tự động hóa các tác vụ lặp lại và tối ưu hóa quy trình sản xuất. Công cụ AI có thể phân tích dữ liệu nhanh chóng và chính xác."
    );

    TC.updateLineNumbers("text1", "lineNumbers1");
    TC.updateLineNumbers("text2", "lineNumbers2");
  }

  // Expose legacy global functions for compatibility with older HTML (optional)
  window.compareTexts = TC.compareTexts;
  window.pasteExample = TC.pasteExample;
  window.pasteJsonExample = TC.pasteJsonExample;
  window.clearAll = TC.clearAll;
  window.updateLineNumbers = TC.updateLineNumbers;
  window.syncScroll = TC.syncScroll;

  // Boot
  TC.initThemeToggle();
  attachButtons();
  attachEditorEvents();
  attachResizeSync();
  initDefaults();
})();
