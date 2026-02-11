# 🧪 Reminder System - Complete Testing Guide

## Step 1️⃣: Database Migration Run Karo

### Option A: Supabase Dashboard se (Recommended)
1. **Supabase Dashboard** kholo: https://app.supabase.com
2. **SQL Editor** me jao
3. Ye migration script copy-paste karo:

```sql
-- Add feature_flags column to mind_profile
ALTER TABLE mind_profile 
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}'::jsonb;
```

4. **Run** button dabao
5. Success message dekho ✅

### Option B: Local Supabase CLI se
```bash
# Terminal me ye command run karo
npx supabase db push

# Ya specific migration file run karne ke liye
npx supabase migration up
```

---

## Step 2️⃣: Verify Database Setup

### Supabase SQL Editor me ye queries run karo:

```sql
-- Check 1: feature_flags column exist karta hai?
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'mind_profile' AND column_name = 'feature_flags';
-- ✅ Expected: 1 row return hona chahiye

-- Check 2: reminders table exist karta hai?
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'reminders';
-- ✅ Expected: 12-13 columns return hone chahiye
```

---

## Step 3️⃣: Frontend Testing (100% Verification)

### Test 1: Feature Toggle Sync
1. **Browser** me app kholo: http://localhost:5173
2. **Advanced → Actions** tab me jao
3. **"User-Requested Reminder"** toggle ko ON karo
4. **Browser DevTools Console** kholo (F12)
5. Page **refresh** karo (Ctrl+R)
6. Toggle **ON hi rahna chahiye** ✅

**Database Verification:**
```sql
SELECT id, name, feature_flags 
FROM mind_profile 
ORDER BY created_at DESC 
LIMIT 1;
```
Expected: `feature_flags` me `{"User-Requested Reminder": true}` hona chahiye

---

### Test 2: Create Reminder via Chat

1. **Chat page** pe jao
2. Ye message bhejo:
   ```
   Remind me to call the client in 3 minutes
   ```
3. Bot ka response dekho (should acknowledge)
4. **Database check** karo:

```sql
SELECT 
    id,
    task,
    due_at,
    status,
    priority,
    created_at,
    EXTRACT(EPOCH FROM (due_at - NOW())) as seconds_until_due
FROM reminders 
WHERE status = 'pending'
ORDER BY created_at DESC 
LIMIT 5;
```

**✅ Expected:**
- 1 new row with `task = "call the client"`
- `due_at` approximately 3 minutes from now
- `status = 'pending'`

---

### Test 3: Notification Worker Test

#### Manual Test (Immediate)

1. **Create a test reminder** (due in 30 seconds):
```sql
INSERT INTO reminders (
    user_id,
    profile_id,
    task,
    due_at,
    status
) VALUES (
    (SELECT user_id FROM mind_profile LIMIT 1),
    (SELECT id FROM mind_profile LIMIT 1),
    'Test reminder: Check email',
    NOW() + INTERVAL '30 seconds',
    'pending'
);
```

2. **Wait 30 seconds** ⏰

3. **Trigger notification worker** manually:

**Option A: Via Supabase Dashboard**
- Edge Functions → notification-worker → Invoke

**Option B: Via curl**
```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/notification-worker" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

4. **Check browser** - Toast notification dikhna chahiye! 🎉

5. **Verify database update:**
```sql
SELECT id, task, status, updated_at 
FROM reminders 
WHERE task LIKE '%Check email%';
```
**✅ Expected:** `status = 'completed'`

---

## Step 4️⃣: End-to-End Flow Test (Real Scenario)

### Complete Test Sequence:

1. **Enable Feature**
   - Advanced → Actions → Toggle "User-Requested Reminder" ON

2. **Create Reminder**
   - Chat me type karo: "Remind me to submit the report in 2 minutes"

3. **Verify Creation**
   ```sql
   SELECT * FROM reminders 
   WHERE status = 'pending' 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```

4. **Wait for Due Time** (2 minutes)

5. **Trigger Worker**
   - Manually invoke notification-worker function

6. **Check Notification**
   - Browser me toast notification dekho
   - Console me "⏰ Reminder received" log dekho

7. **Verify Completion**
   ```sql
   SELECT status FROM reminders 
   WHERE task LIKE '%submit the report%';
   ```
   Should be: `completed` ✅

---

## 🔍 Debugging Checklist

### Agar reminder create nahi ho raha:

1. **Feature flag check:**
   ```sql
   SELECT feature_flags FROM mind_profile WHERE id = 'YOUR_PROFILE_ID';
   ```
   Should contain: `{"User-Requested Reminder": true}`

2. **Chat engine logs dekho** (Supabase Dashboard → Edge Functions → chat-engine → Logs)
   - "Reminder detected!" message dikhna chahiye

3. **Intent detection check:**
   - Message me "remind me" words hone chahiye
   - Time mention hona chahiye (e.g., "in 5 minutes", "tomorrow")

### Agar notification nahi aa raha:

1. **Worker logs dekho** (Edge Functions → notification-worker → Logs)
   - "Found X due reminders" message dekho
   - "Broadcast sent" confirmation dekho

2. **Browser console check:**
   - "⏰ Reminder received" log hona chahiye
   - Network tab me realtime connection check karo

3. **Realtime connection verify:**
   ```javascript
   // Browser console me run karo
   console.log(window.supabase.channel('platform-broadcast'));
   ```

---

## ✅ Success Criteria

Aapka system **100% working** hai agar:

- ✅ Feature toggle ON/OFF hota hai aur persist karta hai
- ✅ Chat me "remind me" message se reminder create hota hai
- ✅ Database me reminder entry dikhti hai with correct `due_at`
- ✅ Notification worker successfully reminders process karta hai
- ✅ Browser me toast notification dikhta hai
- ✅ Reminder status `pending` se `completed` ho jata hai

---

## 📊 Quick Health Check Query

Ye query run karke overall system health dekho:

```sql
SELECT 
    'Feature Flags' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM information_schema.columns 
WHERE table_name = 'mind_profile' AND column_name = 'feature_flags'

UNION ALL

SELECT 
    'Reminders Table',
    COUNT(*),
    CASE WHEN COUNT(*) > 0 THEN '✅ PASS' ELSE '❌ FAIL' END
FROM information_schema.tables 
WHERE table_name = 'reminders'

UNION ALL

SELECT 
    'Pending Reminders',
    COUNT(*),
    CONCAT(COUNT(*)::text, ' reminders')
FROM reminders 
WHERE status = 'pending'

UNION ALL

SELECT 
    'Completed Reminders',
    COUNT(*),
    CONCAT(COUNT(*)::text, ' reminders')
FROM reminders 
WHERE status = 'completed';
```

---

## 🚀 Next Steps After Verification

1. **Deploy notification-worker** to production
2. **Setup cron job** to run worker every minute
3. **Test with real users**
4. **Monitor logs** for any errors

Koi bhi issue aaye to mujhe batao! 🎯
