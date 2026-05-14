
import { createClient } from "@supabase/supabase-js";
try {
    const supabase = createClient(undefined, undefined);
    console.log("Supabase client created successfully");
} catch (e) {
    console.error("Supabase client creation failed:", e.message);
}
