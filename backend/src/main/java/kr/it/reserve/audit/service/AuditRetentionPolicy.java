package kr.it.reserve.audit.service;

/** 보존 기간 숫자가 저장·정리 경로에서 서로 어긋나지 않게 하는 단일 정본. */
public final class AuditRetentionPolicy {
    public static final int TRASH_DAYS = 30;
    public static final int AUDIT_DAYS = 90;

    private AuditRetentionPolicy() {
    }
}
