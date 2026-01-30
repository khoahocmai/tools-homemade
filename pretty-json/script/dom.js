(function () {
  const PJ = (window.PJ = window.PJ || {});
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function debounce(fn, ms = 200) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function typeOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  function setPill(el, txt) {
    if (!el) return;
    el.textContent = txt || "";
    el.classList.toggle("hide", !txt);
  }

  function toggleShow(el, show) {
    if (!el) return;
    el.classList.toggle("show", !!show);
  }

  async function copyText(t) {
    const text = String(t ?? "");
    if (!text) return;
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  function blobSize(text) {
    return new Blob([text]).size;
  }

  PJ.dom = { $, $$, debounce, escapeHtml, typeOf, setPill, toggleShow, copyText, blobSize };
})();