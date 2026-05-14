
import fs from 'fs';
import path from 'path';

// Manually read .env
const envPath = path.resolve(process.cwd(), '.env');
let APIFY_TOKEN = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/APIFY_API_TOKEN=(.+)/);
    if (match && match[1]) {
        APIFY_TOKEN = match[1].trim();
    }
} catch (err) {
    console.error("Could not read .env file");
}

console.log(`🔑 Token loaded: ${APIFY_TOKEN ? 'YES' : 'NO'}`);

const runApifyActor = async (actorId, input) => {
    console.log(`🚀 [APIFY] Running actor ${actorId}...`);
    try {
        const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
        console.log("Calling URL:", url.replace(APIFY_TOKEN, '***'));

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`❌ [APIFY] Actor ${actorId} failed: ${response.status}`);
            console.error(`Error Body: ${errText.substring(0, 500)}`); // Print valid error
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error("Fetch Error:", e.message);
        return null;
    }
};

async function testStrategy2() {
    const videoId = "jNQXAC9IVRw";
    console.log("\n--- STRATEGY 2: streamers~youtube-scraper (Subtitles) ---");
    const data2 = await runApifyActor('streamers~youtube-scraper', {
        startUrls: [{ url: `https://www.youtube.com/watch?v=${videoId}` }],
        maxResults: 1,
        downloadSubtitles: true,
        saveSubsAsFile: false
    });

    if (data2) {
        console.log("✅ Strategy 2 Response Length:", Array.isArray(data2) ? data2.length : 'Not Array');
        if (data2[0] && data2[0].subtitles && data2[0].subtitles.length > 0) {
            console.log("SUCCESS: Subtitles found via Scraper");
            console.log("Subtitles sample:", data2[0].subtitles[0].text.substring(0, 50));
        } else {
            console.log("FAIL: No subtitles in response");
            console.log("Data keys:", data2[0] ? Object.keys(data2[0]) : 'Empty');
        }
    } else {
        console.log("FAIL: Data is null");
    }
}

testStrategy2();
