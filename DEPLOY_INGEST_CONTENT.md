# Deploy Fixed ingest-content Function

## What Was Fixed
Removed the incompatible `pdf-parse` library that was causing "fs.readFileSync is not implemented" errors in Deno Edge Runtime.

## Why This Fix Works
- **PDF parsing** is now handled **client-side only** (in `AddContentDialog.tsx` using `pdfjs-dist`)
- **Audio/Video** files still use Whisper API (server-side) - this works fine
- **YouTube, text, social links** all work server-side - no issues

## Deployment Steps

1. Go to: https://supabase.com/dashboard/project/axfxldgynmlwdsidklun/functions
2. Click on `ingest-content` function
3. Click **"Edit"**
4. Delete all existing code (Ctrl+A, Delete)
5. Open `supabase/functions/ingest-content/index.ts` in VS Code
6. Copy ALL the code (Ctrl+A, Ctrl+C)
7. Paste into Dashboard editor (Ctrl+V)
8. Click **"Deploy"**

## After Deployment
Try uploading:
- ✅ Text snippets
- ✅ YouTube URLs
- ✅ PDF files (will be processed client-side automatically)
- ✅ Audio/Video files (will use Whisper)

All should work without errors!
