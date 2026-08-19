const express = require("express");

const {
    startBrowser,
     restartBrowser,
    saveSession,
    getPage,
     getContext,
     getBusyStatus,
    getPageSafe,
    isShowingLoginForm,
    getStats
} = require("./browser");

const { startWatchdog } = require("./watchdog");
const config = require("./config");


const app = express();

app.use(express.json());

let meState = "LOGIN";
let otpAttempts = 0;
const MAX_OTP_ATTEMPTS = 3;

const queue = [];
let processing = false;

async function processQueue() {

    if (processing) {
        return;
    }

    processing = true;

    while (queue.length > 0) {

        const job = queue.shift();

        try {

            const result = await job.task();

            job.resolve(result);

        } catch (err) {

            // Best-effort: if this failure looks like the session died
            // mid-task (timeout waiting for a post-login element, page
            // closed), correct meState immediately instead of waiting
            // for the next watchdog poll — keeps /me/status accurate
            // for the Android app's next background check.
            const msg = (err && err.message) || "";
            const looksLikeSessionDeath =
                /waiting for (selector|locator)/i.test(msg) ||
                /Timeout .* exceeded/i.test(msg) ||
                /Target (page|context|browser) closed/i.test(msg);

            if (looksLikeSessionDeath) {
                isShowingLoginForm()
                    .then(showingLogin => {
                        if (showingLogin) meState = "LOGIN";
                    })
                    .catch(() => {});
            }

            job.reject(err);

        }

    }

    processing = false;
}

function addToQueue(task) {

    return new Promise((resolve, reject) => {

        queue.push({
            task,
            resolve,
            reject
        });

        processQueue();

    });

}








const { Client } = require('pg');

// Hardcoded database configurations as requested
const client = new Client({
  user: 'sakib_user',
  host: 'localhost', // Since the DB is on the same VPS
  database: 'sakib_db',
  password: 'sakib_user',
  port: 5432,
});

async function connectDB() {
  try {
    await client.connect();
    console.log('Successfully connected to PostgreSQL database!');
    
    // Quick test query to verify everything works
    const res = await client.query('SELECT NOW()');
    console.log('Database time:', res.rows[0].now);
    
  } catch (err) {
    console.error('Connection error', err.stack);
  }
}

connectDB();










app.post("/me/restart", async (req, res) => {

    try {

        const page = await getPageSafe();

        await page.goto(
            "https://businessweb-mobi.com/",
            {
                waitUntil: "domcontentloaded"
            }
        );

        meState = "LOGIN";
        otpAttempts = 0;

        res.redirect("/me");

    } catch (err) {

        res.send(err.message);

    }

});

app.post("/me/reset", async (req, res) => {

    const page = await getPageSafe();

    meState = "LOGIN";
    otpAttempts = 0;

    await page.goto(
        "https://businessweb-mobi.com/auth/login",
        {
            waitUntil: "networkidle"
        }
    );

    res.redirect("/me");
});


app.get("/me", async (req, res) => {

    const page = await getPageSafe();

    const screenshot = await page.screenshot({
        type: "png",
        fullPage: true
    });

    const image = screenshot.toString("base64");

    let form = "";

    if (meState === "LOGIN") {

        form = `

            <h3>Login</h3>

            <form method="POST" action="/me">

                <input
                    name="username"
                    placeholder="Username"
                    required
                >

                <br><br>

                <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    required
                >

                <br><br>

                <button type="submit">
                    Login
                </button>

            </form>

        `;

    }
    else if (meState === "OTP") {

        form = `

            <h3>
                OTP Verification
                (${otpAttempts}/${MAX_OTP_ATTEMPTS})
            </h3>

            <form method="POST" action="/me">

                <input
                    name="otp"
                    placeholder="2FA Code"
                    required
                >

                <br><br>

                <button type="submit">
                    Verify
                </button>

            </form>

        `;

    }
else {

    form = `
        <h2 style="color:green">
            Logged In Successfully
        </h2>

        <br>

        <form
            method="POST"
            action="/me/logout"
        >

            <button
                type="submit"
                style="
                    background:red;
                    color:white;
                    padding:10px 20px;
                    border:none;
                    cursor:pointer;
                "
            >
                Logout
            </button>

        </form>

        <br>

        <form
            method="POST"
            action="/me/reset"
        >

            <button
                type="submit"
            >
                Start Over
            </button>

        </form>
    `;

}

    res.send(`

        <html>

        <body>

            <h2>Browser Screen</h2>

            <img
                src="data:image/png;base64,${image}"
                style="width:100%;max-width:1200px"
            >

            <hr>

            ${form}

            <hr>

            <form method="POST" action="/me/reset">

                <button
                    type="submit"
                    style="
                        background:red;
                        color:white;
                        padding:10px;
                    "
                >
                    Start From Beginning
                </button>

            </form>

        </body>

        </html>

    `);

});

