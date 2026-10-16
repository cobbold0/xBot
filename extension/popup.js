const urlInput = document.getElementById('justbotUrl');
const syncBtn = document.getElementById('syncBtn');
const qrBtn = document.getElementById('qrBtn');
const copyBtn = document.getElementById('copyBtn');
const qrBox = document.getElementById('qrBox');
const qrSvgContainer = document.getElementById('qrSvgContainer');
const qrCodeText = document.getElementById('qrCodeText');
const statusEl = document.getElementById('status');

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = ok ? 'ok' : 'err';
}

async function init() {
  try {
    const stored = await chrome.storage.local.get('justbotUrl');
    if (stored.justbotUrl) {
      urlInput.value = stored.justbotUrl;
    }
  } catch (err) {
    console.error('Failed to load stored URL', err);
  }
}

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  showStatus('Signing in with X session...', true);
  try {
    const baseUrl = urlInput.value.trim() || 'https://xbot.cobbold.dev';
    const res = await chrome.runtime.sendMessage({ type: 'SYNC_TO_JUSTBOT', baseUrl });
    if (res?.ok) {
      showStatus(`Signed in as @${res.username}! Opening JustBot...`, true);
      await chrome.tabs.create({ url: res.baseUrl || baseUrl });
    } else {
      showStatus(res?.error || 'Could not sign in.', false);
    }
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'Sign-in failed', false);
  } finally {
    syncBtn.disabled = false;
  }
});

qrBtn.addEventListener('click', async () => {
  qrBtn.disabled = true;
  showStatus('Generating mobile login QR code...', true);
  try {
    const baseUrl = urlInput.value.trim() || 'https://xbot.cobbold.dev';
    const res = await chrome.runtime.sendMessage({ type: 'GENERATE_MOBILE_QR', baseUrl });
    if (res?.ok) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(res.qrSvg, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      qrSvgContainer.replaceChildren();
      if (svgEl) {
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        qrSvgContainer.appendChild(document.importNode(svgEl, true));
      }
      qrCodeText.textContent = `Code: ${res.code}`;
      qrBox.style.display = 'block';
      showStatus(`Mobile QR ready for @${res.username}`, true);
    } else {
      showStatus(res?.error || 'Could not generate QR code.', false);
    }
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'QR generation failed', false);
  } finally {
    qrBtn.disabled = false;
  }
});

copyBtn.addEventListener('click', async () => {
  copyBtn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_X_COOKIES' });
    if (!res?.ok) {
      showStatus(res?.error || 'Could not read X cookies.', false);
      return;
    }
    const raw = `auth_token=${res.authToken};ct0=${res.ct0};twid=${res.twid};`;
    await navigator.clipboard.writeText(raw);
    showStatus('Copied cookie string to clipboard!', true);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'Copy failed', false);
  } finally {
    copyBtn.disabled = false;
  }
});

init();
