# What changed, and why

Nothing about your existing routes, selectors, or business logic was
touched — every `/me`, `/deposit`, `/withdraw`, `/history*`, `/switches`,
`/main-switch`, `/sub-switch`, `/setup-database`, `/restart-browser`,
`/queue-status` route works exactly as before, same paths, same behavior.

**No `.env` file anywhere.** All settings live in one plain file,
`config.js` — open it, edit the numbers, restart the app. Same idea as
your Android app's `network/Config.kt`.

## 1. A real bug fix

`server.js` called `saveSession()` right after a successful OTP login —
but `browser.js` never defined or exported it. **Every single login was
throwing `TypeError: saveSession is not a function`**, caught by the
outer `catch` block and shown as the red "ERROR" screenshot page, even
though the login had already succeeded. Fixed and implemented properly
(a lightweight, non-throwing session checkpoint).

## 2. `browser.js` — the "no lagging" fixes

- **Crash recovery**: if Chrome dies (OOM kill, crash, manual `pkill`),
  the *next* request triggers a clean relaunch instead of hanging on a
  dead reference forever.
- **Restart mutex**: a manual `/restart-browser` call and a scheduled
  watchdog restart can no longer race each other into launching two
  Chrome processes against the same profile lock.
- **Lower-footprint launch flags**: disabled extensions, background
  sync/networking/translate, popup blocking, crash-reporter uploads,
  and capped each renderer's JS heap — meaningful on a small VPS.
- **`getPageSafe()`** / **`isShowingLoginForm()`** helpers used by the
  watchdog and the new routes below.

## 3. `watchdog.js` — keeps the browser alive long-term

Three timers, started once at boot, all tuned via `config.js`:

1. **Scheduled browser restart** (default every 6h) — the single
   biggest fix for long-running Chrome memory creep. Skips itself if a
   deposit/withdraw job is mid-queue.
2. **Memory watchdog** — restarts early if the Node process RSS
   crosses a threshold (default 700MB), instead of waiting for the
   schedule.
3. **Login-state watcher** — keeps the server's own `meState` accurate
   between checks, so `/me/status` (see below) is never stale.

## 4. Notifications — handled by your Android app, not the server

Your `LoginCheckWorker.kt` already polls the server in the background
and shows its own local notification when it detects the login form
reappearing. That's the real "logged out" alert — no server-side push
service (no ntfy, no webhook) is needed, so that whole layer has been
removed to keep this simple, as requested.

**One efficiency fix made to the Android side:** `LoginCheckWorker`
was hitting `GET /me`, which renders and returns a full-page
screenshot as base64 on every call — expensive for a background check
that only ever read a text state out of the HTML. It now hits the new
`GET /me/status` (tiny JSON) instead. See `android-patch.zip`.

**One correctness fix made to the Android side:** the background check
was scheduled for every 3 minutes, but Android's `PeriodicWorkRequest`
enforces a hard 15-minute minimum — the OS was silently stretching it
to 15 anyway. It's now explicitly set to 15 so the code says what
actually happens. This only affects the background safety-net check;
while the app is open, the screen still refreshes on
`Config.REFRESH_INTERVAL_MS` (30s) as before.

## 5. New server routes (additive — nothing existing was renamed)

| Route | Purpose |
|---|---|
| `GET /health` | JSON status: browser state, restart/crash counts, queue depth, process memory. Point an uptime monitor at this. |
| `GET /me/status` | Tiny JSON version of the login state (`meState`, `loggedIn`) — this is what the Android app now polls instead of the full screenshot page. |
| `POST /me/clear-cache` | Clears Chrome's cache via CDP without wiping the whole profile (send `{"wipeCookies": true}` to also clear cookies). |
| `POST /me/hard-reset` | Full "new folder" fix, automated: closes Chrome, **renames** (never deletes) the existing profile to `chrome-profile-backup-<timestamp>`, relaunches fresh. |

`start()` also checks on boot whether the persistent profile is
already logged in (common after a process restart, since cookies
persist to disk) and resumes as `DONE` instead of wrongly showing the
login form over a live session.

## 6. `config.js` — all settings, one file, no `.env`

```js
module.exports = {
    PORT: 3000,
    BROWSER_RESTART_INTERVAL_HOURS: 6,
    MEMORY_RESTART_THRESHOLD_MB: 700,
    MEMORY_CHECK_INTERVAL_MS: 5 * 60 * 1000,
    LOGIN_WATCH_INTERVAL_MS: 60 * 1000
};
```
Edit values directly, restart the app (`pm2 restart browserautomation`)
for changes to take effect.

## 7. Process management (pick ONE)

**PM2** (`ecosystem.config.js`):
```bash
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**systemd** (`deploy/browser-automation.service`) — edit
`WorkingDirectory` to your actual path first:
```bash
sudo cp deploy/browser-automation.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now browser-automation
```

## 8. VPS setup (`deploy/setup-vps.sh`)

One-time script: adds a 2GB swapfile (you had zero — a memory spike
gets an OOM-killed process instead of graceful slowdown, which looks
identical to a logged-out session from the outside) and sets
`vm.swappiness=10`.
```bash
chmod +x deploy/setup-vps.sh
./deploy/setup-vps.sh
```

## Deploying — step by step

1. Copy every file from this zip (`server.js`, `browser.js`,
   `watchdog.js`, `config.js`, `ecosystem.config.js`, `package.json`,
   and the `deploy/` folder) into your project root on the VPS,
   replacing the old `server.js`/`browser.js`.
2. Edit `config.js` if you want a different port or restart interval
   (defaults are already sane for a 1 vCPU / 4GB VPS).
3. `./deploy/setup-vps.sh`
4. `npm install`
5. `pm2 start ecosystem.config.js && pm2 save && pm2 startup`
6. `curl http://localhost:3000/health` — confirm `"ok": true`.
7. Log in once via `/me` (same login screen as always).
8. Apply `android-patch.zip` to the Android project (see below),
   rebuild, reinstall on your phone.
9. Open the app once so it schedules the background worker, then wait
   for a real (or forced, via `/me/reset`) logout to confirm the
   notification fires.

## Applying `android-patch.zip`

Unzip it into your Android project root — it contains exactly two
files at their correct paths:
- `app/src/main/java/com/example/mobiautomation/MainActivity.kt`
- `app/src/main/java/com/example/mobiautomation/transactions/LoginCheckWorker.kt`

Overwrite the existing ones, then rebuild:
```powershell
cd MobiAutomation
.\gradlew.bat assembleDebug
```
The APK lands at `app\build\outputs\apk\debug\app-debug.apk` — install
it on your phone (`adb install -r app-debug.apk`, or copy it over and
tap to install with "install unknown apps" allowed for that source).

## Notes

- `saveSession()` writes a small JSON marker file
  (`.last-session.json`) — harmless, safe to `.gitignore`.
- `/me/hard-reset` never deletes your old profile — it renames it with
  a timestamp. Periodically delete old `chrome-profile-backup-*`
  folders yourself so disk doesn't fill up over months.
- `Config.kt` in the Android app already points at
  `http://187.127.145.228:3000/` — matches the port this server runs
  on. If you ever change `config.js`'s `PORT`, update `Config.kt` to
  match and rebuild the APK.
- Two hardcoded secrets already existed in `server.js`
  (`HARDCODED_AUTH_TOKEN` in `/deposit` and `/withdraw`, and the
  Postgres password). Left untouched since you asked for no logic
  changes — worth moving into `config.js` as plain constants (still no
  `.env` needed) whenever you're ready, so they're not sitting in
  plaintext across every commit in git history.
