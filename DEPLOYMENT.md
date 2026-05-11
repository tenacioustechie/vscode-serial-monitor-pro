# Publishing Serial Monitor Pro to the VS Code Marketplace

## 1. Prerequisites

Install the VS Code Extension CLI tool globally:

```bash
npm install -g @vscode/vsce
```

After install, the command is `vsce` (not `@vscode/vsce`). Verify with `vsce --version`.

If you'd rather not install globally, run it ad-hoc with `npx @vscode/vsce <command>` — every command below works the same way (e.g., `npx @vscode/vsce package`).

## 2. Create a Publisher Account

1. Go to [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) and sign in with a Microsoft account.
2. Click **Create publisher** and choose a publisher ID. This must match the `"publisher"` field in `package.json` — currently set to `"millsit"`.

### If you get "Publisher Metadata has suspicious content"

This is a Marketplace spam-filter false positive. Common triggers and fixes:

- **Avoid product-name-style IDs with hyphens** (e.g., `serial-monitor-pro`). The filter flags these heavily because spammers use them. Use a personal or company ID instead (`millsit`, `brianmills`). The Marketplace convention is that a publisher represents *a person or company*, not a product — the product name lives in `name`/`displayName`.
- **Strip URLs from the description field** in the create-publisher form (the package.json description is fine).
- **Verify your Microsoft account** has a confirmed phone number and email (Microsoft Account → Security).
- **Try incognito or a different browser** — some users report it succeeds on a second browser.
- **Wait 24 hours** — the filter occasionally lifts as the account ages.

If you change the publisher ID after creating one, also update `"publisher"` in [package.json](package.json) so it matches.

## 3. Create a Personal Access Token

The PAT lives in **Azure DevOps**, not the Marketplace site. Use the **same Microsoft account** you used for the publisher.

1. Go to [dev.azure.com](https://dev.azure.com) and sign in.
2. **First time only:** Azure DevOps will prompt you to **create an organization**. You must do this — PATs live inside an org. Name it anything (e.g., your username). The org is separate from your Marketplace publisher; they just need to share a Microsoft account.
3. Once inside the organization (URL: `https://dev.azure.com/<your-org>/`), open **User settings** — it's a small icon in the **top-right corner**, next to your avatar (tooltip: "User settings"). Then click **Personal access tokens**.
   - Direct URL shortcut: `https://dev.azure.com/<your-org>/_usersSettings/tokens`
4. Click **+ New Token** with these settings:
   - **Organization:** **All accessible organizations** (required — a single-org token will fail `vsce login` with a confusing 401)
   - **Scopes:** click **Show all scopes** at the bottom of the dialog (Marketplace is hidden by default), then find **Marketplace** → check **Manage**
5. Click **Create** and copy the token immediately — you won't see it again.

### Common gotchas
- **"All accessible organizations"** is mandatory. Single-org tokens are silently rejected by the Marketplace API.
- **Show all scopes** — without expanding this, you won't see the Marketplace scope at all.
- The Microsoft account on `dev.azure.com` must match the one that owns your Marketplace publisher.

## 4. Fix Required package.json Fields

The marketplace requires a few fields that are missing or need improvement. Update `package.json`:

```jsonc
{
  // Add a repository link (required for trust signals, not strictly required to publish)
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/vscode-serial-monitor-pro"
  },

  // Add an icon (128x128 PNG, place file in repo root)
  "icon": "icon.png",

  // Optionally improve the category — "Other" is valid but less discoverable
  "categories": ["Other"]
}
```

**Icon:** Create a 128×128 PNG named `icon.png` in the project root. This is not strictly required but marketplace listings without icons look unprofessional.

## 5. Add a .vscodeignore File

Create `.vscodeignore` to exclude dev files from the packaged `.vsix`:

```
.vscode/**
src/**
node_modules/**
*.ts
tsconfig.json
esbuild.js
.eslintrc*
.gitignore
test/**
```

The `dist/` folder and `media/` folder should **not** be ignored — they contain the compiled extension and webview assets.

## 6. Package and Inspect the Extension

Before publishing, build the package locally to verify its contents:

```bash
vsce package
```

This produces `serial-monitor-pro-0.1.0.vsix`. Inspect what's inside:

```bash
vsce ls    # lists all files that will be packaged
```

Install and test the package locally before publishing:

```bash
code --install-extension serial-monitor-pro-0.1.0.vsix
```

## 7. Publish

Log in with your PAT:

```bash
vsce login millsit
# Paste your Personal Access Token when prompted
```

Then publish:

```bash
vsce publish
```

Or combine package + publish in one step:

```bash
vsce publish --pat YOUR_PAT_HERE
```

## 8. Subsequent Releases

### Option A — Automated via GitHub Actions (recommended)

The [.github/workflows/publish-extension.yml](.github/workflows/publish-extension.yml) workflow publishes automatically when you push a `v*` tag. It runs lint → test → build → publish, and verifies the tag matches `package.json`'s version before publishing.

**One-time setup:**

1. Add the PAT as a repo secret. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**, name it `VSCE_PAT`, paste the token.
2. Set a calendar reminder to rotate the PAT before it expires — Azure DevOps PATs max out at 1 year.

**Per release:**

```bash
npm version patch          # bumps package.json (0.1.0 → 0.1.1) and creates a git tag
git push && git push --tags
```

`npm version` handles the version bump, commit, and tag in one shot. Pushing the tag triggers the workflow.

### Option B — Manual

Bump the version in `package.json` before each release. `vsce publish` supports semver shortcuts:

```bash
vsce publish patch   # 0.1.0 → 0.1.1
vsce publish minor   # 0.1.0 → 0.2.0
vsce publish major   # 0.1.0 → 1.0.0
```

This automatically updates `package.json`, commits the version bump (if in a git repo), and publishes.

---

## Things Worth Doing Before the First Public Release

- **Test the packaged `.vsix`** on a clean VS Code install — verify serialport native bindings load correctly, since `serialport` and `@serialport/bindings-cpp` are external (not bundled) and rely on prebuilt binaries.
- **Verify SoX graceful degradation** — the extension should warn but not crash when `rec` is not available.
- **Add a `galleryBanner`** in `package.json` for better marketplace presentation:
  ```json
  "galleryBanner": {
    "color": "#1e1e1e",
    "theme": "dark"
  }
  ```
