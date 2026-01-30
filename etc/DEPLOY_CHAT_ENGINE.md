# Manual Deployment Guide: chat-engine Function

## Problem
The `chat-engine` Edge Function cannot be deployed via CLI because Docker is not running on your system. We need to deploy it manually through the Supabase Dashboard.

## Solution: Deploy via Dashboard

### Step 1: Open Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/axfxldgynmlwdsidklun/functions
2. Click **"Create a new function"** or **"Deploy new version"**

### Step 2: Create/Update Function
1. **Function Name**: `chat-engine`
2. Click **"Create function"** (if new) or select existing `chat-engine`

### Step 3: Upload Code
You have two options:

#### Option A: Copy-Paste Code (Recommended)
1. Open the file: `c:\Users\LENOVO\Downloads\app-81mqyjlan9xd_app_version-81p4pbhyaeww\app-81mqyjlan9xd\supabase\functions\chat-engine\index.ts`
2. Copy ALL the code
3. In the Dashboard, paste it into the code editor
4. Click **"Deploy"**

#### Option B: Upload via GitHub (if you have repo)
1. Connect your GitHub repository
2. Select the `supabase/functions/chat-engine` directory
3. Deploy

### Step 4: Verify Deployment
After deployment:
1. Go to your app
2. Try sending a chat message
3. You should now get AI responses!

## Why This Happened
The Supabase CLI requires Docker to bundle Edge Functions locally. Since Docker Desktop is not installed/running on your system, we bypass this by using the Dashboard's cloud-based deployment.

## Next Steps
After deploying `chat-engine`:
- ✅ Content should be visible (already fixed)
- ✅ Content upload should work (`ingest-content` is deployed)
- ✅ Chat should work (once `chat-engine` is deployed)
