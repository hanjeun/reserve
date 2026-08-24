package kr.it.reserve.payment;

import kr.it.reserve.payment.entity.RefundAttempt;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 환불 경로에서 새로 추가한 쿼리들이 <b>실제로 SQL 로 변환되어 실행되는지</b>만 확인한다.
 *
 * <h2>왜 이런 테스트가 따로 필요한가</h2>
 * 이 쿼리들은 평소 실행되지 않는다 — 환불이 일어나야만 탄다.
 * 그래서 SQL 문법이 틀려 있어도 <b>운영에서 환불을 시도하는 순간에야</b> 드러난다.
 * 하필 그 순간은 손님 돈이 걸려 있는 때다. 이 프로젝트에는 전례도 있다 —
 * {@code storeId} 설정이 취소 요청에서만 쓰여, 값이 잘못된 걸 환불할 때 404 로 알게 됐다.
 *
 * <h2>이 테스트가 증명하지 <b>못</b>하는 것</h2>
 * <b>동시성 방어는 여기서 검증되지 않는다.</b> H2 의 {@code FOR UPDATE} 는 MySQL 의 InnoDB
 * 행 잠금과 동작이 다르고, 스레드 두 개로 경쟁 상황을 재현해도 이 환경에서 나온 결과를
 * 운영 DB 의 보증으로 삼을 수 없다. <b>실제 잠금 동작은 MySQL 에서 확인해야 한다.</b>
 * 여기서 보는 것은 "쿼리가 문법적으로 살아 있고 결과를 돌려준다" 까지다.
 */
@SpringBootTest
class RefundLockQuerySmokeTest {

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private RefundAttemptRepository refundAttemptRepository;

    @Test
    @Transactional
    @DisplayName("행 잠금 조회가 SQL 로 실행된다 (FOR UPDATE 구문이 살아 있는지)")
    void lockingFindersExecute() {
        assertThatCode(() -> paymentRepository.findByIdForUpdate(-1L)).doesNotThrowAnyException();
        assertThatCode(() -> paymentRepository.findPaidByReservationIdForUpdate(-1L)).doesNotThrowAnyException();

        // 없는 ID 이므로 결과는 비어 있어야 한다 — 쿼리가 조건을 무시하고 아무 행이나 집지 않는지도 함께 본다.
        assertThat(paymentRepository.findByIdForUpdate(-1L)).isEmpty();
        assertThat(paymentRepository.findPaidByReservationIdForUpdate(-1L)).isEmpty();
    }

    @Test
    @DisplayName("미결 원장 조회(생성자 표현식)가 SQL 로 실행된다")
    void unresolvedProjectionExecutes() {
        assertThatCode(() -> refundAttemptRepository
                .findUnresolvedBefore(RefundAttempt.UNRESOLVED, LocalDateTime.now()))
                .doesNotThrowAnyException();

        assertThat(refundAttemptRepository.countByStatusIn(RefundAttempt.UNRESOLVED)).isZero();
    }
}
