-- Authentication access for the application role.
-- The app may not grant itself platform-staff status: is_platform_staff is left out of the UPDATE grant.
GRANT INSERT ON users TO coop_app;
--> statement-breakpoint
GRANT UPDATE (name, email, email_verified, image, two_factor_enabled, updated_at) ON users TO coop_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, accounts, verifications, two_factors TO coop_app;
--> statement-breakpoint
-- society_users is protected by row-level security, so before a society is chosen the app
-- cannot see which societies a person belongs to. This function answers exactly that
-- question for one user, and nothing else. It runs with the owner's rights.
CREATE FUNCTION user_societies(p_user_id uuid)
RETURNS TABLE (society_id uuid, society_name text, society_slug text, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.slug, su.roles
  FROM society_users su
  JOIN societies s ON s.id = su.society_id
  WHERE su.user_id = p_user_id
  ORDER BY s.name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION user_societies(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION user_societies(uuid) TO coop_app;
