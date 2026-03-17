-- Rename FK on styles.current_version_id to remove legacy v2_ prefix
ALTER TABLE styles
  DROP CONSTRAINT v2_styles_current_version_id_fkey;

ALTER TABLE styles
  ADD CONSTRAINT styles_current_version_id_fkey
  FOREIGN KEY (current_version_id)
  REFERENCES style_versions(id)
  ON DELETE SET NULL;
