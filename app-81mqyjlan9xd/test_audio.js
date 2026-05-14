
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
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`❌ [APIFY] Actor ${actorId} failed: ${response.status} - ${errText.substring(0, 200)}`);
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error("Fetch Error:", e.message);
        return null;
    }
};

async function testAudio() {
    const videoId = "jNQXAC9IVRw"; // Me at the zoo

    // Test 1: Official Scraper
    console.log("\n--- TEST 1: apify~youtube-scraper (Audio) ---");
    const data1 = await runApifyActor('apify~youtube-scraper', {
        startUrls: [{ url: `https://www.youtube.com/watch?v=${videoId}` }],
        maxResults: 1,
        downloadAudio: true,
        downloadSubtitles: false
    });

    if (data1 && data1[0]) {
        console.log("Audio URL found?", !!data1[0].audioUrl);
        if (data1[0].audioUrl) console.log("URL:", data1[0].audioUrl.substring(0, 50));
    } else {
        console.log("FAIL: No data or empty");
    }

    // Test 2: Try another known extractor if available?
    // Let's create a backup test for 'streamers~youtube-scraper' for audio specifically
    console.log("\n--- TEST 2: streamers~youtube-scraper (Audio) ---");
    const data2 = await runApifyActor('streamers~youtube-scraper', {
        startUrls: [{ url: `https://www.youtube.com/watch?v=${videoId}` }],
        maxResults: 1,
        downloadAudio: true
    });

    if (data2 && data2[0]) {
        console.log("Audio URL found?", !!data2[0].audioUrl);
        console.log("Keys available:", Object.keys(data2[0]));
    } else {
        console.log("FAIL: No data or empty");
    }
}

testAudio();
