window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== 'JUSTBOT_GET_X_COOKIES') return;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_X_COOKIES' });
    window.postMessage({ type: 'JUSTBOT_X_COOKIES_RESULT', ...response }, window.location.origin);
  } catch (err) {
    window.postMessage(
      {
        type: 'JUSTBOT_X_COOKIES_RESULT',
        ok: false,
        error: err instanceof Error ? err.message : 'Extension communication failed',
      },
      window.location.origin,
    );
  }
});
