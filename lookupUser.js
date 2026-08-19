const { getPage } = require("./browser");

async function lookupUser(userId) {

    const page = getPage();

    const result = await page.evaluate(async (userId) => {

        // Try to obtain the Bearer token from the logged-in app
        let token = null;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);

            if (typeof value === "string" && value.startsWith("eyJ")) {
                token = value;
                break;
            }
        }

        if (!token) {
            throw new Error("Bearer token not found in localStorage");
        }

        const response = await fetch(
            "/main-api/api/WebMobileCash/User/Get",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    userId: Number(userId),
                    refId: 216
                })
            }
        );

        return await response.json();

    }, userId);

    return result;
}

module.exports = {
    lookupUser
};