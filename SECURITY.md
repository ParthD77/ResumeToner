# Security Policy

Do not report API keys, resumes, application content, or exploitable details in a public issue. Use the private security/support email listed on the Chrome Web Store page.

The extension stores a user-provided Gemini key in trusted `chrome.storage.local`. It is excluded from synchronization and backups, but local browser-profile access may expose it. Users should create a dedicated key restricted to the Gemini API, set quota/billing alerts, and revoke it if compromise is suspected.

Supported releases are the latest Chrome Web Store version and the latest desktop release published from this repository. Chrome extension security fixes are distributed through signed Store updates. Desktop users should download only from this repository's GitHub Releases page and compare the published SHA-256 checksum when practical.

Early desktop releases may be unsigned. Windows may identify the publisher as unknown, and macOS may require a one-time **System Settings → Privacy & Security → Open Anyway** approval. Never disable SmartScreen, antivirus, or Gatekeeper globally. Code signing and Apple notarization improve origin and integrity verification but do not replace source review, release testing, or prompt installation of security updates.
