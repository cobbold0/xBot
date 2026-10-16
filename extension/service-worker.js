async function readXCookies() {
  const urls = ['https://x.com', 'https://twitter.com'];
  let authToken = '';
  let ct0 = '';
  let twid = '';

  for (const url of urls) {
    try {
      const [a, c, t] = await Promise.all([
        chrome.cookies.get({ url, name: 'auth_token' }),
        chrome.cookies.get({ url, name: 'ct0' }),
        chrome.cookies.get({ url, name: 'twid' }),
      ]);
      if (a?.value && !authToken) authToken = a.value;
      if (c?.value && !ct0) ct0 = c.value;
      if (t?.value && !twid) twid = t.value;
    } catch (err) {
      console.error('Error reading cookies for', url, err);
    }
  }

  if (!authToken || !ct0 || !twid) {
    return {
      ok: false,
      error: 'Active X session not found. Please log in to https://x.com in this browser first.',
    };
  }

  return { ok: true, authToken, ct0, twid };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === 'GET_X_COOKIES') {
        const res = await readXCookies();
        sendResponse(res);
        return;
      }

      if (message?.type === 'SYNC_TO_JUSTBOT') {
        const cookies = await readXCookies();
        if (!cookies.ok) {
          sendResponse(cookies);
          return;
        }
        const stored = await chrome.storage.local.get('justbotUrl');
        const baseUrl = String(message.baseUrl || stored.justbotUrl || 'http://localhost:3007').replace(/\/+$/, '');
        await chrome.storage.local.set({ justbotUrl: baseUrl });

        const resp = await fetch(`${baseUrl}/api/auth/x-login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            authToken: cookies.authToken,
            ct0: cookies.ct0,
            twid: cookies.twid,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          sendResponse({
            ok: false,
            error: data.error || `JustBot returned HTTP ${resp.status}.`,
          });
          return;
        }
        sendResponse({ ok: true, username: data.username, baseUrl });
        return;
      }

      if (message?.type === 'GENERATE_MOBILE_QR') {
        const cookies = await readXCookies();
        if (!cookies.ok) {
          sendResponse(cookies);
          return;
        }
        const stored = await chrome.storage.local.get('justbotUrl');
        const baseUrl = String(message.baseUrl || stored.justbotUrl || 'http://localhost:3007').replace(/\/+$/, '');
        await chrome.storage.local.set({ justbotUrl: baseUrl });

        const resp = await fetch(`${baseUrl}/api/auth/qr`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            authToken: cookies.authToken,
            ct0: cookies.ct0,
            twid: cookies.twid,
            baseUrl,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          sendResponse({
            ok: false,
            error: data.error || `JustBot returned HTTP ${resp.status}.`,
          });
          return;
        }
        sendResponse({ ok: true, code: data.code, qrSvg: data.qrSvg, username: data.username });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Unexpected extension error' });
    }
  })();
  return true;
});
