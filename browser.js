const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

let context;
let page;

let isBusy = false;

// ------------------------------------------------------------------
// Restart mutex — prevents two restarts (manual + scheduled + crash
// recovery) from racing each other and leaving two Chrome processes
// fighting over the same profile lock.
// ------------------------------------------------------------------
let restarting = null;

// Timestamp bookkeeping, exposed via getStats() for /health
const stats = {
    startedAt: null,
    lastRestartAt: null,
    restartCount: 0,
    lastRestartReason: null,
    crashCount: 0
};

function getBusyStatus() {
    return isBusy;
}

function setBusyStatus(value) {
    isBusy = value;
}

function getStats() {
    return { ...stats };
}

const PROFILE_DIR = path.join(__dirname, "chrome-profile");
const SESSION_MARKER = path.join(__dirname, ".last-session.json");

async function launchContext() {
    const ctx = await chromium.launchPersistentContext(
        PROFILE_DIR,
        {
            headless: false,

            viewport: null,

            args: [
                "--start-maximized",
                "--no-sandbox",                 // Bypasses the OS security model inside Docker/VPS environments
                "--disable-setuid-sandbox",      // Prevents permission issues with the browser sandbox
                "--disable-dev-shm-usage",       // CRITICAL: Forces Chrome to write memory to disk instead of /dev/shm (RAM)
                "--disable-gpu",                 // Stops Chrome from trying to initialize nonexistent hardware graphics cards

                // --- Added for stability / lower footprint on a 1-vCPU VPS ---
                "--disable-extensions",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-breakpad",            // no crash-reporter upload traffic/CPU
                "--disable-client-side-phishing-detection",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-hang-monitor",
                "--disable-popup-blocking",
                "--disable-prompt-on-repost",
                "--disable-sync",
                "--disable-translate",
                "--metrics-recording-only",
                "--mute-audio",
                "--no-first-run",
                "--renderer-process-limit=2",
                "--js-flags=--max-old-space-size=512" // caps per-renderer JS heap so one runaway tab can't eat all RAM
            ],

            permissions: [
                "geolocation"
            ],

            geolocation: {
                latitude: 26.193807,
                longitude: 88.943849
            },

            locale: "en-US"
        }
    );

    return ctx;
}

async function startBrowser() {

    if (context && page && !page.isClosed()) {
        return page;
    }

    context = await launchContext();

    // If Chrome itself dies (OOM kill, crash, `kill -9`, etc.) the
    // context emits "close" — catch that so the next request triggers
    // a clean relaunch instead of throwing into a dead reference forever.
    context.removeAllListeners("close");
    context.on("close", () => {
        console.log("[browser] context 'close' event — marking dead");
        stats.crashCount++;
        context = null;
        page = null;
    });

    const pages = context.pages();

    if (pages.length > 0) {
        page = pages[0];
    } else {
        page = await context.newPage();
    }

    page.removeAllListeners("console");
    page.on("console", msg => {
        console.log("PAGE:", msg.text());
    });

    page.removeAllListeners("crash");
    page.on("crash", () => {
        console.error("[browser] PAGE CRASHED (renderer OOM/killed)");
        stats.crashCount++;
    });

    page.removeAllListeners("pageerror");
    page.on("pageerror", err => {
        console.log("PAGE ERROR:", err.message);
    });

    if (!page.url().startsWith("https://businessweb-mobi.com")) {

        await page.goto(
            "https://businessweb-mobi.com/",
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );

    }

    if (!stats.startedAt) {
        stats.startedAt = new Date().toISOString();
    }

    console.log("Website Opened");

    return page;
}

async function restartBrowser(reason = "manual") {

    // If a restart is already in-flight, just wait for it and hand
    // back the same page instead of launching a second Chrome.
    if (restarting) {
        console.log("[browser] restart already in progress, waiting on it...");
        return restarting;
    }

    restarting = (async () => {

        console.log("================================");
        console.log("RESTARTING BROWSER... reason:", reason);
        console.log("================================");

        try {
            if (context) {
                try {
                    await context.close();
                } catch (err) {
                    console.log("Error closing old browser:", err.message);
                }
            }

            context = null;
            page = null;

            await new Promise(resolve => setTimeout(resolve, 1000));

            const newPage = await startBrowser();

            stats.lastRestartAt = new Date().toISOString();
            stats.restartCount++;
            stats.lastRestartReason = reason;

            console.log("================================");
            console.log("BROWSER RESTARTED SUCCESSFULLY");
            console.log("================================");

            return newPage;

        } catch (err) {
            console.error("BROWSER RESTART FAILED:", err);
            context = null;
            page = null;
            throw err;
        }
    })();

    try {
        return await restarting;
    } finally {
        restarting = null;
    }
}

/**
 * Returns a guaranteed-usable page: if the current page/context died
 * (crash, manual kill, OOM), transparently relaunches before handing
 * it back. Prefer this over getPage() in any new automation code.
 */
async function getPageSafe() {
    if (!context || !page || page.isClosed()) {
        return restartBrowser("dead-page-detected");
    }
    return page;
}

/**
 * Lightweight session checkpoint. The persistent context already
 * writes cookies/localStorage to disk continuously (that's what
 * launchPersistentContext's profile dir is for), so this does not
 * need to do heavy lifting — it just records *when* we last
 * confirmed a good login, which /health and the logout-watchdog use.
 * Wrapped so it can NEVER throw and break the login flow again.
 */
async function saveSession() {
    try {
        const payload = {
            savedAt: new Date().toISOString(),
            url: page ? page.url() : null
        };
        fs.writeFileSync(SESSION_MARKER, JSON.stringify(payload, null, 2));
    } catch (err) {
        console.log("[browser] saveSession non-fatal error:", err.message);
    }
}

/**
 * Cheap on-page check for whether the login form is currently showing.
 * Used by the watchdog to detect an unexpected logout (session expired,
 * force-logged-out by the site, cookie wipe, etc.) even when nothing
 * actively threw an error.
 */
async function isShowingLoginForm() {
    try {
        if (!page || page.isClosed()) return null; // unknown, not "logged out"
        const count = await page.locator("#log").count();
        if (count === 0) return false;
        return await page.locator("#log").isVisible().catch(() => false);
    } catch (err) {
        return null; // unknown — don't false-positive a notification on a transient error
    }
}

function getPage() {
    return page;
}

function getContext() {
    return context;
}

module.exports = {
    startBrowser,
    restartBrowser,
    getPage,
    getPageSafe,
    getContext,
    getBusyStatus,
    setBusyStatus,
    saveSession,
    isShowingLoginForm,
    getStats
};