app.post(
    "/me",
    express.urlencoded({
        extended: true
    }),
    async (req, res) => {

        try {

            const page = await getPageSafe();

            //------------------------------------
            // LOGIN STAGE
            //------------------------------------

            if (meState === "LOGIN") {

                const {
                    username,
                    password
                } = req.body;

                if (!username || !password) {
                    return res.redirect("/me");
                }

                //------------------------------------
                // Username
                //------------------------------------

                const usernameInput =
                    page.locator("#log");

                await usernameInput.waitFor({
                    state: "visible",
                    timeout: 30000
                });

                await usernameInput.click();
                await usernameInput.press("Control+A");
                await usernameInput.press("Backspace");
                await usernameInput.fill(username);

                //------------------------------------
                // Password
                //------------------------------------

                const passwordInput =
                    page.locator("#pass");

                await passwordInput.waitFor({
                    state: "visible",
                    timeout: 30000
                });

                await passwordInput.click();
                await passwordInput.press("Control+A");
                await passwordInput.press("Backspace");
                await passwordInput.fill(password);

                //------------------------------------
                // Remember Me
                //------------------------------------

                const remember =
                    page.locator(
                        'input[name="rememberMe"]'
                    );

                if (!(await remember.isChecked())) {

                    await remember.check();

                }

                //------------------------------------
                // Login Button
                //------------------------------------

                const loginButton =
                    page.locator(
                        'button[data-testid="submit-button"]'
                    ).first();

                await loginButton.waitFor({
                    state: "visible"
                });

                await loginButton.click();

                //------------------------------------
                // Wait OTP Page
                //------------------------------------

                await page.locator("#mfaCode")
                    .waitFor({
                        state: "visible",
                        timeout: 30000
                    });

                meState = "OTP";
                otpAttempts = 0;

                return res.redirect("/me");
            }

            //------------------------------------
            // OTP STAGE
            //------------------------------------

            if (meState === "OTP") {

                const { otp } = req.body;

                if (!otp) {
                    return res.redirect("/me");
                }

                otpAttempts++;

                //------------------------------------
                // OTP Input
                //------------------------------------

                const otpInput =
                    page.locator("#mfaCode");

                await otpInput.waitFor({
                    state: "visible",
                    timeout: 30000
                });

                await otpInput.click();
                await otpInput.press("Control+A");
                await otpInput.press("Backspace");
                await otpInput.fill(otp);

                //------------------------------------
                // Final Login Button
                //------------------------------------

                const finalLoginButton =
                    page.locator(
                        'button[data-testid="submit-button"]'
                    ).last();

                await finalLoginButton.waitFor({
                    state: "visible"
                });

                await finalLoginButton.click();

                //------------------------------------
                // Wait
                //------------------------------------

                await page.waitForTimeout(5000);

                //------------------------------------
                // Check if OTP page still exists
                //------------------------------------

                const otpCount =
                    await page
                        .locator("#mfaCode")
                        .count();

                if (otpCount > 0) {

                    const visible =
                        await page
                            .locator("#mfaCode")
                            .isVisible()
                            .catch(() => false);

                    if (visible) {

                        if (
                            otpAttempts >=
                            MAX_OTP_ATTEMPTS
                        ) {

                            meState = "LOGIN";
                            otpAttempts = 0;

                        }

                        return res.redirect("/me");
                    }
                }

                //------------------------------------
                // Login Success
                //------------------------------------

                meState = "DONE";
                otpAttempts = 0;

                await saveSession();

                return res.redirect("/me");
            }

            //------------------------------------
            // DONE
            //------------------------------------

            return res.redirect("/me");

        } catch (err) {

            const page = await getPageSafe();

            const screenshot =
                await page.screenshot({
                    type: "png",
                    fullPage: true
                });

            const image =
                screenshot.toString("base64");

            res.send(`
                <html>
                <body>

                    <h2 style="color:red">
                        ERROR
                    </h2>

                    <pre>
${err.stack}
                    </pre>

                    <img
                        src="data:image/png;base64,${image}"
                        style="width:100%"
                    >

                    <br><br>

                    <a href="/me">
                        Back
                    </a>

                </body>
                </html>
            `);
        }
    }
);



// app.post("/me/logout", async (req, res) => {

//     try {

//         const page = await getPageSafe();

//         const logoutButton =
//             page.locator(
//                 "button.nav-item--logout"
//             );

//         await logoutButton.waitFor({
//             state: "visible",
//             timeout: 10000
//         });

//         await logoutButton.click();

//         //------------------------------------
//         // Reset local state
//         //------------------------------------

//         meState = "LOGIN";
//         otpAttempts = 0;

//         //------------------------------------
//         // Wait a little
//         //------------------------------------

//         await page.waitForTimeout(3000);

//         return res.redirect("/me");

//     } catch (err) {

//         console.error(err);

//         return res.redirect("/me");

//     }

// });
app.post("/me/logout", async (req, res) => {
    try {
        const page = await getPageSafe();

        // 1. Click the initial navigation logout button
        const logoutButton = page.locator("button.nav-item--logout");
        await logoutButton.waitFor({
            state: "visible",
            timeout: 10000
        });
        await logoutButton.click();

        // 2. Click the confirmation modal button
        // We use the exact class from your HTML snippet
        const confirmButton = page.locator("button.logout-modal__confirm--danger");
        await confirmButton.waitFor({
            state: "visible",
            timeout: 5000 // A short timeout since modals usually appear instantly
        });
        await confirmButton.click();

        //------------------------------------
        // Reset local state
        //------------------------------------
        meState = "LOGIN";
        otpAttempts = 0;

        //------------------------------------
        // Wait a little for the session to clear
        //------------------------------------
        await page.waitForTimeout(3000);
        return res.redirect("/me");

    } catch (err) {
        console.error("Logout process encountered an error:", err);
        return res.redirect("/me");
    }
});
app.get("/", (req, res) => {
    res.send("Automation Running");
});



