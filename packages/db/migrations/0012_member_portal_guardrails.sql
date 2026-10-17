-- Member portal: an account is tied to one member record of the same society, and the
-- membership lookup returns that link.
ALTER TABLE society_users ADD CONSTRAINT society_users_member_fk
  FOREIGN KEY (society_id, member_id) REFERENCES members (society_id, id);
--> statement-breakpoint
ALTER TABLE officer_invitations ADD CONSTRAINT officer_invitations_member_fk
  FOREIGN KEY (society_id, member_id) REFERENCES members (society_id, id);
--> statement-breakpoint
-- A "member" role always comes with the member record it belongs to.
ALTER TABLE society_users ADD CONSTRAINT society_users_member_role
  CHECK (NOT ('member' = ANY (roles)) OR member_id IS NOT NULL);
--> statement-breakpoint
DROP FUNCTION user_societies(uuid);
--> statement-breakpoint
CREATE FUNCTION user_societies(p_user_id uuid)
RETURNS TABLE (society_id uuid, society_name text, society_slug text, roles text[], member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.slug, su.roles, su.member_id
  FROM society_users su
  JOIN societies s ON s.id = su.society_id
  WHERE su.user_id = p_user_id
  ORDER BY s.name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION user_societies(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION user_societies(uuid) TO coop_app;
--> statement-breakpoint
DROP FUNCTION invitation_for_token(text);
--> statement-breakpoint
CREATE FUNCTION invitation_for_token(p_token_hash text)
RETURNS TABLE (id uuid, society_id uuid, society_name text, email text, roles text[],
               expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, member_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.society_id, s.name, i.email, i.roles, i.expires_at, i.accepted_at, i.revoked_at, i.member_id
  FROM officer_invitations i
  JOIN societies s ON s.id = i.society_id
  WHERE i.token_hash = p_token_hash
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION invitation_for_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION invitation_for_token(text) TO coop_app;
