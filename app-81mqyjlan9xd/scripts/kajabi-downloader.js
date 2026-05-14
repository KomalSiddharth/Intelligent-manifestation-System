import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    const targetUrl = process.argv[2];
    if (!targetUrl) {
        console.error('❌ Error: Provide a Kajabi Course/Category/Post URL');
        console.log('Usage: node scripts/kajabi-downloader.js "https://..."');
        process.exit(1);
    }

    console.log('🚀 Launching Deep-Scan Browser...');
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();

    // Intercept responses for ALL lessons visited
    const mediaData = new Map();
    const captionFiles = new Set();

    page.on('response', async response => {
        try {
            const url = response.url();

            // 1. Listen for VTT/SRT caption files in the network
            if (url.includes('.vtt') || url.includes('.srt')) {
                captionFiles.add(url);
            }

            // 2. Deep Scan JSON for transcripts/captions/videos
            if (url.includes('wistia.com/embed/medias/') && url.endsWith('.json')) {
                const json = await response.json();
                const media = json.media || json;
                const assets = media.assets || [];
                const name = media.name || 'video';

                let transcript = media.transcript || "";
                if (!transcript && json.captions && json.captions.length > 0) {
                    transcript = json.captions[0].text || "";
                }

                // --- ROBUST ASSET SELECTION ---
                // Filter out clear images/thumbnails, keep everything else
                const validAssets = assets.filter(a => {
                    const type = (a.type || "").toLowerCase();
                    const displayName = (a.display_name || "").toLowerCase();

                    // Exclude images/thumbnails/still frames
                    const isImage = type.includes('image') ||
                        type.includes('still') ||
                        type.includes('pop') ||
                        displayName.includes('image') ||
                        displayName.includes('thumbnail');

                    return !isImage;
                });

                // Sort for BEST quality (largest file size)
                const sortedAssets = [...validAssets].sort((a, b) => (b.size || 0) - (a.size || 0));

                const downloadOptions = sortedAssets.map(asset => {
                    let downloadUrl = asset.url;
                    // Fix extension for Wistia .bin files
                    if (downloadUrl.includes('.bin')) {
                        const isAudio = asset.type?.toLowerCase().includes('audio') ||
                            asset.display_name?.toLowerCase().includes('audio');
                        downloadUrl = downloadUrl.replace('.bin', isAudio ? '.m4a' : '.mp4');
                    }
                    if (!downloadUrl.includes('?')) downloadUrl += '?disposition=attachment';

                    return {
                        label: `${asset.display_name || asset.type} (${(asset.size / 1024 / 1024).toFixed(1)}MB)`,
                        url: downloadUrl
                    };
                });

                mediaData.set(name, {
                    name,
                    transcript,
                    options: downloadOptions
                });
            }
        } catch (e) { }
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    console.log('\n--- KAJABI DEEP EXTRACTION MODE ---');
    console.log('1. Login karke Course Dashboard ya Category page par jaiye.');
    console.log('2. Har us lesson ko open kijiye jise aap download karna chahte hain.');
    console.log('3. Har lesson par Video PLAY kijiye (IMPORTANT for network scan).');
    console.log('4. Saare lessons visit karne ke baad, yahan terminal par ENTER dabaiye.');

    await new Promise(resolve => process.stdin.once('data', resolve));

    console.log(`\n🔍 Found ${mediaData.size} lesson(s) and ${captionFiles.size} caption file(s):`);

    if (captionFiles.size > 0) {
        console.log('\n--- CAPTION FILES FOUND (SRT/VTT) ---');
        captionFiles.forEach((file, i) => console.log(`[${i + 1}] 👉 ${file}`));
    }

    if (mediaData.size > 0) {
        console.log('\n--- LESSON RESULTS ---');
        let i = 1;
        for (const [key, data] of mediaData) {
            console.log(`\n[${i++}] LESSON: ${data.name}`);

            if (data.transcript) {
                console.log(`✅ TRANSCRIPT FOUND!`);
            }

            if (data.options && data.options.length > 0) {
                console.log(`🚀 DOWNLOAD OPTIONS:`);
                data.options.forEach(opt => {
                    console.log(`   👉 ${opt.label}: \n      ${opt.url}`);
                });
            } else {
                console.log(`⚠️ No direct video/audio files found. Try playing the video for a few more seconds.`);
            }
        }
    } else {
        console.log('❌ No data found. Make sure to visit and PLAY the videos.');
    }

    console.log('\nType "exit" to close.');
    process.stdin.on('data', async (data) => {
        if (data.toString().trim() === 'exit') {
            await browser.close();
            process.exit(0);
        }
    });
}

run().catch(err => {
    console.error('🔥 Error:', err);
    process.exit(1);
});
