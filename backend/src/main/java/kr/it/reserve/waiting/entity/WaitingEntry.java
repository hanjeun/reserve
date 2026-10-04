package kr.it.reserve.waiting.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import kr.it.reserve.waiting.error.WaitingException;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "waiting_entry", uniqueConstraints = {
        @UniqueConstraint(name = "uk_waiting_store_number", columnNames = {"store_id", "business_date", "entry_number"}),
        @UniqueConstraint(name = "uk_waiting_store_request", columnNames = {"store_id", "client_request_id"})
}, indexes = {
        @Index(name = "idx_waiting_board", columnList = "store_id, status, business_date, entry_number"),
        @Index(name = "idx_waiting_finished", columnList = "status, finished_at")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WaitingEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "waiting_entry_id")
    private Long id;

    // 폐업·회원 파기 경로와 역방향 연관을 만들지 않는다. 접수·수정은 반드시 Store 잠금과 소유 검사를 거친다.
    @Column(name = "store_id", nullable = false)
    private Long storeId;

    @Column(name = "business_date", nullable = false)
    private LocalDate businessDate;

    @Column(name = "entry_number", nullable = false)
    private int entryNumber;

    @Column(name = "display_name", length = 40)
    private String displayName;

    @Column(name = "party_size", nullable = false)
    private int partySize;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "status", nullable = false, length = 20)
    private WaitingStatus status;

    @Column(name = "client_request_id", nullable = false, length = 64)
    private String clientRequestId;

    // 신규 웨이팅 시각은 JVM의 기본 시간대와 관계없이 UTC로 저장한다.
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "called_at")
    private LocalDateTime calledAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    public static WaitingEntry create(Long storeId, LocalDate businessDate, int entryNumber,
                                      String displayName, int partySize, String clientRequestId,
                                      LocalDateTime nowUtc) {
        WaitingEntry entry = new WaitingEntry();
        entry.storeId = storeId;
        entry.businessDate = businessDate;
        entry.entryNumber = entryNumber;
        entry.displayName = displayName;
        entry.partySize = partySize;
        entry.clientRequestId = clientRequestId;
        entry.status = WaitingStatus.WAITING;
        entry.createdAt = nowUtc;
        entry.updatedAt = nowUtc;
        return entry;
    }

    public void changeStatus(WaitingStatus next, LocalDateTime nowUtc) {
        if (next == null || next == WaitingStatus.WAITING) {
            throw new WaitingException("변경할 대기 상태를 확인해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (status == next) return;
        boolean allowed = (status == WaitingStatus.WAITING && (next == WaitingStatus.CALLED || next == WaitingStatus.CANCELLED))
                || (status == WaitingStatus.CALLED && next.isTerminal());
        if (!allowed) {
            throw new WaitingException("이미 처리된 접수이거나 변경할 수 없는 상태입니다. 목록을 새로고침해주세요.", HttpStatus.CONFLICT);
        }
        status = next;
        updatedAt = nowUtc;
        if (next == WaitingStatus.CALLED) calledAt = nowUtc;
        if (next.isTerminal()) finishedAt = nowUtc;
    }
}
