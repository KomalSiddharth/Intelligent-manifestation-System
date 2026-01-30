# � Using Your Existing Google Credential

Since you already have **"manifestation System Supabase"** created, follow these steps:

## 1. Edit the Credential
1. Click the **Pencil Icon (✏️)** next to "manifestation System Supabase".
   - (It's on the right side of the row in your screenshot)

## 2. Check Redirect URI
1. Scroll down to the **"Authorized redirect URIs"** section.
2. Check if this link is already there:
   ```
   https://axfxldgynmlwdsidklun.supabase.co/auth/v1/callback
   ```
3. **If it is NOT there:**
   - Click **+ ADD URI**
   - Paste the link above.
   - Click **SAVE** (at the bottom).

## 3. Get Your Keys
1. Look at the right side of the screen (or top).
2. Copy **Client ID**.
3. Copy **Client Secret**.

## 4. Paste in Supabase
1. Go back to Supabase Dashboard.
2. Paste Client ID and Client Secret.
3. Toggle "Enable Sign in with Google" to **ON**.
4. Click **Save**.

---
**That's it!** Try "Connect Google Drive" again after saving.
