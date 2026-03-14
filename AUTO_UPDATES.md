# Auto Updates

Shout uses [tauri-plugin-updater](https://v2.tauri.app/plugin/updater/) to check for and install new versions automatically. On startup the app queries GitHub releases for a `latest.json` manifest. If a newer version is found, a banner appears prompting the user to install and restart.

---

## Signing Keys

Tauri requires every release to be cryptographically signed. The public key lives in `tauri.conf.json`; the private key is used at build time and must never be committed.

### Generate a new keypair

```bash
npx tauri signer generate -w ~/.tauri/shout.key --ci
```

This creates two files:

| File | Purpose |
|---|---|
| `~/.tauri/shout.key` | **Private key** — keep secret, never commit |
| `~/.tauri/shout.key.pub` | **Public key** — paste into `tauri.conf.json` |

### Add the public key to tauri.conf.json

```bash
cat ~/.tauri/shout.key.pub
```

Copy the output and set it as the `pubkey` value in `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "<paste output here>",
    "endpoints": [
      "https://github.com/teleology-io/shout/releases/latest/download/latest.json"
    ]
  }
}
```

---

## Building a Signed Release

Set the private key as an environment variable before building:

```bash
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/shout.key)
npm run tauri build
```

The build produces signed bundles and a `latest.json` manifest inside `src-tauri/target/release/bundle/`.

---

## Publishing a Release to GitHub

1. Create a new GitHub release tagged with the version (e.g. `v0.1.2`).
2. Upload the platform installers as release assets:
   - macOS: `.dmg` and `.app.tar.gz` + `.app.tar.gz.sig`
   - Windows: `.msi` and `.msi.zip` + `.msi.zip.sig`
   - Linux: `.AppImage` and `.AppImage.tar.gz` + `.AppImage.tar.gz.sig`
3. Upload `latest.json` as a release asset — **this file must be named exactly `latest.json`**.

The updater endpoint is:
```
https://github.com/teleology-io/shout/releases/latest/download/latest.json
```

### Example latest.json

```json
{
  "version": "0.1.2",
  "notes": "Bug fixes and improvements.",
  "pub_date": "2026-03-13T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://github.com/teleology-io/shout/releases/download/v0.1.2/shout_0.1.2_aarch64.app.tar.gz",
      "signature": "<contents of .app.tar.gz.sig>"
    },
    "darwin-x86_64": {
      "url": "https://github.com/teleology-io/shout/releases/download/v0.1.2/shout_0.1.2_x64.app.tar.gz",
      "signature": "<contents of .app.tar.gz.sig>"
    },
    "windows-x86_64": {
      "url": "https://github.com/teleology-io/shout/releases/download/v0.1.2/shout_0.1.2_x64_en-US.msi.zip",
      "signature": "<contents of .msi.zip.sig>"
    },
    "linux-x86_64": {
      "url": "https://github.com/teleology-io/shout/releases/download/v0.1.2/shout_0.1.2_amd64.AppImage.tar.gz",
      "signature": "<contents of .AppImage.tar.gz.sig>"
    }
  }
}
```

---

## GitHub Actions (CI)

Store the private key as a repository secret named `TAURI_SIGNING_PRIVATE_KEY`, then reference it in your workflow:

```yaml
- name: Build
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  run: npm run tauri build
```

---

## How It Works in the App

- **[src/hooks/useUpdater.ts](src/hooks/useUpdater.ts)** — checks for updates 4 seconds after launch, exposes `update`, `isDownloading`, `progress`, `applyUpdate`, and `dismiss`
- **[src/components/UpdateBanner.tsx](src/components/UpdateBanner.tsx)** — renders a slim banner above the tab bar when an update is available; shows download progress and relaunches when done
- The check is silently skipped in dev mode or when offline
