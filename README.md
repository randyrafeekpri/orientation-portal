# Orientation Success Portal

Local portal for launching new associates through a five-step orientation path, tracking appointment momentum, generating a completion certificate, and keeping the RVP, recruiter, and field trainer informed through Telegram.

## Run

```powershell
npm start
```

Open:

```text
http://localhost:4173
```

## Local-to-online workflow

Use GitHub as the bridge between your local Codex project and the online version:

1. Create a GitHub repository for this folder.
2. Commit your local changes.
3. Push to the `main` branch.
4. Connect the GitHub repo to your hosting provider.
5. Turn on automatic deploys for the `main` branch.

After that, the normal update flow is:

```powershell
git add .
git commit -m "Update orientation portal"
git push origin main
```

The host rebuilds the online app after each push.

## Hosting notes

The app is a plain Node.js web service.

Recommended start command:

```text
npm start
```

Recommended health check:

```text
/api/health
```

Set these environment variables online:

```text
DATA_DIR
TELEGRAM_BOT_TOKEN
RVP_CHAT_ID
DAILY_DIGEST_TIME
```

Do not set `PORT` yourself on Render. Render provides it automatically. Do not upload `.env` to GitHub. Put production secrets directly in your host's environment variable settings.

## Telegram setup

1. Create a Telegram bot with BotFather.
2. Copy `.env.example` to `.env`.
3. Set `TELEGRAM_BOT_TOKEN`.
4. Add the bot to your team group or start a direct chat with the bot.
5. Capture chat IDs for the RVP, recruiter, field trainer, and associate.
6. Restart the server.

The app can send:

- A direct Telegram message from the Messages tab.
- A daily digest to the RVP, recruiter, and field trainer chat IDs.
- A manual digest immediately with `Send Digest Now`.

## External associate progress pages

Each associate gets a private progress link:

```text
/progress/their-private-token
```

In the dashboard, use `Copy Link` to copy that associate's progress page. The link works for outside users only after the app is hosted on a public URL. `localhost` links work only on your own computer.

For real external access, deploy the app to a host such as Render, Railway, Fly.io, a VPS, or another Node-compatible server. Use HTTPS and add proper login before storing sensitive personal or business information.

## Data

The local data file is created at:

```text
data/portal.json
```

For production, point `DATA_DIR` to a persistent disk path or replace the JSON file with a real database. If the host uses an ephemeral filesystem, data written by the app can disappear after redeploys.

This first version is intentionally simple and local. For production use, add login/authentication, a real database, HTTPS hosting, backups, and role-based access before storing sensitive associate or client information.
