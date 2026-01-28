import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

puppeteer.use(StealthPlugin());
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: Missing Supabase environment variables.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function run() {
    const targetUrl = process.argv[2];
    if (!targetUrl) {
        console.error('❌ Error: Provide a Kajabi Community Q&A URL');
        process.exit(1);
    }

    console.log('🚀 [KAJABI-BOT] Launching Automation...');

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: path.resolve('./.browser_session'),
        defaultViewport: null,
        args: ['--start-maximized', `--user-agent=${USER_AGENT}`]
    });

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    try {
        console.log(`🌐 Navigating to URL: ${targetUrl}`);

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => {
            console.warn('⚠️ Navigation timeout, checking if content is visible anyway...');
        });

        // --- Redirection Check ---
        const checkRedirect = async () => {
            const currentUrl = page.url();
            if (currentUrl.includes('.jpeg') || currentUrl.includes('.png') || currentUrl.includes('wp-content')) {
                console.error(`🚨 DETECTED REDIRECT TO IMAGE: ${currentUrl}`);
                console.log('💡 Tip: Please MANUALLY navigate back to the Q&A page in the browser.');
                return true;
            }
            return false;
        };

        // --- Aggressive Wait & Scroll ---
        console.log('⏳ Waiting for feed to load (15s)...');
        await new Promise(r => setTimeout(r, 15000)); // Increased wait for heavy V2 pages

        await page.evaluate(async () => {
            // Scroll down a bit to trigger lazy loading
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 2000));
            window.scrollBy(0, -1000); // Back up
        });

        console.log('✅ Page settled. Extracting posts...');

        // --- Extraction Overhaul ---
        const mentions = await page.evaluate(() => {
            const results = [];
            const seen = new Set();

            // Look for any mention of "Mitesh" or "@" (mentions)
            const allElements = Array.from(document.querySelectorAll('*'));
            const potentialMentions = allElements.filter(el => {
                // Ignore structural junk
                if (['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'NAV', 'HEADER', 'FOOTER'].includes(el.tagName)) return false;
                const text = el.innerText || '';
                return (text.includes('Mitesh') || text.includes('@Mitesh')) && text.length > 5;
            });

            for (const el of potentialMentions) {
                // Walk up to find the nearest "Post-like" container
                let container = el;
                let depth = 0;
                while (container && depth < 12) {
                    const tag = container.tagName.toLowerCase();
                    const cls = container.className || '';
                    const role = container.getAttribute('role');
                    const testid = container.getAttribute('data-testid');

                    // Check for common post/comment classes in Kajabi V2
                    if (tag === 'article' || role === 'article' || testid === 'post-item' ||
                        cls.includes('FeedItem') || cls.includes('post-card') ||
                        cls.includes('post-content') || cls.includes('comment') ||
                        cls.includes('PostRow')) {
                        break;
                    }
                    container = container.parentElement;
                    depth++;
                }

                if (!container || container === document.body) continue;

                // Scrub sidebars
                let isSidebar = false;
                let p = container;
                while (p && p !== document.body) {
                    const pCls = p.className || '';
                    if (p.tagName === 'NAV' || pCls.includes('sidebar') || pCls.includes('navigation') || pCls.includes('header')) {
                        isSidebar = true;
                        break;
                    }
                    p = p.parentElement;
                }
                if (isSidebar) continue;

                const text = container.innerText || '';
                if (text.length < 50) continue; // Skip fragments

                const contentHash = text.slice(0, 250).replace(/\s/g, '');
                if (seen.has(contentHash)) continue;
                seen.add(contentHash);

                // Find a link to the post
                const links = Array.from(container.querySelectorAll('a'));
                const postLink = links.find(a => a.href.includes('/posts/')) ||
                    links.find(a => a.href.includes('?type=')) ||
                    links[0];

                const link = postLink ? postLink.href : window.location.href;

                // Author detection
                const authorEl = container.querySelector('h3, h4, strong, [class*="Name"], [class*="author"], .user-name');
                const author = authorEl ? authorEl.innerText.trim().split('\n')[0] : 'User';

                const id = postLink && link.includes('/posts/') ?
                    link.split('/posts/')[1]?.split('?')[0] :
                    `hash_${Math.abs(contentHash.length)}_${Math.floor(Math.random() * 1000)}`;

                results.push({ id, link, author, content: text.trim().slice(0, 3000) });
            }
            return results;
        });

        if (mentions.length === 0) {
            console.warn('⚠️ Zero posts found after extraction.');
            const pageText = await page.evaluate(() => document.body.innerText.slice(0, 500));
            console.log('📄 Page Content Hint:', pageText);
        } else {
            console.log(`📊 Found ${mentions.length} unique mentions/posts.`);
        }

        for (const m of mentions) {
            console.log(`\n📝 Processing: ${m.author}`);

            // --- Database Sync & AI Generation ---
            // Check if we already handled this ID
            const { data: existing } = await supabase
                .from('kajabi_qa_posts')
                .select('status, ai_draft')
                .eq('kajabi_post_id', m.id)
                .maybeSingle();

            if (existing && (existing.status === 'filled' || existing.status === 'published')) {
                console.log('⏭️ Already filled, skipping.');
                continue;
            }

            let draft = existing?.ai_draft;

            if (!draft) {
                console.log(`🤖 Generating AI Response for @${m.author}...`);
                try {
                    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-kajabi-reply`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            question: m.content.slice(0, 1500),
                            authorName: m.author
                        })
                    });
                    const data = await res.json();
                    draft = data.text;
                    if (!draft) throw new Error('AI Error: ' + JSON.stringify(data));

                    await supabase.from('kajabi_qa_posts').upsert({
                        kajabi_post_id: m.id,
                        kajabi_post_url: m.link,
                        question_text: m.content.slice(0, 1500),
                        author_name: m.author,
                        ai_draft: draft,
                        status: 'drafted'
                    });
                } catch (e) {
                    console.error('❌ AI Generation Failed:', e.message);
                    continue;
                }
            } else {
                console.log('♻️ Reusing existing AI draft.');
            }

            // --- Log Pair to Terminal ---
            console.log('==================================================');
            console.log(`👤 USER: ${m.author}`);
            console.log(`❓ QUESTION: "${m.content.slice(0, 150).replace(/\n/g, ' ')}..."`);
            console.log(`🔗 URL: ${m.link}`);
            console.log('--------------------------------------------------');
            console.log(`🤖 AI DRAFT:`);
            console.log(draft);
            console.log('==================================================');

            // --- Fill Post ---
            console.log('✨ Opening post in new tab for auto-fill...');
            const postPage = await browser.newPage();
            try {
                await postPage.goto(m.link, { waitUntil: 'load', timeout: 60000 }).catch(() => { });
                await new Promise(r => setTimeout(r, 10000)); // Wait for tab to load

                const fillSuccess = await postPage.evaluate(async (replyText, targetText) => {
                    const findBox = (container) => container?.querySelector('textarea, [role="textbox"], .tiptap');

                    // Try to find the exact post container on the page
                    const allPosts = Array.from(document.querySelectorAll('article, [class*="FeedItem"], [class*="PostRow"], [role="article"]'));
                    const targetContainer = allPosts.find(p => p.innerText.includes(targetText.slice(0, 50)));

                    let box = findBox(targetContainer) || document.querySelector('textarea, [role="textbox"], .tiptap');

                    if (box) {
                        box.focus();
                        box.style.border = '6px solid #00c853';
                        box.style.background = '#f0fff4';
                        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        return true;
                    }

                    // Fallback: search for "Comment" button
                    const btns = Array.from(document.querySelectorAll('button, span, a'));
                    const commentBtn = btns.find(b => b.innerText.toLowerCase().includes('comment') || b.innerText.toLowerCase().includes('reply'));
                    if (commentBtn) {
                        commentBtn.click();
                        await new Promise(r => setTimeout(r, 2000));
                        box = document.querySelector('textarea, [role="textbox"], .tiptap');
                        if (box) {
                            box.focus();
                            box.style.border = '6px solid #00c853';
                            return true;
                        }
                    }

                    return false;
                }, draft, m.content);

                if (fillSuccess) {
                    // Type slowly for React compatibility
                    await postPage.keyboard.type(draft, { delay: 10 });
                    console.log('✅ AI Reply auto-filled!');
                    await supabase.from('kajabi_qa_posts').update({ status: 'filled' }).eq('kajabi_post_id', m.id);
                } else {
                    console.warn('⚠️ Could not locate comment box in the tab.');
                }
            } catch (e) {
                console.error('❌ Tab Filling Error:', e.message);
            }
        }

        console.log('\n🏁 Process complete. Please review the browser!');

    } catch (err) {
        console.error('🔥 Fatal Error:', err);
    }
}

run();
