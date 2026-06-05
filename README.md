<div align="center">
  <img src="docs/logo.svg" alt="Digital Parent V4" width="96" />

  <h1>Digital Parent V4</h1>
  <p><strong>The complete, private family management system. From chores to screen time, organized.</strong></p>

  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"></a>
</div>

<br>

Digital Parent V4 is a comprehensive web app designed to help parents manage chores, distribute digital rewards, and track their children's activities and locations—all from a single, beautifully designed dashboard.

---

## Key Features

| | |
|---|---|
| **Role-Based Dashboards** | Distinct Parent and Child views. Parents get a control center, children get a gamified progress dashboard. |
| **Rewards Economy** | Children earn points by completing Chores or Study blocks. They can spend these points to unlock real-world screen time or app access. |
| **Streak Achievements** | Built-in gamification tracks daily streaks for positive reinforcement. Earning points feels rewarding! |
| **Weekly Digests** | Parents receive a weekly summary of their family's digital and physical activity (Chores completed, average screen time, danger zone alerts). |
| **Onboarding Wizard** | A sleek, guided setup flow for parents to quickly onboard children, set up devices, and configure screen time rules. |
| **Medication Tracking** | Integrated into the Daily Plan, allowing parents to securely track safety-critical routines that children cannot accidentally delete. |
| **Interactive Geofencing** | Monitor danger zones and safe areas via an integrated Leaflet map with simulated real-time updates. |
| **Calendar & Tasks** | Full household management including shared tasks, routine planners, and calendar events. |

---

## Design & Technology

- **Disciplined Liquid Glass UI** — readable work surfaces, subtle translucent navigation, spring animations, and module-tinted overlays — built in pure CSS
- **PWA** — installable on any device, works offline, responsive from phone to desktop, with tuned mobile navigation, touch targets, and dark mode
- **Privacy First** — fully self-hosted, SQLCipher AES-256 encrypted database, zero telemetry
- **SSO / OpenID Connect** — optional single sign-on via any OIDC provider (Authentik, Keycloak, Google, Microsoft Entra). Configure with four env vars; Authorization Code + PKCE flow.
- **Zero Build Step** — pure ES modules, no bundler, no transpiler, no framework
- **Multilingual** — 16 languages with automatic locale detection (de, en, es, fr, it, sv, el, ru, tr, zh, ja, ar, hi, pt, uk, pl)

---

## Quick Start

**Option A — Web Installer (recommended)**

```bash
git clone https://github.com/ulsklyc/oikos.git && cd oikos
node tools/installer/install-server.js
```

Open **http://localhost:8090** in your browser. The localized wizard (16 languages) detects your container engine (Docker or Podman), configures your `.env` — including optional reverse proxy/HTTPS, SSO (OIDC), and automatic backups — starts the container, and creates your admin account. Requires Node.js 18+ on the host.

**Option B — Pre-built image (no clone required)**

```bash
curl -O https://raw.githubusercontent.com/ulsklyc/oikos/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/ulsklyc/oikos/main/.env.example
cp .env.example .env          # set SESSION_SECRET and DB_ENCRYPTION_KEY
docker compose up -d
docker compose exec oikos node setup.js
```

**Option C — Build from source**

```bash
git clone https://github.com/ulsklyc/oikos.git && cd oikos
cp .env.example .env          # set SESSION_SECRET and DB_ENCRYPTION_KEY
docker compose up -d --build
docker compose exec oikos node setup.js
```

Open `http://localhost:3000` and sign in with the admin credentials you created above.

> **Using Podman (RHEL / Fedora / CentOS Stream)?** Both installers above auto-detect
> Podman and use `podman-compose.yml` (SELinux `:Z` labels, configurable host bind).
> For a manual start, replace `docker compose` with `podman compose -f podman-compose.yml`
> (or `podman-compose -f podman-compose.yml`). For rootless systemd autostart, see the
> Quadlet unit at `tools/quadlet/oikos.container`.

> **New to Docker or Podman?** The **[Installation Guide](docs/installation.md)** covers engine setup, HTTPS, backups, and troubleshooting step by step.

---

## Tech Stack

<p>
  <img src="https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/SQLite%20%2F%20SQLCipher-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Vanilla_JS_(ES_Modules)-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="Vanilla JS">
  <img src="https://img.shields.io/badge/Plain_CSS-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white" alt="PWA">
</p>

---

## Documentation

[Installation](docs/installation.md) &nbsp;·&nbsp; [Spec & Data Model](docs/SPEC.md) &nbsp;·&nbsp; [Modules](MODULES.md) &nbsp;·&nbsp; [Contributing](CONTRIBUTING.md) &nbsp;·&nbsp; [Security](SECURITY.md) &nbsp;·&nbsp; [Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Backlog](BACKLOG.md)

---

## License

MIT — see [LICENSE](LICENSE).

<div align="center">
  <sub>Built with care for families who value privacy and simplicity.</sub>
</div>
