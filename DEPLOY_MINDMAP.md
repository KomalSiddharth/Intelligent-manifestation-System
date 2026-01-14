# Manual Deployment Guide: generate-mindmap Function

## Problem
The automated deployment failed because Docker is not running on your system (Error: `failed to inspect docker`). We need to deploy the Mind Map function manually via the Supabase Dashboard.

## Solution

### Step 1: Open Supabase Dashboard
1. Go to: [Supabase Functions Dashboard](https://supabase.com/dashboard/project/axfxldgynmlwdsidklun/functions)
2. Click **"Create a new function"**

### Step 2: Create Function
1. **Name**: `generate-mindmap` (Must be exactly this)
2. **Slug**: `generate-mindmap`
3. Click "Save" or "Create"

### Step 3: Add Code
1. Open the file on your computer:
   `c:\Users\LENOVO\Downloads\app-81mqyjlan9xd_app_version-81p4pbhyaeww\app-81mqyjlan9xd\supabase\functions\generate-mindmap\index.ts`
2. **Copy EVERYTHING** inside that file.
3. Paste it into the editor on the Supabase Dashboard.
4. Click **"Deploy"** (or Save).

### Step 4: Verify
1. Go back to your Chat App.
2. Click the 3-dots menu -> "Generate Mind Map".
3. It should now work! 🧠

*(Note: The OpenAI API Key is already set globally, so you don't need to add it again.)*
