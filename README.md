# Quiet Pages

A simple, private journal that lives on your device. Entries are encrypted in your browser with a passphrase you choose, and nothing is uploaded. No account, no cloud. It works offline and can be installed to your home screen.

**These are test builds.** It's not finished.

- **Stage 1 (newest):** create a passphrase, lock and unlock, and write, edit and delete dated entries with an optional mood.

How it works: your passphrase is turned into a key with PBKDF2-SHA256 (600,000 rounds, random salt), and each entry is encrypted with AES-256-GCM using the browser's built-in Web Crypto. Only encrypted data is stored (in IndexedDB). The passphrase and key are never saved. **If you forget your passphrase, your entries cannot be recovered.**

- Try it: https://jweiland1978.github.io/quiet-pages/stage1/index.html?v=1

## Made with AI

This app was made with AI using Grok Build. Design by Jeff (BlueWater78).

## Running locally

Serve the folder with any static web server, for example `python3 -m http.server`, then open `/stage1/`.
