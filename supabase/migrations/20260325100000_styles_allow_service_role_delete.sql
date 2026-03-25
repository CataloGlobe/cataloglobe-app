-- Allow service_role to delete system styles (needed for purge-tenant hard delete).
-- Regular users are still blocked by the existing check.
CREATE OR REPLACE FUNCTION public.prevent_delete_system_styles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system = TRUE AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'cannot_delete_system_style';
  END IF;

  RETURN OLD;
END;
$$;
