-- TechVaults platform console. Staff see a summary of every society (counts only, never member
-- financial data, per D-012) through a function that checks the caller is platform staff.
CREATE FUNCTION platform_societies(p_user_id uuid)
RETURNS TABLE (id uuid, name text, short_name text, slug text, state text, sector text, created_at timestamptz,
               members bigint, officers bigint, last_activity timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.is_platform_staff) THEN
    RAISE EXCEPTION 'Platform staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT s.id, s.name, s.short_name, s.slug, s.state, s.sector::text, s.created_at,
    (SELECT count(*) FROM members m WHERE m.society_id = s.id),
    (SELECT count(*) FROM society_users su WHERE su.society_id = s.id
       AND su.roles && ARRAY['principal_officer','chairperson','secretary','treasurer','loan_officer','loan_committee','payroll_officer','auditor']),
    (SELECT max(a.occurred_at) FROM audit_events a WHERE a.society_id = s.id)
  FROM societies s
  ORDER BY s.created_at DESC;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_societies(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_societies(uuid) TO coop_app;
--> statement-breakpoint
-- Slugs are unique across societies, which RLS hides from the app; this answers "is it taken?" only.
CREATE FUNCTION society_slug_taken(p_slug text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM societies WHERE slug = p_slug)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION society_slug_taken(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION society_slug_taken(text) TO coop_app;
