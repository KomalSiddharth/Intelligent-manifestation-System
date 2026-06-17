-- Function to atomic update User Facts
-- Replaces the flaky "Delete then Insert" logic
CREATE OR REPLACE FUNCTION update_user_fact(
    p_user_id UUID,
    p_session_id UUID,
    p_profile_id UUID,
    p_fact_type TEXT,
    p_fact_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete existing fact of this same type for this context
    DELETE FROM user_facts
    WHERE user_id = p_user_id
      AND type = p_fact_type
      AND (
            (p_session_id IS NULL AND session_id IS NULL) OR 
            (session_id = p_session_id)
          )
      AND (
            (p_profile_id IS NULL AND profile_id IS NULL) OR 
            (profile_id = p_profile_id)
          );

    -- Insert new fact
    INSERT INTO user_facts (user_id, session_id, profile_id, type, fact)
    VALUES (p_user_id, p_session_id, p_profile_id, p_fact_type, p_fact_value);
END;
$$;


-- Function to atomic update Psych Profile
-- Handles merging of arrays (Limitng Beliefs) and overwriting of Goals/Desires
CREATE OR REPLACE FUNCTION update_psych_profile(
    p_user_id UUID,
    p_profile_id UUID,
    p_core_desire TEXT,
    p_new_beliefs TEXT[],
    p_new_goals JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_beliefs TEXT[];
    v_merged_beliefs TEXT[];
BEGIN
    -- 1. Get existing beliefs (if any)
    SELECT limiting_beliefs INTO v_existing_beliefs
    FROM user_psych_profile
    WHERE user_id = p_user_id AND profile_id = p_profile_id;

    -- 2. Merge existing beliefs with new ones (Deduplicate)
    SELECT ARRAY(
        SELECT DISTINCT UNNEST(
            COALESCE(v_existing_beliefs, ARRAY[]::TEXT[]) || COALESCE(p_new_beliefs, ARRAY[]::TEXT[])
        )
    ) INTO v_merged_beliefs;

    -- 3. Upsert into user_psych_profile
    INSERT INTO user_psych_profile (user_id, profile_id, core_desire, limiting_beliefs, goals, updated_at)
    VALUES (p_user_id, p_profile_id, p_core_desire, v_merged_beliefs, p_new_goals, NOW())
    ON CONFLICT (user_id, profile_id)
    DO UPDATE SET
        core_desire = COALESCE(EXCLUDED.core_desire, user_psych_profile.core_desire),
        limiting_beliefs = EXCLUDED.limiting_beliefs,
        goals = COALESCE(EXCLUDED.goals, user_psych_profile.goals),
        updated_at = NOW();
END;
$$;
