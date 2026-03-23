-- =============================================================================
-- Add email column to profiles + keep it in sync with auth.users.
--
-- Motivation:
--   The frontend needs to display "Name — email" in the ownership-transfer
--   dropdown.  auth.users is not queryable from the public schema by the
--   authenticated role.  Storing a copy of email in profiles lets PostgREST
--   resolve the value through the existing tenant_memberships → profiles join
--   without any additional views or cross-schema queries.
--
-- What this migration does:
--   1. Adds profiles.email (nullable text, idempotent).
--   2. Backfills email for every existing profile from auth.users.
--   3. Updates handle_new_user() so new signups write email from the start.
--   4. Adds sync_profile_email() + trigger so email changes in auth.users
--      propagate automatically to profiles.
--
-- RLS:
--   The existing SELECT policy "profiles_select_self_or_tenant_member" already
--   controls which profile rows a caller can read.  No policy changes are
--   needed — the email column inherits the same row-level visibility.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add column
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email text;

-- ---------------------------------------------------------------------------
-- 2. Backfill existing rows
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET    email = u.email
FROM   auth.users u
WHERE  u.id = p.id
  AND  p.email IS DISTINCT FROM u.email;

-- ---------------------------------------------------------------------------
-- 3. Update handle_new_user() to capture email at signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        first_name,
        last_name,
        phone,
        avatar_url,
        email,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'last_name',
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.email,
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Sync function + trigger: propagate auth.users email changes to profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET    email = NEW.email
    WHERE  id    = NEW.id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;

CREATE TRIGGER on_auth_user_email_changed
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.sync_profile_email();

COMMIT;
