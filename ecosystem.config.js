// PM2 process manager config.
//
// Usage:
//   npm install -g pm2
//   pm2 start ecosystem.config.js
//   pm2 save                  # persist the process list
//   pm2 startup               # print the systemd command to enable on-boot start
//
// Why PM2 on top of the in-app watchdog (watchdog.js)?
//   watchdog.js restarts the *browser* (Chrome) on a schedule/memory
//   threshold while the Node process keeps running.
//   PM2 restarts the *Node process itself* if it crashes outright
//   (uncaught exception, DB connection dying, OOM kill of node
//   itself) — a second, independent safety net.
module.exports = {
    apps: [
        {
            name: "browser-automation",
            script: "server.js",
            cwd: __dirname,

            // Restart automatically on crash
            autorestart: true,

            // Hard safety net: if the Node process itself (not just
            // Chrome) balloons past this, PM2 kills and restarts it.
            max_memory_restart: "900M",

            // Belt-and-braces: restart once a day at 4am regardless,
            // in addition to the in-app browser-only restart schedule.
            cron_restart: "0 4 * * *",

            // Don't restart-loop forever if something is fundamentally
            // broken (bad DB creds, etc) — cap it and let it die so
            // it shows up clearly in `pm2 status` instead of spinning.
            max_restarts: 10,
            min_uptime: "30s",

            env: {
                NODE_ENV: "production"
            },

            out_file: "./logs/out.log",
            error_file: "./logs/error.log",
            time: true
        }
    ]
};
