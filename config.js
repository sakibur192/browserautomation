// Plain config — no .env file needed. Edit these values directly and
// restart the app for changes to take effect (same idea as the Android
// app's network/Config.kt).

module.exports = {

    // Port the server listens on.
    PORT: 3000,

    // How often (hours) to proactively restart the browser. This is
    // the single biggest fix for long-running Chrome memory creep /
    // lagging on a small VPS. 0 disables scheduled restarts.
    BROWSER_RESTART_INTERVAL_HOURS: 6,

    // If the Node process RSS exceeds this many MB, restart the
    // browser early instead of waiting for the scheduled restart.
    MEMORY_RESTART_THRESHOLD_MB: 700,

    // How often (ms) the in-app watchdog checks memory usage.
    MEMORY_CHECK_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes

    // How often (ms) the in-app watchdog checks whether the login
    // form has unexpectedly reappeared (session died). This is a
    // server-side backup only — the Android app does its own polling
    // and shows its own notification independently, so this mainly
    // keeps /me/status accurate between app checks.
    LOGIN_WATCH_INTERVAL_MS: 60 * 1000 // 60 seconds
};
