const { getPage } = require("./browser");

/**
 * Split Step 1: Automates user lookup via direct API fetch inside browser context
 * @param {string|number} webUserId - The target user ID to verify
 */
async function verifyUser(webUserId) {
    const page = getPage();

    try {
        console.log(`[Verify] Pulling live active session tokens from application...`);

        // Extract the latest token (repaired by 'refreshtoken' in your logs)
        const token = await page.evaluate(() => {
            return localStorage.getItem('token') || 
                   JSON.parse(localStorage.getItem('sb-auth-token'))?.access_token ||
                   window.__TOKEN__; 
        });

        if (!token) {
            throw new Error("No active authorization token found in current tab. Please ensure you are logged in.");
        }

        console.log(`[Verify] Executing background 'Get' endpoint for user ID: ${webUserId}`);

        // Replicate the exact 'Get' call that took 909ms in your network logs
        const apiResponse = await page.evaluate(async ({ token, webUserId }) => {
            const res = await fetch('https://businessweb-mobi.com/main-api/api/WebMobileCash/User/Get', {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'authorization': `Bearer ${token}`,
                    'content-type': 'application/json',
                    'x-language': 'EN'
                },
                body: JSON.stringify({
                    userId: Number(webUserId),
                    refId: 216
                })
            });
            return res.json();
        }, { token, webUserId });

        console.log("[Verify] Server Response:", apiResponse);

        if (!apiResponse.Success || !apiResponse.User) {
            return {
                success: false,
                error: `User lookup failed. MessageId: ${apiResponse.MessageId}`
            };
        }

        // Return clear verified payload
        return {
            success: true,
            user: {
                id: apiResponse.User.Id,
                name: apiResponse.User.Name,
                token: apiResponse.User.Token // Keep this for Step 2!
            }
        };

    } catch (error) {
        console.error("[Verify] Execution error:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    verifyUser
};