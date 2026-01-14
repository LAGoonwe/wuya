
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

if (import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_ANON_KEY === undefined) {
    console.warn('Missing Supabase Environment Variables. Interactions with backend will fail.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
