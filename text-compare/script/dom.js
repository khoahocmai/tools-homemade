(function () {
  const TC = (window.TextCompare = window.TextCompare || {});

  TC.$ = (id) => document.getElementById(id);
  TC.q = (sel, root) => (root || document).querySelector(sel);
  TC.qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  TC.normalizeLineEndings = function normalizeLineEndings(str) {
    return String(str || "").replace(/\r\n|\r/g, "\n");
  };

  // Insert plain text at current caret position in a contenteditable element.
  TC.insertPlainTextAtCursor = function insertPlainTextAtCursor(text) {
    const t = String(text ?? "");
    // Prefer execCommand for compatibility with contenteditable <pre>
    try {
      if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
        document.execCommand("insertText", false, t);
        return;
      }
    } catch (_) { }

    // Fallback: use Selection + Range
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(t));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  TC.getEditorText = function getEditorText(id) {
    const el = TC.$(id);
    return (el?.textContent ?? "").toString();
  };

  TC.setEditorText = function setEditorText(id, text) {
    const el = TC.$(id);
    if (!el) return;
    el.textContent = String(text ?? "");
  };
})();
