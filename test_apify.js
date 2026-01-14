
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
        const response = await fetch(
            `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error(`❌ [APIFY] Actor ${actorId} failed: ${response.status} - ${errText}`);
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error("Fetch Error:", e.message);
        return null;
    }
};

async function testScraping() {
    const videoId = "jNQXAC9IVRw"; // "Me at the zoo" - short video, guaranteed to have subs/audio

    console.log("--- STRATEGY 1: apify/youtube-transcript ---");
    const data1 = await runApifyActor('apify/youtube-transcript', {
        videoId,
        downloadSubtitles: true,
        languageCodes: ['en']
    });

    if (data1) {
        console.log("✅ Strategy 1 Result:", JSON.stringify(data1).substring(0, 100) + "...");
        if (data1.subtitles && data1.subtitles.length > 0) {
            console.log("SUCCESS: Subtitles found via Transcript Actor");
        } else {
            console.log("FAIL: No subtitles in response");
        }
    }

    console.log("\n--- STRATEGY 2: apify/youtube-scraper (Subtitles) ---");
    const data2 = await runApifyActor('apify/youtube-scraper', {
        startUrls: [{ url: `https://www.youtube.com/watch?v=${videoId}` }],
        maxResults: 1,
        downloadSubtitles: true,
        saveSubsAsFile: false
    });

    if (data2) {
        console.log("✅ Strategy 2 Result:", JSON.stringify(data2).substring(0, 100) + "...");
        if (data2[0] && data2[0].subtitles && data2[0].subtitles.length > 0) {
            console.log("SUCCESS: Subtitles found via Scraper");
        } else {
            console.log("FAIL: No subtitles in response");
        }
    }

    console.log("\n--- STRATEGY 3: apify/youtube-scraper (Audio URL) ---");
    const data3 = await runApifyActor('apify/youtube-scraper', {
        startUrls: [{ url: `https://www.youtube.com/watch?v=${videoId}` }],
        maxResults: 1,
        downloadAudio: true
    });

    if (data3) {
        console.log("✅ Strategy 3 Result:", JSON.stringify(data3).substring(0, 100) + "...");
        if (data3[0] && data3[0].audioUrl) {
            console.log("SUCCESS: Audio URL found:", data3[0].audioUrl);
        } else {
            console.log("FAIL: No audioUrl in response");
        }
    }
}

testScraping();
