
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
            console.error(`❌ [APIFY] Actor ${actorId} failed: ${response.status}`);
            try {
                const errJson = JSON.parse(errText);
                console.error("Error Detail:", JSON.stringify(errJson, null, 2));
            } catch (e) {
                console.error("Error Body:", errText.substring(0, 300));
            }
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error("Fetch Error:", e.message);
        return null;
    }
};

async function testHarvester() {
    const videoId = "jNQXAC9IVRw"; // Me at the zoo
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Test 1: Standard startUrls
    console.log("\n--- TEST 1: web.harvester~youtube-downloader (startUrls) ---");
    const data1 = await runApifyActor('web.harvester~youtube-downloader', {
        startUrls: [{ url: videoUrl }],
        downloadIO: true, // Some actors use this
        outputFormat: 'mp3'
    });

    if (data1 && data1.length > 0) {
        console.log("✅ Data received!");
        console.log("Sample:", JSON.stringify(data1[0]).substring(0, 200));
        if (data1[0].downloadUrl || data1[0].url || data1[0].audioUrl) {
            console.log("SUCCESS: Found URL field");
        }
    } else {
        console.log("FAIL or Empty. Trying videoUrls...");
        // Test 2: Try simple input
        console.log("\n--- TEST 2: web.harvester~youtube-downloader (videoUrls) ---");
        const data2 = await runApifyActor('web.harvester~youtube-downloader', {
            videoUrls: [videoUrl],
            format: 'mp3'
        });
        if (data2 && data2.length > 0) {
            console.log("✅ Data received (Test 2)!");
            console.log("Sample:", JSON.stringify(data2[0]).substring(0, 200));
        } else {
            console.log("FAIL Test 2");
        }
    }
}

testHarvester();
