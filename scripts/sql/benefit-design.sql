-- Apply once after checking the target and information_schema.COLUMNS.
-- Existing rows and clients keep the standard template.
ALTER TABLE promotion
  ADD COLUMN benefit_design VARCHAR(16) NOT NULL DEFAULT 'STANDARD',
  ADD CONSTRAINT ck_promotion_benefit_design CHECK (benefit_design IN ('STANDARD', 'PHOTO', 'COMPACT'));
