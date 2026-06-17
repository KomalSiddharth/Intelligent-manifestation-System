-- Migration: Recover Orphan Guest User
-- Adds the guest user ID to audience_users so their 83 messages become visible in analytics

INSERT INTO audience_users (id, name, email, status, created_at, last_active)
VALUES (
  'a719353d-2fb4-464b-9529-6096c4ab6937', -- The Guest ID found
  'Recovered Guest User',                  -- Default Name
  'guest-a719353d@recovered.com',         -- Placeholder Email
  'active',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Optional: Update their message count cleanly
UPDATE audience_users
SET message_count = (
    SELECT COUNT(*) 
    FROM conversations c
    JOIN messages m ON c.id::text = m.conversation_id::text
    WHERE c.user_id = 'a719353d-2fb4-464b-9529-6096c4ab6937'
    AND m.role = 'user'
)
WHERE id = 'a719353d-2fb4-464b-9529-6096c4ab6937';
