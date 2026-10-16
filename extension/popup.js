const urlInput = document.getElementById('justbotUrl');
const syncBtn = document.getElementById('syncBtn');
const copyBtn = document.getElementById('copyBtn');
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
  showStatus('Verifying & syncing X session...', true);
  try {
    const baseUrl = urlInput.value.trim() || 'http://localhost:3007';
    const res = await chrome.runtime.sendMessage({ type: 'SYNC_TO_JUSTBOT', baseUrl });
    if (res?.ok) {
      showStatus(`Connected @${res.username} to JustBot!`, true);
    } else {
      showStatus(res?.error || 'Could not sync session.', false);
    }
  } catch (err) {
    showStatus(err instanceof Error ? err.message : 'Sync failed', false);
  } finally {
    syncBtn.disabled = false;
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
