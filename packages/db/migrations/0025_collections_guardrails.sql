-- Collection sheets: society isolation and grants. A draft's lines are replaced as the sheet is
-- edited, so lines can be deleted while the sheet is a draft (the trigger below enforces when).
ALTER TABLE collection_sheets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE collection_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY society_isolation ON collection_sheets USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
CREATE POLICY society_isolation ON collection_lines USING (society_id = app_society_id()) WITH CHECK (society_id = app_society_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON collection_sheets TO coop_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_lines TO coop_app;
--> statement-breakpoint
-- A submitted or posted sheet is history: what members paid can't change.
CREATE FUNCTION guard_submitted_collection() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  sheet_status collection_status;
BEGIN
  SELECT status INTO sheet_status FROM collection_sheets WHERE id = COALESCE(NEW.sheet_id, OLD.sheet_id);
  IF sheet_status IN ('submitted', 'posted') THEN
    RAISE EXCEPTION 'Collection sheet % is % and can no longer change', COALESCE(NEW.sheet_id, OLD.sheet_id), sheet_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
--> statement-breakpoint
CREATE TRIGGER collection_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON collection_lines
  FOR EACH ROW EXECUTE FUNCTION guard_submitted_collection();
--> statement-breakpoint
-- Collectors are officers too, so the staff console counts them.
CREATE OR REPLACE FUNCTION platform_societies(p_user_id uuid)
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
       AND su.roles && ARRAY['principal_officer','chairperson','secretary','treasurer','loan_officer','loan_committee','payroll_officer','collector','auditor']),
    (SELECT max(a.occurred_at) FROM audit_events a WHERE a.society_id = s.id)
  FROM societies s
  ORDER BY s.created_at DESC;
END
$$;
