---
sidebar_position: 1
---

# Installation

## VS Code Extension

Install Serial Monitor Pro from the VS Code Marketplace:

1. Open VS Code.
2. Open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search for **Serial Monitor Pro**.
4. Click **Install**.

Or install directly from the command line:

```bash
code --install-extension millsit.vscode-serial-monitor-pro
```

## SoX — Audio Recording (Optional)

Audio recording requires [SoX](https://sourceforge.net/projects/sox/) to be installed on your system. The extension works without it — audio recording is simply disabled and a warning is shown.

### macOS

```bash
brew install sox
```

### Linux (Debian / Ubuntu)

```bash
sudo apt install sox
```

### Windows

```bash
choco install sox.portable
```

:::tip
If SoX is not installed, Serial Monitor Pro will display a warning when you attempt to record but will continue to work normally for serial monitoring.
:::
