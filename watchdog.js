const config = require("./config");

// ------------------------------------------------------------------
// Three independent timers that keep the browser healthy long-term.
//
// Note on notifications: your Android app already polls GET /me/status
// in the background (LoginCheckWorker) and shows its own local
// notification when it sees the login form reappear — that's the
// actual "logged out" alert path. This watchdog's job is just to keep
// the *server's own* meState accurate and the browser itself alive,
// so what the app polls is always correct and fresh.
// ------------------------------------------------------------------

let timers = [];
let lastKnownLoggedIn = false;

/**
 * deps = {
 *   restartBrowser(reason),
 *   isShowingLoginForm(),
 *   getMeState(): "LOGIN" | "OTP" | "DONE",
 *   setMeState(value),
 *   isBusy(): boolean          // true while a deposit/withdraw job is running
 * }
 */
function startWatchdog(deps) {

    console.log(
        `[watchdog] restart every ${config.BROWSER_RESTART_INTERVAL_HOURS}h | ` +
        `memory check every ${config.MEMORY_CHECK_INTERVAL_MS / 1000}s (limit ${config.MEMORY_RESTART_THRESHOLD_MB}MB) | ` +
        `login watch every ${config.LOGIN_WATCH_INTERVAL_MS / 1000}s`
    );

    // ----------------------------------------------------------
    // 1) Scheduled restart
    // ----------------------------------------------------------
    if (config.BROWSER_RESTART_INTERVAL_HOURS > 0) {
        const t = setInterval(async () => {
            if (deps.isBusy()) {
                console.log("[watchdog] scheduled restart skipped — job in progress");
                return;
            }
            try {
                await deps.restartBrowser("scheduled");
            } catch (err) {
                console.error("[watchdog] scheduled restart failed:", err.message);
            }
        }, config.BROWSER_RESTART_INTERVAL_HOURS * 60 * 60 * 1000);
        timers.push(t);
    }

    // ----------------------------------------------------------
    // 2) Memory watchdog
    // ----------------------------------------------------------
    const memTimer = setInterval(async () => {
        const mb = Math.round(process.memoryUsage().rss / 1024 / 1024);
        console.log(`[watchdog] node process RSS: ${mb}MB`);

        if (mb > config.MEMORY_RESTART_THRESHOLD_MB) {
            if (deps.isBusy()) {
                console.log(`[watchdog] memory over threshold (${mb}MB) but job in progress`);
                return;
            }
            console.log(`[watchdog] memory over threshold (${mb}MB) — restarting browser`);
            try {
                await deps.restartBrowser(`memory-${mb}mb`);
            } catch (err) {
                console.error("[watchdog] memory-triggered restart failed:", err.message);
            }
        }
    }, config.MEMORY_CHECK_INTERVAL_MS);
    timers.push(memTimer);

    // ----------------------------------------------------------
    // 3) Login-state watcher — keeps meState accurate so /me/status
    //    (which the Android app polls) is never stale.
    // ----------------------------------------------------------
    const loginTimer = setInterval(async () => {
        try {
            const meState = deps.getMeState();
            const currentlyLoggedIn = meState === "DONE";

            const showingLogin = await deps.isShowingLoginForm();
            if (showingLogin === null) return; // unknown/transient, don't act

            if (lastKnownLoggedIn && showingLogin) {
                deps.setMeState("LOGIN");
                console.log("[watchdog] detected unexpected logout — meState reset to LOGIN");
            }

            lastKnownLoggedIn = currentlyLoggedIn && !showingLogin;

        } catch (err) {
            console.log("[watchdog] login-watch tick error (non-fatal):", err.message);
        }
    }, config.LOGIN_WATCH_INTERVAL_MS);
    timers.push(loginTimer);

    return {
        stop() {
            timers.forEach(clearInterval);
            timers = [];
        }
    };
}

module.exports = { startWatchdog };
