(function () {
  const LB = window.LogBeautifier;

  LB.$ = (sel, root = document) => root.querySelector(sel);
  LB.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- helpers ----------
  LB.escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));

  LB.copyToClipboard = async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
      }
      LB.showTemporaryAlert("✅ Copied to clipboard!", 3000);
    } catch (e) {
      LB.showTemporaryAlert("⚠️ Copy failed: " + e.message, 3000);
    }
  };

  LB.showTemporaryAlert = function showTemporaryAlert(message, duration = 3000) {
    const alertDiv = document.createElement("div");
    alertDiv.textContent = message;
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1f2937;
        color: #e5e7eb;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: inherit;
        font-size: 14px;
        border: 1px solid #374151;
        animation: slideIn 0.3s ease-out;
      `;

    if (!document.querySelector("#temp-alert-styles")) {
      const style = document.createElement("style");
      style.id = "temp-alert-styles";
      style.textContent = `
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
          }
        `;
      document.head.appendChild(style);
    }

    document.body.appendChild(alertDiv);

    setTimeout(() => {
      alertDiv.style.animation = "slideOut 0.3s ease-in";
      setTimeout(() => {
        if (alertDiv.parentNode) {
          alertDiv.parentNode.removeChild(alertDiv);
        }
      }, 300);
    }, duration);
  };
})();
