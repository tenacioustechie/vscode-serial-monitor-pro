# Publishing Serial Monitor Plus to the VS Code Marketplace

## 1. Prerequisites

Install the VS Code Extension CLI tool globally:

```bash
npm install -g @vscode/vsce
```

## 2. Create a Publisher Account

1. Go to [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) and sign in with a Microsoft account.
2. Click **Create publisher** and choose a publisher ID. This must match the `"publisher"` field in `package.json` — currently set to `"serial-monitor-plus"`.

## 3. Create a Personal Access Token

1. Go to [dev.azure.com](https://dev.azure.com) → your organization → **User Settings** → **Personal Access Tokens**.
2. Click **New Token** with these settings:
   - **Organization:** All accessible organizations
   - **Scopes:** Marketplace → **Manage**
3. Copy the token — you won't see it again.

## 4. Fix Required package.json Fields

The marketplace requires a few fields that are missing or need improvement. Update `package.json`:

```jsonc
{
  // Add a repository link (required for trust signals, not strictly required to publish)
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/vscode-serial-monitor-plus"
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

This produces `serial-monitor-plus-0.1.0.vsix`. Inspect what's inside:

```bash
vsce ls    # lists all files that will be packaged
```

Install and test the package locally before publishing:

```bash
code --install-extension serial-monitor-plus-0.1.0.vsix
```

## 7. Publish

Log in with your PAT:

```bash
vsce login serial-monitor-plus
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
