const getBtn = document.getElementById('getToken');
const tokenBox = document.getElementById('tokenBox');
const status = document.getElementById('status');

function shortToken(token) {
  return token.slice(0, 8) + "..." + token.slice(-6);
}

getBtn.addEventListener('click', async () => {

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const domain = new URL(tab.url).hostname;

  chrome.storage.local.get("tokens", async (result) => {

    const tokens = result.tokens || {};
    const tokenInfo = tokens[domain];

    if (!tokenInfo) {
      tokenBox.textContent = "No token for this domain";
      status.textContent = "❌ No token captured yet";
      return;
    }

    const { token, pageUrl, time } = tokenInfo;

    // ✅ Auto copy
    await navigator.clipboard.writeText(token);

    tokenBox.textContent = shortToken(token);

    status.innerHTML = `
      ✅ Copied<br>
      🌐 ${domain}<br>
      📄 ${pageUrl}<br>
      🕒 ${time}
    `;
  });
});