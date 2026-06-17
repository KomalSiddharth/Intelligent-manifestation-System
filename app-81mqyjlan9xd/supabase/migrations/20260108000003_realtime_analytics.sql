-- Real-time Analytics for Insights Dashboard (Updated with Unanswered Messages)
-- Creates RPC function to fetch live statistics

CREATE OR REPLACE FUNCTION get_realtime_analytics(p_profile_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_conversations integer;
    v_active_users integer;
    v_messages_answered integer;
    v_messages_unanswered integer;
    v_total_time_minutes integer;
    v_result json;
BEGIN
    -- 1. Total Conversations (chat sessions)
    SELECT COUNT(DISTINCT id)
    INTO v_total_conversations
    FROM conversations
    WHERE profile_id = p_profile_id
      AND created_at >= NOW() - INTERVAL '30 days';

    -- 2. Active Users (unique users who chatted)
    SELECT COUNT(DISTINCT user_id)
    INTO v_active_users
    FROM conversations
    WHERE profile_id = p_profile_id
      AND user_id IS NOT NULL
      AND user_id != 'anonymous'
      AND created_at >= NOW() - INTERVAL '30 days';

    -- 3. Messages Answered (total assistant messages)
    SELECT COUNT(*)
    INTO v_messages_answered
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.profile_id = p_profile_id
      AND m.role = 'assistant'
      AND m.created_at >= NOW() - INTERVAL '30 days';

    -- 4. Messages Unanswered (user messages without assistant response)
    -- Count conversations where last message is from user (not assistant)
    SELECT COUNT(DISTINCT c.id)
    INTO v_messages_unanswered
    FROM conversations c
    WHERE c.profile_id = p_profile_id
      AND c.created_at >= NOW() - INTERVAL '30 days'
      AND EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id
          AND m.role = 'user'
          ORDER BY m.created_at DESC
          LIMIT 1
      )
      AND NOT EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id
          AND m.role = 'assistant'
          AND m.created_at > (
              SELECT MAX(created_at) FROM messages
              WHERE conversation_id = c.id AND role = 'user'
          )
      );

    -- 5. Total Time Created (sum of conversation durations in minutes)
    SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (
            (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) -
            (SELECT MIN(created_at) FROM messages WHERE conversation_id = c.id)
        )) / 60
    ), 0)::integer
    INTO v_total_time_minutes
    FROM conversations c
    WHERE c.profile_id = p_profile_id
      AND c.created_at >= NOW() - INTERVAL '30 days';

    -- Build JSON response
    v_result := json_build_object(
        'total_conversations', v_total_conversations,
        'active_users', v_active_users,
        'messages_answered', v_messages_answered,
        'messages_unanswered', v_messages_unanswered,
        'time_created_minutes', v_total_time_minutes,
        'last_updated', NOW()
    );

    RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_realtime_analytics(uuid) TO authenticated, anon;
