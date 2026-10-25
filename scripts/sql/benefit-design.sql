-- 대상과 메타데이터를 대조한 뒤 한 번만 적용한다.
-- 기존 행과 클라이언트는 기본 템플릿을 유지한다.
ALTER TABLE promotion
  ADD COLUMN benefit_design VARCHAR(16) NOT NULL DEFAULT 'STANDARD',
  ADD CONSTRAINT ck_promotion_benefit_design CHECK (benefit_design IN ('STANDARD', 'PHOTO', 'COMPACT'));
