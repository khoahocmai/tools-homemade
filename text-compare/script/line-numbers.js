(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.updateLineNumbers = function updateLineNumbers(textId, lineNumbersId) {
    const el = TC.$(textId);
    const ln = TC.$(lineNumbersId);
    if (!el || !ln) return;

    const lines = TC.normalizeLineEndings(el.textContent).split("\n");
    const lineCount = Math.max(1, lines.length);

    let buf = "";
    for (let i = 1; i <= lineCount; i++) buf += i + "\n";
    ln.textContent = buf.slice(0, -1);
  };

  TC.syncScroll = function syncScroll(textId, lineNumbersId) {
    const el = TC.$(textId);
    const ln = TC.$(lineNumbersId);
    if (!el || !ln) return;
    ln.scrollTop = el.scrollTop;
  };
})();
