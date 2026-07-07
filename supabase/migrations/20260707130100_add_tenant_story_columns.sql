-- Brand-level "cappello" fields for Storia feature
ALTER TABLE public.tenants
  ADD COLUMN story_cover TEXT,
  ADD COLUMN story_title TEXT,
  ADD COLUMN story_intro TEXT,
  ADD COLUMN website TEXT;
