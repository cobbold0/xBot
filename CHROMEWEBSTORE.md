# Chrome Web Store Listing — JustBot X Connector

**Last Updated:** 2026-10-16
**Version:** 1.0.0

## Short Description
Connect your active X (Twitter) session to your JustBot dashboard in one click without sharing your X password.

## Detailed Description
JustBot X Connector lets you link your logged-in X account to your self-hosted or cloud JustBot dashboard in a single click:
- Connects directly from the JustBot Settings page ("1-Click Connect via JustBot Extension") or from the extension popup.
- Never asks for or accesses your X password or two-factor authentication codes.
- Transmits session tokens directly to your configured JustBot server where they are encrypted at rest with AES-256-GCM.

## Permissions Justification
- **`cookies`**: Required to read the `auth_token`, `ct0`, and `twid` session cookies from the user's active X session when the user clicks "Sync to JustBot" or "1-Click Connect".
- **`storage`**: Required to save the user's preferred JustBot dashboard URL locally in the browser.
- **`host_permissions` (`https://x.com/*`, `https://twitter.com/*`, `http://localhost:3007/*`, `https://*/*`)**: Required to read the three X session cookies on user request and allow self-hosted JustBot instances on any user-configured HTTPS domain to receive the verified session via the content script bridge or popup.

## Privacy & Data Use
- **Data Collected:** X session cookies (`auth_token`, `ct0`, `twid`) only when explicitly triggered by the user.
- **Data Transmission:** Sent only to the user-configured JustBot server (`/api/x-credentials`), encrypted at rest with AES-256-GCM. Never sold or shared with third parties.
- **Privacy Policy URL:** `/privacy` on the hosted JustBot instance.

## Version History
- **1.0.0 (2026-10-16):** Initial release with 1-click dashboard bridge and popup sync.
