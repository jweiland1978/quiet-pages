# Quiet Pages

A simple, private journal that lives on your device. Entries are encrypted in your browser with a passphrase you choose, and nothing is uploaded. No account, no cloud. It works offline and can be installed to your home screen.

**These are test builds.** It's not finished.

- **Stage 3 (newest):** polish (compact backup reminder, new icon, launch screen, empty state), a "How your data is kept" help page, a privacy page, an About screen, unsaved changes kept (encrypted) if the journal locks while you're writing, and a free demo edition that keeps up to 10 entries. Stage 2 journals carry over to the full edition.
- **Stage 2:** a calendar view, search, auto-lock (1, 5, 15 or 30 minutes), an encrypted backup file you can export and import (merge or replace), a backup reminder, change passphrase, and an easier-to-reach Save button. Stage 1 journals carry over.
- **Stage 1:** create a passphrase, lock and unlock, and write, edit and delete dated entries with an optional mood.

How it works: your passphrase is turned into a key with PBKDF2-SHA256 (600,000 rounds, random salt), and each entry is encrypted with AES-256-GCM using the browser's built-in Web Crypto. Only encrypted data is stored (in IndexedDB). The passphrase and key are never saved. **If you forget your passphrase, your entries cannot be recovered.**

- Try it: https://jweiland1978.github.io/quiet-pages/stage3/index.html?v=4
- Demo edition: `/stage3-demo/`
- Privacy page: `/stage3/privacy.html`
- Stage 2 build: `/stage2/`
- Stage 1 build: `/stage1/`

## Made with AI

This app was made with AI using Grok Build. Design by Jeff (BlueWater78).

## Running locally

Serve the folder with any static web server, for example `python3 -m http.server`, then open `/stage3/`, `/stage3-demo/`, `/stage2/` or `/stage1/`.
