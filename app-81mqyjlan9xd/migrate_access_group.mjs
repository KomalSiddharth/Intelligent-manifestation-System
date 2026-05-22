import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env file manually
const envContent = readFileSync('.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) envVars[key.trim()] = val.join('=').trim();
});

const supabaseUrl = envVars.VITE_SUPABASE_URL || '';
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY || '';

console.log('URL:', supabaseUrl ? 'Found' : 'MISSING');
console.log('Key:', supabaseKey ? 'Found' : 'MISSING');

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching knowledge_sources...');
  const { data, error } = await supabase.from('knowledge_sources').select('id, metadata');
  
  if (error) {
    console.error('Error fetching data:', error);
    return;
  }
  
  console.log(`Found ${data.length} items. Updating access group to 'insiders' where missing...`);
  
  let updatedCount = 0;
  for (const item of data) {
    const meta = item.metadata || {};
    if (!meta.accessGroup || meta.accessGroup !== 'insiders') {
      const newMeta = { ...meta, accessGroup: 'insiders' };
      const { error: updateError } = await supabase.from('knowledge_sources').update({ metadata: newMeta }).eq('id', item.id);
      if (updateError) {
        console.error(`Failed to update item ${item.id}:`, updateError);
      } else {
        updatedCount++;
      }
    }
  }
  
  console.log(`Successfully updated ${updatedCount} items to 'insiders' access group.`);
}

main();