app.get("/history", async (req, res) => {

    try {

        const result = await client.query(`
            SELECT *
            FROM transactions
            ORDER BY id DESC
            LIMIT 500
        `);

        res.json({
            success: true,
            total: result.rows.length,
            data: result.rows
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});




app.get("/history-failed", async (req, res) => {

    try {

        const result = await client.query(`
            SELECT *
            FROM transactions
            WHERE status = 'FAILED'
            ORDER BY id DESC
        `);

        res.json({
            success: true,
            total: result.rows.length,
            data: result.rows
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});



app.get("/history/:id", async (req, res) => {

    try {

        const result = await client.query(`
            SELECT *
            FROM transactions
            WHERE id = $1
        `,
        [
            req.params.id
        ]);

        if (result.rows.length === 0) {

            return res.status(404).json({
                success: false,
                error: "Transaction not found"
            });

        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});




app.get("/history-success", async (req, res) => {

    try {

        const result = await client.query(`
            SELECT *
            FROM transactions
            WHERE status = 'SUCCESS'
            ORDER BY id DESC
        `);

        res.json({
            success: true,
            total: result.rows.length,
            data: result.rows
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});





app.get("/switches", async (req, res) => {

    try {

        const result = await client.query(`
            SELECT *
            FROM automation_settings
            WHERE id = 1
        `);

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});




app.post("/main-switch/on", async (req, res) => {

    try {

        await client.query(`
            UPDATE automation_settings
            SET
                main_switch = 10,
                updated_at = NOW()
            WHERE id = 1
        `);

        res.json({
            success: true,
            main_switch: 10
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});



app.post("/main-switch/off", async (req, res) => {

    try {

        await client.query(`
            UPDATE automation_settings
            SET
                main_switch = 0,
                updated_at = NOW()
            WHERE id = 1
        `);

        res.json({
            success: true,
            main_switch: 0
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});


app.post("/sub-switch/on", async (req, res) => {

    try {

        await client.query(`
            UPDATE automation_settings
            SET
                sub_switch = 20,
                updated_at = NOW()
            WHERE id = 1
        `);

        res.json({
            success: true,
            sub_switch: 20
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});
app.post("/sub-switch/off", async (req, res) => {

    try {

        await client.query(`
            UPDATE automation_settings
            SET
                sub_switch = 0,
                updated_at = NOW()
            WHERE id = 1
        `);

        res.json({
            success: true,
            sub_switch: 0
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});


app.get("/setup-database", async (req, res) => {

    try {

        //------------------------------------------------------
        // automation_settings
        //------------------------------------------------------

        await client.query(`

            CREATE TABLE IF NOT EXISTS automation_settings (

                id SERIAL PRIMARY KEY,

                main_switch INTEGER NOT NULL DEFAULT 10,

                sub_switch INTEGER NOT NULL DEFAULT 20,

                updated_at TIMESTAMP NOT NULL DEFAULT NOW()

            )

        `);

        //------------------------------------------------------
        // transactions
        //------------------------------------------------------

        await client.query(`

            CREATE TABLE IF NOT EXISTS transactions (

                id BIGSERIAL PRIMARY KEY,

                type VARCHAR(20) NOT NULL,

                reference_id VARCHAR(100),

                web_user_id BIGINT,

                withdraw_code VARCHAR(100),

                amount NUMERIC(18,2),

                status VARCHAR(20) NOT NULL DEFAULT 'PENDING',

                failure_reason TEXT,

                request_json JSONB,

                response_json JSONB,

                duration_ms INTEGER,

                created_at TIMESTAMP NOT NULL DEFAULT NOW(),

                completed_at TIMESTAMP

            )

        `);

        //------------------------------------------------------
        // Insert default settings if table is empty
        //------------------------------------------------------

        const result = await client.query(
            "SELECT COUNT(*) FROM automation_settings"
        );

        if (Number(result.rows[0].count) === 0) {

            await client.query(`

                INSERT INTO automation_settings
                (
                    main_switch,
                    sub_switch
                )
                VALUES
                (
                    10,
                    20
                )

            `);

        }

        res.json({
            success: true,
            message: "Database setup completed."
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});











// async function deposit(webUserId, amount) {

//                 const page = await getPageSafe();

//                 console.log("\n==============================");
//                 console.log("START DEPOSIT");
//                 console.log("User:", webUserId);
//                 console.log("Amount:", amount);
//                 console.log("==============================");

//                 try {

//                     //----------------------------------------------------
//                     // Open Deposit Modal
//                     //----------------------------------------------------

// await page.reload();
//     await page.waitForLoadState("domcontentloaded");

//                     console.log("[1] Clicking Deposit button...");

//                     await page.getByTestId("deposit-show-button").click();

//                     //----------------------------------------------------
//                     // Wait for User ID Input
//                     //----------------------------------------------------

//                     console.log("[2] Waiting for User ID input...");

//                     const userInput = page
//                         .locator('div[data-testid="deposit-search-user-input"]')
//                         .locator("input#client_id");

//                     await userInput.waitFor({
//                         state: "visible",
//                         timeout: 30000
//                     });

//                     console.log("[3] Filling User ID...");

//                     await userInput.click();

//                     await userInput.press("Control+A");
//                     await userInput.press("Backspace");

//                     await userInput.fill(String(webUserId));

//                     const typedId = await userInput.inputValue();

//                     console.log("Typed User ID =", typedId);

//                     if (typedId !== String(webUserId)) {
//                         throw new Error(
//                             `User ID mismatch. Expected ${webUserId}, Got ${typedId}`
//                         );
//                     }

//                     //----------------------------------------------------
//                     // Click Next
//                     //----------------------------------------------------

//                     console.log("[4] Clicking Next...");

//                     const nextButton = page.getByTestId("deposit-search-user-submit");

//                     await nextButton.waitFor({
//                         state: "visible"
//                     });

//                     await Promise.all([
//                         nextButton.click(),
//                         page.waitForLoadState("networkidle").catch(() => {})
//                     ]);

//                     console.log("[5] Waiting for Amount input...");

//                     //----------------------------------------------------
//                     // Wait Amount Input
//                     //----------------------------------------------------

//                     const amountInput = page.locator("input#amount");

//                     await amountInput.waitFor({
//                         state: "visible",
//                         timeout: 30000
//                     });

//                     console.log("[6] Filling Amount...");

//                     await amountInput.click();

//                     await amountInput.press("Control+A");
//                     await amountInput.press("Backspace");

//                     await amountInput.fill(String(amount));

//                     const typedAmount = await amountInput.inputValue();

//                     console.log("Typed Amount =", typedAmount);

//                     //----------------------------------------------------
//                     // Deposit Button
//                     //----------------------------------------------------

//                     console.log("[7] Waiting Deposit button...");

//             const depositModal = page.getByTestId("modal-deposit-amount");

//             await depositModal.waitFor({
//                 state: "visible"
//             });

//             const depositButton = depositModal.getByRole("button", {
//                 name: "Deposit"
//             });

//             await depositButton.click();





//                     try {
//             const errorToastSelector = 'h4.custom-toast__title[data-v-38b0b119]';

//             // We race the error toast against the modal disappearing. 
//             // If the modal hides, it usually means the form successfully processed!
//             await Promise.race([
//                 page.waitForSelector(errorToastSelector, { state: 'attached', timeout: 4000 }),
//                 depositModal.waitFor({ state: 'hidden', timeout: 4000 })
//             ]);

//             // Check if the error element actually exists right now
//             const hasError = await page.locator(errorToastSelector).count();

//             if (hasError > 0) {
//                 console.log("========== FAILED (Toast Error Detected) ==========");
//                 return {
//                     success: false,
//                     reason: "Error toast appeared on page."
//                 };
//             }

//             console.log("Modal closed or processed without visible errors.");

//         } catch (raceError) {
//             // Fallback catch if timeouts happen, but no visible error banner exists
//             console.log("Outcome resolution trace:", raceError.message);
//         }







//                     console.log("========== SUCCESS ==========");

//                     return {
//                         success: true
//                     };

//                 } catch (err) {

//                     console.log("========== FAILED ==========");
//                     console.log(err);

//                     try {

//                         // await page.screenshot({
//                         //     path: `deposit-error-${Date.now()}.png`,
//                         //     fullPage: true
//                         // });

//                         console.log("Screenshot saved.");

//                     } catch {}

//                     throw err;
//                 }

// }

async function deposit(webUserId, amount) {

    const page = await getPageSafe();

    console.log("\n==============================");
    console.log("START DEPOSIT");
    console.log("User:", webUserId);
    console.log("Amount:", amount);
    console.log("==============================");

    try {

        //----------------------------------------------------
        // Open Deposit Modal
        //----------------------------------------------------

        await page.reload();
        await page.waitForLoadState("domcontentloaded");

        console.log("[1] Clicking Deposit button...");

        await page.getByTestId("deposit-show-button").click();

        //----------------------------------------------------
        // Wait for User ID Input
        //----------------------------------------------------

        console.log("[2] Waiting for User ID input...");

        const userInput = page
            .locator('div[data-testid="deposit-search-user-input"]')
            .locator("input#client_id");

        await userInput.waitFor({
            state: "visible",
            timeout: 30000
        });

        console.log("[3] Filling User ID...");

        await userInput.click();

        await userInput.press("Control+A");
        await userInput.press("Backspace");

        await userInput.fill(String(webUserId));

        const typedId = await userInput.inputValue();

        console.log("Typed User ID =", typedId);

        if (typedId !== String(webUserId)) {
            throw new Error(
                `User ID mismatch. Expected ${webUserId}, Got ${typedId}`
            );
        }

        //----------------------------------------------------
        // Click Next
        //----------------------------------------------------

        console.log("[4] Clicking Next...");

        const nextButton = page.getByTestId("deposit-search-user-submit");

        await nextButton.waitFor({
            state: "visible"
        });

        await Promise.all([
            nextButton.click(),
            page.waitForLoadState("networkidle").catch(() => {})
        ]);

        console.log("[5] Waiting for Amount input...");

        //----------------------------------------------------
        // Wait Amount Input
        //----------------------------------------------------

        const amountInput = page.locator("input#amount");

        await amountInput.waitFor({
            state: "visible",
            timeout: 30000
        });

        console.log("[6] Filling Amount...");

        await amountInput.click();

        await amountInput.press("Control+A");
        await amountInput.press("Backspace");

        await amountInput.fill(String(amount));

        const typedAmount = await amountInput.inputValue();

        console.log("Typed Amount =", typedAmount);

        //----------------------------------------------------
        // Deposit Button
        //----------------------------------------------------

        console.log("[7] Waiting Deposit button...");

        const depositModal = page.getByTestId("modal-deposit-amount");

        await depositModal.waitFor({
            state: "visible"
        });

        const depositButton = depositModal.getByRole("button", {
            name: "Deposit"
        });

        await depositButton.click();

        //----------------------------------------------------
        // Look for Error Toast vs. Success Path
        //----------------------------------------------------
        console.log("[8] Checking transaction outcome...");

        // Give the network and UI animations a clear moment to settle down
        await page.waitForTimeout(2000);

        // Explicitly check if a visible error message toast is on screen right now
        const errorToastSelector = 'h4.custom-toast__title[data-v-38b0b119]';
        const activeErrorToast = page.locator(errorToastSelector).filter({ hasText: 'Error' });
        const isErrorVisible = await activeErrorToast.isVisible().catch(() => false);

        if (isErrorVisible) {
            console.log("========== FAILED (Toast Error Confirmed) ==========");
            return {
                success: false,
                reason: "Error toast appeared on page."
            };
        }

        console.log("No active error toast visible. Verification clear.");
        console.log("========== SUCCESS ==========");

        return {
            success: true
        };

    } catch (err) {

        console.log("========== FAILED ==========");
        console.log(err);

        try {
            // await page.screenshot({
            //     path: `deposit-error-${Date.now()}.png`,
            //     fullPage: true
            // });
            console.log("Screenshot saved.");
        } catch {}

        throw err;
    }
}

// app.post("/deposit", async (req, res) => {

//     try {

//         const { webUserId, amount } = req.body;

//         await deposit(webUserId, amount);

//         res.json({
//             success: true
//         });

//     } catch (e) {

//         console.error(e);

//         res.status(500).json({
//             success: false,
//             error: e.message
//         });

//     }

// });


// app.post("/deposit", async (req, res) => {

//     let transactionId = null;

//     try {

//         const { webUserId, amount } = req.body;

//         if (!webUserId || !amount) {

//             return res.status(400).json({
//                 success: false,
//                 error: "webUserId and amount are required"
//             });

//         }

//         if (getBusyStatus()) {

//             return res.status(409).json({
//                 success: false,
//                 error: "Automation is busy"
//             });

//         }

//         //----------------------------------------------------
//         // Check switches
//         //----------------------------------------------------

//         const setting = await client.query(`
//             SELECT main_switch, sub_switch
//             FROM automation_settings
//             WHERE id = 1
//         `);

//         if (
//             setting.rows.length === 0 ||
//             setting.rows[0].main_switch !== 10 ||
//             setting.rows[0].sub_switch !== 20
//         ) {

//             return res.json({
//                 success: false,
//                 code: 0
//             });

//         }

//         //----------------------------------------------------
//         // Lock automation
//         //----------------------------------------------------

//         setBusyStatus(true);

//         //----------------------------------------------------
//         // Insert transaction
//         //----------------------------------------------------

//         const trx = await client.query(`
//             INSERT INTO transactions
//             (
//                 type,
//                 web_user_id,
//                 amount,
//                 status
//             )
//             VALUES
//             (
//                 'deposit',
//                 $1,
//                 $2,
//                 'PENDING'
//             )
//             RETURNING id
//         `,
//         [
//             webUserId,
//             amount
//         ]);

//         transactionId = trx.rows[0].id;

//         //----------------------------------------------------
//         // Execute automation
//         //----------------------------------------------------

//         await deposit(webUserId, amount);

//         //----------------------------------------------------
//         // Mark success
//         //----------------------------------------------------

//         await client.query(`
//             UPDATE transactions
//             SET
//                 status='SUCCESS',
//                 completed_at=NOW()
//             WHERE id=$1
//         `,
//         [
//             transactionId
//         ]);

//         res.json({
//             success: true
//         });

//     } catch (e) {

//         console.error(e);

//         if (transactionId) {

//             await client.query(`
//                 UPDATE transactions
//                 SET
//                     status='FAILED',
//                     failure_reason=$1,
//                     completed_at=NOW()
//                 WHERE id=$2
//             `,
//             [
//                 e.message,
//                 transactionId
//             ]);

//         }

//         res.status(500).json({
//             success: false,
//             error: e.message
//         });

//     } finally {

//         setBusyStatus(false);

//     }

// });

// app.post("/deposit", async (req, res) => {

//     try {

//         const result = await addToQueue(async () => {

//             let transactionId = null;

//             const { webUserId, amount } = req.body;

//             if (!webUserId || !amount) {

//                 return {
//                     success: false,
//                     error: "webUserId and amount are required"
//                 };

//             }

//             const setting = await client.query(`
//                 SELECT main_switch, sub_switch
//                 FROM automation_settings
//                 WHERE id = 1
//             `);

//             if (
//                 setting.rows.length === 0 ||
//                 setting.rows[0].main_switch !== 10 ||
//                 setting.rows[0].sub_switch !== 20
//             ) {

//                 return {
//                     success: false,
//                     code: 0
//                 };

//             }

//             const trx = await client.query(`
//                 INSERT INTO transactions
//                 (
//                     type,
//                     web_user_id,
//                     amount,
//                     status,
//                     request_json
//                 )
//                 VALUES
//                 (
//                     'deposit',
//                     $1,
//                     $2,
//                     'PENDING',
//                     $3
//                 )
//                 RETURNING id
//             `,
//             [
//                 webUserId,
//                 amount,
//                 JSON.stringify(req.body)
//             ]);

//             transactionId = trx.rows[0].id;

//             try {

//                 const startTime = Date.now();

//                 await deposit(webUserId, amount);

//                 const duration = Date.now() - startTime;

//                 await client.query(`
//                     UPDATE transactions
//                     SET
//                         status='SUCCESS',
//                         duration_ms=$1,
//                         response_json=$2,
//                         completed_at=NOW()
//                     WHERE id=$3
//                 `,
//                 [
//                     duration,
//                     JSON.stringify({
//                         success: true
//                     }),
//                     transactionId
//                 ]);

//                 return {
//                     success: true
//                 };

//             } catch (err) {

//                 await client.query(`
//                     UPDATE transactions
//                     SET
//                         status='FAILED',
//                         failure_reason=$1,
//                         completed_at=NOW()
//                     WHERE id=$2
//                 `,
//                 [
//                     err.message,
//                     transactionId
//                 ]);

//                 throw err;

//             }

//         });

//         res.json(result);

//     } catch (err) {

//         console.error(err);

//         res.status(500).json({
//             success: false,
//             error: err.message
//         });

//     }

// });

app.post("/deposit", async (req, res) => {
    // 1. Define your hardcoded secret token here
    const HARDCODED_AUTH_TOKEN = "your-secure-static-token-here";

    try {
        // 2. Extract token from standard "Authorization: Bearer <token>" format, or fall back to raw string
        const authHeader = req.headers.authorization;
        let incomingToken = authHeader;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            incomingToken = authHeader.substring(7); // Extract just the token string after "Bearer "
        }

        // 3. Authorization Guard Check
        if (!incomingToken || incomingToken !== HARDCODED_AUTH_TOKEN) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        // --- Authorized! Proceed with regular logic ---
        const result = await addToQueue(async () => {
            let transactionId = null;
            const { webUserId, amount } = req.body;

            if (!webUserId || !amount) {
                return {
                    success: false,
                    error: "webUserId and amount are required"
                };
            }

            const setting = await client.query(`
                SELECT main_switch, sub_switch
                FROM automation_settings
                WHERE id = 1
            `);

            if (
                setting.rows.length === 0 ||
                setting.rows[0].main_switch !== 10 ||
                setting.rows[0].sub_switch !== 20
            ) {
                return {
                    success: false,
                    code: 0
                };
            }

            const trx = await client.query(`
                INSERT INTO transactions
                (
                    type,
                    web_user_id,
                    amount,
                    status,
                    request_json
                )
                VALUES
                (
                    'deposit',
                    $1,
                    $2,
                    'PENDING',
                    $3
                )
                RETURNING id
            `,
            [
                webUserId,
                amount,
                JSON.stringify(req.body)
            ]);

            transactionId = trx.rows[0].id;

            try {
                const startTime = Date.now();

                await deposit(webUserId, amount);

                const duration = Date.now() - startTime;

                await client.query(`
                    UPDATE transactions
                    SET
                        status='SUCCESS',
                        duration_ms=$1,
                        response_json=$2,
                        completed_at=NOW()
                    WHERE id=$3
                `,
                [
                    duration,
                    JSON.stringify({
                        success: true
                    }),
                    transactionId
                ]);

                return {
                    success: true
                };

            } catch (err) {
                await client.query(`
                    UPDATE transactions
                    SET
                        status='FAILED',
                        failure_reason=$1,
                        completed_at=NOW()
                    WHERE id=$2
                `,
                [
                    err.message,
                    transactionId
                ]);

                throw err;
            }
        });

        res.json(result);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});




async function withdraw(withdrawCode) {

    const page = await getPageSafe();

    console.log("\n==============================");
    console.log("START WITHDRAW");
    console.log("Code:", withdrawCode);
    console.log("==============================");

    try {

        //------------------------------------------------
        // Open Withdraw Modal
        //------------------------------------------------
await page.reload();
    await page.waitForLoadState("domcontentloaded");
        console.log("[1] Open Withdraw");

        await page.getByTestId("withdraw-show-button").click();

        //------------------------------------------------
        // Withdrawal Code Input
        //------------------------------------------------

        console.log("[2] Waiting for code input");

        const codeInput = page.locator("input#code");

        await codeInput.waitFor({
            state: "visible",
            timeout: 30000
        });

        console.log("[3] Filling withdrawal code");

        await codeInput.click();

        await codeInput.press("Control+A");
        await codeInput.press("Backspace");

        await codeInput.fill(String(withdrawCode));

        const typedCode = await codeInput.inputValue();

        console.log("Typed Code =", typedCode);

        if (typedCode !== String(withdrawCode)) {
            throw new Error(
                `Withdrawal code mismatch. Expected ${withdrawCode}, got ${typedCode}`
            );
        }

        //------------------------------------------------
        // Next
        //------------------------------------------------

        console.log("[4] Clicking Next");

        const nextButton = page.getByTestId("withdraw-search-payout-submit");

        await nextButton.waitFor({
            state: "visible"
        });

        await nextButton.click();

        //------------------------------------------------
        // Wait for final Withdraw button
        //------------------------------------------------

        console.log("[5] Waiting for final Withdraw button");

        const withdrawButton = page.getByTestId("withdraw-accept-payout");

        await withdrawButton.waitFor({
            state: "visible",
            timeout: 30000
        });

        console.log("[6] Clicking Withdraw");

        await Promise.all([
            withdrawButton.click(),
            page.waitForLoadState("networkidle").catch(() => {})
        ]);

        console.log("========== WITHDRAW SUCCESS ==========");

        return {
            success: true
        };

    } catch (err) {

        console.log("========== WITHDRAW FAILED ==========");
        console.log(err);

        try {
            await page.screenshot({
                path: `withdraw-error-${Date.now()}.png`,
                fullPage: true
            });
        } catch {}

        throw err;
    }
}







app.post("/restart-browser", async (req, res) => {

    try {

        console.log("Browser restart requested...");

        // IMPORTANT: this now waits its turn behind the job queue
        // instead of calling restartBrowser() directly. Previously,
        // hitting this while a deposit/withdraw was mid-flight would
        // null out the shared page out from under it — the deposit's
        // next page.reload()/page.click() etc. would then throw
        // "Cannot read properties of null" and the job would fail.
        // Queuing it guarantees no automation step ever runs against
        // a page that's being torn down.
        await addToQueue(() => restartBrowser("manual-api"));

        res.json({
            success: true,
            message: "Browser restarted successfully"
        });

    } catch (err) {

        console.error("Browser restart error:", err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});








// app.post("/withdraw", async (req, res) => {

//     try {

//         const { withdrawCode } = req.body;

//         if (!withdrawCode) {

//             return res.status(400).json({
//                 success: false,
//                 error: "withdrawCode is required"
//             });

//         }

//         if (getBusyStatus()) {

//             return res.status(409).json({
//                 success: false,
//                 error: "Automation is busy"
//             });

//         }

//         setBusyStatus(true);

//         const result = await withdraw(withdrawCode);

//         res.json({
//             success: true,
//             result
//         });

//     } catch (err) {

//         console.error(err);

//         res.status(500).json({
//             success: false,
//             error: err.message
//         });

//     } finally {

//         setBusyStatus(false);

//     }

// });

// app.post("/withdraw", async (req, res) => {

//     let transactionId = null;

//     try {

//         const { withdrawCode } = req.body;

//         if (!withdrawCode) {

//             return res.status(400).json({
//                 success: false,
//                 error: "withdrawCode is required"
//             });

//         }

//         //----------------------------------------------------
//         // Busy Check
//         //----------------------------------------------------

//         if (getBusyStatus()) {

//             return res.status(409).json({
//                 success: false,
//                 error: "Automation is busy"
//             });

//         }

//         //----------------------------------------------------
//         // Check Switches
//         //----------------------------------------------------

//         const setting = await client.query(`
//             SELECT main_switch, sub_switch
//             FROM automation_settings
//             WHERE id = 1
//         `);

//         if (
//             setting.rows.length === 0 ||
//             setting.rows[0].main_switch !== 10 ||
//             setting.rows[0].sub_switch !== 20
//         ) {

//             return res.json({
//                 success: false,
//                 code: 0
//             });

//         }

//         //----------------------------------------------------
//         // Lock Automation
//         //----------------------------------------------------

//         setBusyStatus(true);

//         //----------------------------------------------------
//         // Create Transaction
//         //----------------------------------------------------

//         const trx = await client.query(`
//             INSERT INTO transactions
//             (
//                 type,
//                 withdraw_code,
//                 status
//             )
//             VALUES
//             (
//                 'withdraw',
//                 $1,
//                 'PENDING'
//             )
//             RETURNING id
//         `,
//         [
//             withdrawCode
//         ]);

//         transactionId = trx.rows[0].id;

//         //----------------------------------------------------
//         // Execute Automation
//         //----------------------------------------------------

//         await withdraw(withdrawCode);

//         //----------------------------------------------------
//         // Success
//         //----------------------------------------------------

//         await client.query(`
//             UPDATE transactions
//             SET
//                 status='SUCCESS',
//                 completed_at=NOW()
//             WHERE id=$1
//         `,
//         [
//             transactionId
//         ]);

//         res.json({
//             success: true
//         });

//     } catch (err) {

//         console.error(err);

//         if (transactionId) {

//             await client.query(`
//                 UPDATE transactions
//                 SET
//                     status='FAILED',
//                     failure_reason=$1,
//                     completed_at=NOW()
//                 WHERE id=$2
//             `,
//             [
//                 err.message,
//                 transactionId
//             ]);

//         }

//         res.status(500).json({
//             success: false,
//             error: err.message
//         });

//     } finally {

//         setBusyStatus(false);

//     }

// });


// app.post("/withdraw", async (req, res) => {

//     try {

//         const result = await addToQueue(async () => {

//             let transactionId = null;

//             const { withdrawCode } = req.body;

//             if (!withdrawCode) {

//                 return {
//                     success: false,
//                     error: "withdrawCode is required"
//                 };

//             }

//             const setting = await client.query(`
//                 SELECT main_switch, sub_switch
//                 FROM automation_settings
//                 WHERE id = 1
//             `);

//             if (
//                 setting.rows.length === 0 ||
//                 setting.rows[0].main_switch !== 10 ||
//                 setting.rows[0].sub_switch !== 20
//             ) {

//                 return {
//                     success: false,
//                     code: 0
//                 };

//             }

//             const trx = await client.query(`
//                 INSERT INTO transactions
//                 (
//                     type,
//                     withdraw_code,
//                     status,
//                     request_json
//                 )
//                 VALUES
//                 (
//                     'withdraw',
//                     $1,
//                     'PENDING',
//                     $2
//                 )
//                 RETURNING id
//             `,
//             [
//                 withdrawCode,
//                 JSON.stringify(req.body)
//             ]);

//             transactionId = trx.rows[0].id;

//             try {

//                 const startTime = Date.now();

//                 await withdraw(withdrawCode);

//                 const duration = Date.now() - startTime;

//                 await client.query(`
//                     UPDATE transactions
//                     SET
//                         status='SUCCESS',
//                         duration_ms=$1,
//                         response_json=$2,
//                         completed_at=NOW()
//                     WHERE id=$3
//                 `,
//                 [
//                     duration,
//                     JSON.stringify({
//                         success: true
//                     }),
//                     transactionId
//                 ]);

//                 return {
//                     success: true
//                 };

//             } catch (err) {

//                 await client.query(`
//                     UPDATE transactions
//                     SET
//                         status='FAILED',
//                         failure_reason=$1,
//                         completed_at=NOW()
//                     WHERE id=$2
//                 `,
//                 [
//                     err.message,
//                     transactionId
//                 ]);

//                 throw err;

//             }

//         });

//         res.json(result);

//     } catch (err) {

//         console.error(err);

//         res.status(500).json({
//             success: false,
//             error: err.message
//         });

//     }

// });
app.post("/withdraw", async (req, res) => {
    // 1. Define your hardcoded secret token here (matches your deposit route)
    const HARDCODED_AUTH_TOKEN = "your-secure-static-token-here";

    try {
  










        const authHeader = req.headers.authorization;
        let incomingToken = authHeader;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            incomingToken = authHeader.substring(7);
        }










        // 3. Authorization Guard Check
        if (!incomingToken || incomingToken !== HARDCODED_AUTH_TOKEN) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        // --- Authorized! Proceed with regular logic ---
        const result = await addToQueue(async () => {
            let transactionId = null;
            const { withdrawCode } = req.body;

            if (!withdrawCode) {
                return {
                    success: false,
                    error: "withdrawCode is required"
                };
            }

            const setting = await client.query(`
                SELECT main_switch, sub_switch
                FROM automation_settings
                WHERE id = 1
            `);

            if (
                setting.rows.length === 0 ||
                setting.rows[0].main_switch !== 10 ||
                setting.rows[0].sub_switch !== 20
            ) {
                return {
                    success: false,
                    code: 0
                };
            }

            const trx = await client.query(`
                INSERT INTO transactions
                (
                    type,
                    withdraw_code,
                    status,
                    request_json
                )
                VALUES
                (
                    'withdraw',
                    $1,
                    'PENDING',
                    $2
                )
                RETURNING id
            `,
            [
                withdrawCode,
                JSON.stringify(req.body)
            ]);

            transactionId = trx.rows[0].id;

            try {
                const startTime = Date.now();

                await withdraw(withdrawCode);

                const duration = Date.now() - startTime;

                await client.query(`
                    UPDATE transactions
                    SET
                        status='SUCCESS',
                        duration_ms=$1,
                        response_json=$2,
                        completed_at=NOW()
                    WHERE id=$3
                `,
                [
                    duration,
                    JSON.stringify({
                        success: true
                    }),
                    transactionId
                ]);

                return {
                    success: true
                };

            } catch (err) {
                await client.query(`
                    UPDATE transactions
                    SET
                        status='FAILED',
                        failure_reason=$1,
                        completed_at=NOW()
                    WHERE id=$2
                `,
                [
                    err.message,
                    transactionId
                ]);

                throw err;
            }
        });

        res.json(result);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get("/queue-status", (req, res) => {

    res.json({
        processing,
        waiting: queue.length
    });

});

//======================================================================
// NEW: Health / maintenance / notification routes
// (additive only — nothing above this line was changed in behavior)
//======================================================================

// Lightweight JSON health check — safe to hit every few seconds from
// an uptime monitor (UptimeRobot, cron+curl, PM2, etc) without the
// screenshot overhead of GET /me.
app.get("/health", (req, res) => {

    const mem = process.memoryUsage();

    res.json({
        ok: true,
        meState,
        otpAttempts,
        queue: {
            processing,
            waiting: queue.length
        },
        browser: {
            hasContext: !!getContext(),
            hasPage: !!getPage(),
            pageClosed: getPage() ? getPage().isClosed() : null,
            ...getStats()
        },
        process: {
            uptimeSeconds: Math.round(process.uptime()),
            rssMB: Math.round(mem.rss / 1024 / 1024),
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024)
        }
    });

});

// JSON version of /me's login state, for polling from your own app
// without paying for a full-page screenshot each time.
app.get("/me/status", async (req, res) => {

    let loggedIn = null;

    try {
        loggedIn = meState === "DONE"
            ? !(await isShowingLoginForm())
            : false;
    } catch (err) {
        loggedIn = null;
    }

    res.json({
        meState,
        otpAttempts,
        loggedIn
    });

});

// Clears Chrome's cache/cookies via CDP without wiping the whole
// profile folder (keeps saved login where possible) — the "new
// folder" fix, automated and safe, for when things feel sluggish
// but you don't want to log in again from scratch.
app.post("/me/clear-cache", async (req, res) => {

    try {

        const page = await getPageSafe();
        const client = await page.context().newCDPSession(page);

        await client.send("Network.clearBrowserCache");

        const wipeCookies = req.body && req.body.wipeCookies === true;
        if (wipeCookies) {
            await client.send("Network.clearBrowserCookies");
        }

        await client.detach().catch(() => {});

        res.json({
            success: true,
            wipedCookies: wipeCookies
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

// Full hard reset: closes Chrome, renames the existing profile folder
// aside (nothing is deleted) and relaunches with a brand new one.
// This is the "make a new folder and rerun" fix from earlier in the
// conversation — automated, and it keeps a timestamped backup instead
// of silently discarding the old profile.
app.post("/me/hard-reset", async (req, res) => {

    try {

        const fs = require("fs");
        const path = require("path");

        if (getContext()) {
            await getContext().close().catch(() => {});
        }

        const profileDir = path.join(__dirname, "chrome-profile");
        const backupDir = path.join(__dirname, `chrome-profile-backup-${Date.now()}`);

        if (fs.existsSync(profileDir)) {
            fs.renameSync(profileDir, backupDir);
        }

        meState = "LOGIN";
        otpAttempts = 0;

        await restartBrowser("hard-reset");

        res.json({
            success: true,
            backedUpTo: backupDir
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

async function start() {

    await startBrowser();

    // Best-effort: figure out whether the persistent profile is
    // actually already logged in (e.g. after a process restart) so
    // /me doesn't wrongly show the login form over a live session.
    try {
        const alreadyLoggedIn = !(await isShowingLoginForm());
        if (alreadyLoggedIn) {
            meState = "DONE";
            console.log("[start] Detected existing logged-in session — resuming as DONE");
        }
    } catch (err) {
        console.log("[start] Could not determine initial login state:", err.message);
    }

    startWatchdog({
        restartBrowser,
        getPageSafe,
        isShowingLoginForm,
        getMeState: () => meState,
        setMeState: (v) => { meState = v; },
        isBusy: () => processing || queue.length > 0
    });

    const PORT = config.PORT;

    app.listen(PORT, () => {
        console.log(
            `Server Running On Port ${PORT}`
        );
    });
}

start();