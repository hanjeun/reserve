package kr.it.reserve.payment.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Getter
@NoArgsConstructor(access = lombok.AccessLevel.PROTECTED)
@Table(name = "test_settlement_payout", indexes = {
        @Index(name = "idx_test_settlement_payment", columnList = "payment_id"),
        @Index(name = "idx_test_settlement_store", columnList = "store_id,created_at") })
public class TestSettlementPayout {
    @Id @Column(name = "request_key", length = 64) private String requestKey;
    @Column(name = "payment_id", nullable = false) private Long paymentId;
    @Column(name = "store_id", nullable = false) private Long storeId;
    @Column(name = "owner_id", nullable = false) private Long ownerId;
    @Column(nullable = false) private long amount;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;

    public TestSettlementPayout(String key, Long paymentId, Long storeId, Long ownerId, long amount, LocalDateTime now) {
        this.requestKey = key;
        this.paymentId = paymentId;
        this.storeId = storeId;
        this.ownerId = ownerId;
        this.amount = amount;
        this.createdAt = now.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }
}
