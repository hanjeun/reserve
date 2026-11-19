CREATE TABLE service_report (
    id BIGINT NOT NULL AUTO_INCREMENT,
    target_type VARCHAR(20) NOT NULL,
    target_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    subject_member_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    reason VARCHAR(32) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    last_activity_at DATETIME(6) NOT NULL,
    reviewed_by BIGINT NULL,
    reviewed_at DATETIME(6) NULL,
    decision_note VARCHAR(500) NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT uk_service_report_target UNIQUE (target_type, target_id),
    KEY ix_service_report_status_activity (status, last_activity_at, id),
    KEY ix_service_report_subject (subject_member_id, id),
    KEY ix_service_report_store (store_id, id)
) ENGINE=InnoDB;

CREATE TABLE service_report_entry (
    id BIGINT NOT NULL AUTO_INCREMENT,
    report_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    kind VARCHAR(12) NOT NULL,
    reason VARCHAR(32) NULL,
    details VARCHAR(500) NOT NULL,
    evidence VARCHAR(1400) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_service_report_entry FOREIGN KEY (report_id) REFERENCES service_report(id) ON DELETE CASCADE,
    KEY ix_service_report_entry_order (report_id, id),
    KEY ix_service_report_entry_actor (actor_id, report_id, kind)
) ENGINE=InnoDB;
