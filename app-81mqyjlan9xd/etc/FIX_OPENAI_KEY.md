# Fix OpenAI API Key - Quick Guide

## Problem
The OpenAI API key was not set correctly during the automated script (the `^V` paste didn't work). This is causing chat to fail with 404/connection errors.

## Solution
Set the key manually using this command:

```powershell
npx supabase secrets set OPENAI_API_KEY=<YOUR_ACTUAL_KEY>
```

## Steps
1. Copy your OpenAI API key (starts with `sk-proj-...`)
2. Open terminal in your project folder
3. Type: `npx supabase secrets set OPENAI_API_KEY=`
4. **Right Click** to paste your key (don't use Ctrl+V!)
5. Press Enter

## Verification
After setting the key, try chatting again. You should get AI responses immediately.

## What This Fixes
- ✅ Chat will work
- ✅ Content upload will work (needs embeddings)
- ✅ All AI features will be enabled
