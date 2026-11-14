-- 기존 앱 문의는 수신 식별자가 NULL이다. Resend 재전달은 같은 식별자를 사용한다.
ALTER TABLE inquiry
    MODIFY COLUMN guest_email VARCHAR(254) NULL,
    ADD COLUMN resend_email_id VARCHAR(36) NULL,
    ADD COLUMN inbound_message_id VARCHAR(255) NULL,
    ADD CONSTRAINT uk_inquiry_resend_email_id UNIQUE (resend_email_id);
