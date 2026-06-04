# VialWise AI Worker

This Worker keeps the Anthropic API key out of the VialWise app. The browser sends meal photo and food swap requests to Cloudflare; Cloudflare adds the secret key server-side and calls Claude Sonnet.

## Setup

1. Open this folder in PowerShell:

   ```powershell
   cd "C:\Users\garry\Documents\Codex\2026-05-25\files-mentioned-by-the-user-vialwise\cloudflare_worker"
   ```

2. Install dependencies:

   ```powershell
   & "C:\Program Files\nodejs\npm.cmd" install
   ```

3. Log in to Cloudflare if needed:

   ```powershell
   & "C:\Program Files\nodejs\npx.cmd" wrangler login
   ```

4. Add or replace the secret:

   ```powershell
   & "C:\Program Files\nodejs\npx.cmd" wrangler secret put ANTHROPIC_API_KEY
   ```

5. Deploy:

   ```powershell
   & "C:\Program Files\nodejs\npx.cmd" wrangler deploy
   ```

The app is configured to call:

```text
https://vialwise.garryrobson85.workers.dev
```

Do not put the Anthropic key in `vialwise_app/config.js`, GitHub, or the mobile app files.
