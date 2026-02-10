import dotenv from 'dotenv';
dotenv.config();

async function testEdgeFunction() {
    console.log('--- TESTING EDGE FUNCTION ---');
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

    const profileId = '1cb7dee0-815f-4278-b93e-062bdf486389'; // From diagnostics

    try {
        // TEST CONTENT
        console.log('--- TESTING ACTION: get_content ---');
        const contentRes = await fetch(`${supabaseUrl}/functions/v1/admin-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${anonKey}`
            },
            body: JSON.stringify({
                action: 'get_content',
                profileId: profileId
            })
        });

        const contentData = await contentRes.json();
        console.log('Content Status:', contentRes.status);
        console.log('Items Count:', contentData.data?.length || 0);

        // TEST AUDIENCE
        console.log('\n--- TESTING ACTION: get_audience ---');
        const audienceRes = await fetch(`${supabaseUrl}/functions/v1/admin-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${anonKey}`
            },
            body: JSON.stringify({
                action: 'get_audience',
                profileId: profileId
            })
        });

        const audienceData = await audienceRes.json();
        console.log('Audience Status:', audienceRes.status);
        console.log('Users Count:', audienceData.data?.length || 0);
        if (audienceData.data?.length > 0) {
            console.log('Sample User:', JSON.stringify(audienceData.data[0], null, 2));
        }
    } catch (err) {
        console.error('Fetch Error:', err);
    }
}

testEdgeFunction();
