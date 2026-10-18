-- Second-officer approval for sensitive roles (closes the D-016 self-approval risk).
ALTER TABLE role_grant_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON role_grant_requests USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON role_grant_requests TO coop_app;
--> statement-breakpoint
GRANT UPDATE (needs_approval) ON officer_invitations TO coop_app;
--> statement-breakpoint
DROP FUNCTION invitation_for_token(text);
--> statement-breakpoint
CREATE FUNCTION invitation_for_token(p_token_hash text)
RETURNS TABLE (id uuid, society_id uuid, society_name text, email text, roles text[],
               expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, member_id uuid, needs_approval boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.society_id, s.name, i.email, i.roles, i.expires_at, i.accepted_at, i.revoked_at, i.member_id, i.needs_approval
  FROM officer_invitations i
  JOIN societies s ON s.id = i.society_id
  WHERE i.token_hash = p_token_hash
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION invitation_for_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION invitation_for_token(text) TO coop_app;
