# Quick Start: Database Migration & Testing

## 🚀 Step 1: Run Migration

### Easiest Way - Supabase Dashboard:
1. Open: https://app.supabase.com
2. Go to: **SQL Editor**
3. Run this:
```sql
ALTER TABLE mind_profile 
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}'::jsonb;
```

## ✅ Step 2: Quick Verification

Run this in SQL Editor:
```sql
-- Should return 1 row
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'mind_profile' AND column_name = 'feature_flags';
```

## 🧪 Step 3: Test the Feature

1. **Enable in UI:**
   - Go to: Advanced → Actions
   - Toggle ON: "User-Requested Reminder"

2. **Create Reminder:**
   - Chat: "Remind me to call client in 2 minutes"

3. **Check Database:**
```sql
SELECT task, due_at, status FROM reminders 
WHERE status = 'pending' 
ORDER BY created_at DESC LIMIT 1;
```

4. **Test Notification:**
   - Wait 2 minutes
   - Invoke: Edge Functions → notification-worker
   - See toast notification! 🎉

## 📋 Full Testing Guide
See `TESTING_GUIDE.md` for complete instructions.
