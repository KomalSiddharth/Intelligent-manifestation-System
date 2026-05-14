$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   MiteshAI Project Repair & Setup Tool   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will: "
Write-Host "1. Link your local code to your new Supabase Project."
Write-Host "2. Set up your API Keys (Secrets)."
Write-Host "3. Push the database schema (fixing the blank profile/bio issues)."
Write-Host "4. Deploy the Edge Functions (fixing the content upload & chat issues)."
Write-Host ""

# 1. Login Check
Write-Host "[Step 1] Checking Supabase Login..." -ForegroundColor Yellow
try {
    $loginCheck = npx supabase projects list 2>&1
    if ($loginCheck -match "login") {
        Write-Host "You are not logged in. A browser window may open, or you may need to copy a token." -ForegroundColor Yellow
        npx supabase login
    }
} catch {
    Write-Host "Please login to Supabase..."
    npx supabase login
}

# 2. Link Project
Write-Host ""
Write-Host "[Step 2] Linking Project..." -ForegroundColor Yellow
Write-Host "Please enter your Supabase Project Reference ID."
Write-Host "(This is the code in your dashboard URL: app.supabase.com/project/xyzxyzxyz)" -ForegroundColor Gray
$projectRef = Read-Host "Project Reference ID"

if (-not $projectRef) {
    Write-Error "Project Reference ID is required!"
}

# Run link command
# We use --password to prompt for db password if needed, but usually link just needs the ref
cmd /c "npx supabase link --project-ref $projectRef"

# 3. Set Secrets
Write-Host ""
Write-Host "[Step 3] Configuring Secrets..." -ForegroundColor Yellow
Write-Host "We need to set the OPENAI_API_KEY for the AI to work."
$openaiKey = Read-Host "Enter your OpenAI API Key (sk-...)"

if ($openaiKey) {
    cmd /c "npx supabase secrets set OPENAI_API_KEY=$openaiKey"
    Write-Host "OpenAI Key set." -ForegroundColor Green
} else {
    Write-Host "Skipping OpenAI Key (Chat & Ingestion will NOT work without it)." -ForegroundColor Red
}

Write-Host "Setting other default secrets..."
# Attempt to get Supabase URL/Key from the user or assume standard format if they have it
# Actually, the internal functions use Deno.env.get("SUPABASE_URL") which is auto-injected by Supabase Platform!
# We only need to set 3rd party keys like Google.

Write-Host "Do you have Google Drive OAuth keys? (Optional)"
$setupGoogle = Read-Host "Setup Google Drive? (y/n)"
if ($setupGoogle -eq 'y') {
    $gClientId = Read-Host "Google Client ID"
    $gClientSecret = Read-Host "Google Client Secret"
    cmd /c "npx supabase secrets set GOOGLE_CLIENT_ID=$gClientId"
    cmd /c "npx supabase secrets set GOOGLE_CLIENT_SECRET=$gClientSecret"
}

# 4. Push Database Changes
Write-Host ""
Write-Host "[Step 4] Fixing Database Permissions (RLS)..." -ForegroundColor Yellow
Write-Host "This will apply the migration to unblock table access."
cmd /c "npx supabase db push"

# 5. Deploy Functions
Write-Host ""
Write-Host "[Step 5] Deploying Edge Functions..." -ForegroundColor Yellow
Write-Host "Deploying 'ingest-content'..."
cmd /c "npx supabase functions deploy ingest-content --no-verify-jwt"

Write-Host "Deploying 'chat-engine'..."
cmd /c "npx supabase functions deploy chat-engine --no-verify-jwt"

Write-Host "Deploying 'admin-data'..."
cmd /c "npx supabase functions deploy admin-data --no-verify-jwt"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Repair Complete!                       " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Please refresh your web app and test:"
Write-Host "1. Is the Bio visible?"
Write-Host "2. Can you chat?"
Write-Host "3. Can you upload content?"
Write-Host ""
Pause
