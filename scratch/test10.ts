import { supabase } from './src/lib/supabase';

async function verifyDb() {
  console.log('Querying Supabase for recipes...');
  const { data, error } = await supabase.from('items').select('*').eq('type', 'recipe');
  if (error) {
    console.error('Supabase Error:', error);
  } else {
    console.log(`Found ${data?.length} recipes in the global items table.`);
    if (data && data.length > 0) {
      console.log('First recipe snippet:', data[data.length - 1].title);
    }
  }
}

verifyDb();
