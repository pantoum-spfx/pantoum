---
title: Windows Setup
sidebar_label: Windows Setup
sidebar_position: 4
description: Setting up PANTOUM on Windows
---

# Windows Setup

Get Claude Code running first, then it can help with the rest.

## Quick Start: Get Claude Code Running

### 1. Install Git

Download and install from: [https://git-scm.com/download/win](https://git-scm.com/download/win)

### 2. Install nvm-windows

1. Download `nvm-setup.exe` from: [https://github.com/coreybutler/nvm-windows/releases](https://github.com/coreybutler/nvm-windows/releases)
2. Run the installer with default settings
3. **Close and reopen PowerShell**

### 3. Install Node.js and Claude Code

```powershell
# Install Node.js
nvm install 22
nvm use 22

# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Authenticate
claude login
```

### 4. Clone the Repo and Start Claude Code

```powershell
mkdir C:\dev
cd C:\dev
git clone https://github.com/pantoum-spfx/pantoum.git
cd pantoum

# Start Claude Code - it will help with the rest!
claude
```

## Next Steps (with Claude Code's Help)

Once Claude Code is running, ask it to help you with:

1. **Build PANTOUM**: `npm install && npm run build`
2. **Install M365 CLI**: `npm install -g @pnp/cli-microsoft365`

## Testing PANTOUM

### Setup Test Solutions

Clone PuntoBello test solutions using **Git Bash** (installed with Git):

```bash
# Open Git Bash
mkdir -p /c/dev/pantoum_testlast
cd /c/dev/pantoum_testlast

# Clone test solutions (public repos)
git clone https://github.com/diemobiliar/puntobello-realtimenews.git
git clone https://github.com/diemobiliar/puntobello-anchor.git
git clone https://github.com/diemobiliar/puntobello-userapps.git
git clone https://github.com/diemobiliar/puntobello-multilingualdocument.git
```

### Run PANTOUM Upgrade

Back in PowerShell:

```powershell
cd C:\dev\pantoum\pantoum

# Run upgrade on a test solution
node dist\cli.js --localPath C:\dev\pantoum_testlast\puntobello-realtimenews --toVersion 1.22.1
```

