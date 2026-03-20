
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// If credentials are missing, we create a placeholder client that will log errors on use
// but won't crash the entire app during initialization.
export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey)
    : createClient('https://placeholder.supabase.co', 'placeholder');

if (!supabaseUrl || !supabaseKey) {
    console.error('⚠️ Supabase credentials NOT found. App is running in restricted/offline mode.');
}
