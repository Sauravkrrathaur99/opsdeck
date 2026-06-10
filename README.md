# OpsDeck — VPS Command Center

**Internal tool for managing your Hostinger VPS** without wrestling with Command Prompt every time.

OpsDeck gives you a modern web UI to:
- **Run a live SSH terminal** in your browser (like CMD, but better)
- **Browse VPS folders** with bookmarks for quick access
- **Save & one-click run commands** (deploy, nginx, docker, pm2, logs, etc.)

---

## Quick Start

### 1. Install dependencies

```bash
cd vps-command-center
npm run setup
```

### 2. Configure security (required before going online)

Copy `.env.example` to `.env`:

```bash
copy .env.example .env
```

Set these secrets:

```bash
# Encrypts SSH credentials in the local database
MASTER_KEY=your-long-random-string-here

# Login password for OpsDeck itself — blocks hijacking if port is exposed
OPSDECK_ACCESS_TOKEN=your-access-token-here
```

Generate tokens:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Run in development

```bash
npm run dev
```

Open **http://127.0.0.1:5173** in your browser.

### 4. Production build

```bash
npm run build
npm start
```

Open **http://127.0.0.1:3847**

---

## First-Time Setup

1. Click **+** in the sidebar to add your Hostinger VPS:
   - **Name**: e.g. `Hostinger Production`
   - **Host**: your VPS IP address
   - **Port**: `22`
   - **Username**: usually `root`
   - **Password**: your SSH password

2. Click the connection to select it, then use the **Test** button to verify.

3. Switch between tabs:
   - **Terminal** — full interactive SSH shell
   - **Files** — browse directories, star folders for quick access
   - **Commands** — pre-loaded useful commands + add your own

---

## Deploy on Your VPS (optional)

You can run OpsDeck on the VPS itself so your team accesses it via browser:

```bash
# On your local machine — build and copy to VPS
npm run build
scp -r . root@YOUR_VPS_IP:/opt/opsdeck

# On the VPS
cd /opt/opsdeck
npm run setup
npm start
```

Then access via `http://YOUR_VPS_IP:3847` (open port 3847 in Hostinger firewall if needed).

---

## Desktop app (safest way to share with your team)

Each teammate installs OpsDeck on **their own PC**. The app only listens on `127.0.0.1` — nothing is exposed to the internet. SSH credentials stay encrypted locally on each machine.

### Build the installer (team lead)

```powershell
cd vps-command-center
npm run setup
npm run build

# Optional: bake in the shared team token so teammates skip setup
$env:OPSDECK_BUILD_TOKEN="your-shared-access-token-here"
npm run desktop:build
```

The Windows installer is created in `release/` (e.g. `OpsDeck Setup 1.0.0.exe`).

Share that `.exe` plus the **access token** (if you did not embed it with `OPSDECK_BUILD_TOKEN`).

### Teammate install

1. Run the installer
2. On first launch, enter the shared access token (if prompted)
3. Add the VPS connection (host, user, password)
4. Use Terminal / Files / Commands as usual

### Try desktop mode locally (dev)

```powershell
npm run desktop
```

Opens OpsDeck in its own window instead of the browser.

### Why desktop is safer than hosting online

| Approach | Risk |
|---|---|
| **Desktop app** | Runs localhost-only; no open port on VPS or firewall changes |
| **Host on VPS** | Must lock down HTTPS, IP allowlist, strong token — one mistake exposes full SSH |

---

## Security (read this before going online)

**Yes — without protection, anyone who reaches OpsDeck gets your VPS.** It has full SSH terminal, file editor, and `.env` access.

OpsDeck now enforces:

| Protection | What it does |
|---|---|
| **Access token login** | `OPSDECK_ACCESS_TOKEN` required — unlock screen before any API/terminal |
| **Session tokens** | 8-hour signed sessions; WebSocket terminal also requires token |
| **Localhost bind** | Default `HOST=127.0.0.1` — not exposed to internet |
| **Production lock** | Refuses to start on `0.0.0.0` without `OPSDECK_ACCESS_TOKEN` |
| **Rate-limited login** | 5 failed attempts → 15 min lockout |
| **Path validation** | Blocks `..` and shell injection in file paths |
| **Security headers** | CSP, X-Frame-Options DENY, nosniff |
| **Encrypted credentials** | SSH passwords/keys encrypted with `MASTER_KEY` in SQLite |

### Recommended deployment (safest)

```bash
# On your laptop — SSH tunnel, OpsDeck stays localhost-only on VPS
ssh -L 3847:127.0.0.1:3847 deploy@YOUR_VPS_IP
# Then open http://127.0.0.1:3847 locally
```

### If you must expose the port

1. Set `OPSDECK_ACCESS_TOKEN` (32+ char random)
2. Set `MASTER_KEY` (24+ char random)
3. Put nginx/Caddy in front with HTTPS + IP allowlist
4. Never share the access token

> **Never** run OpsDeck on `0.0.0.0` without `OPSDECK_ACCESS_TOKEN`.

---

## Project Structure

```
vps-command-center/
├── server/           # Node.js backend (SSH, API, WebSocket terminal)
│   ├── index.js      # Main server
│   ├── routes.js     # REST API
│   ├── ssh.js        # SSH helpers
│   ├── db.js         # SQLite storage
│   └── crypto.js     # Password encryption
├── client/           # React frontend
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── Terminal.jsx
│           ├── FileBrowser.jsx
│           ├── SavedCommands.jsx
│           └── ConnectionManager.jsx
└── data/             # Auto-created — stores connections & commands
```

---

## Default Saved Commands

OpsDeck ships with useful commands pre-loaded:
- Disk & memory checks
- Nginx status/restart
- Docker container list & logs
- PM2 status/restart
- Nginx error logs
- System uptime

Add your own deploy scripts, git pull commands, database backups, etc.
