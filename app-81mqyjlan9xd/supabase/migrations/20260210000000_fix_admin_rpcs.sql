-- Migration to define missing admin RPCs required for the Mind/Content tab
-- These functions enable the frontend to fetch profiles securely via RPC

-- 1. get_admin_profiles
CREATE OR REPLACE FUNCTION get_admin_profiles()
RETURNS SETOF mind_profile
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM mind_profile
  ORDER BY is_primary DESC, updated_at DESC;
END;
$$;

-- 2. get_admin_profile
CREATE OR REPLACE FUNCTION get_admin_profile(p_profile_id uuid DEFAULT NULL)
RETURNS SETOF mind_profile
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN QUERY
    SELECT *
    FROM mind_profile
    WHERE is_primary = true
    LIMIT 1;
  ELSE
    RETURN QUERY
    SELECT *
    FROM mind_profile
    WHERE id = p_profile_id
    LIMIT 1;
  END IF;
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION get_admin_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_profiles() TO anon; -- For dev mode if needed
GRANT EXECUTE ON FUNCTION get_admin_profile(uuid) TO anon;
