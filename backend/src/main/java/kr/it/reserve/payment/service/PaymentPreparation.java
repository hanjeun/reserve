package kr.it.reserve.payment.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.payment.dto.*;
import kr.it.reserve.payment.entity.Payment;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.entity.Store;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/** 결제창 준비는 짧은 DB 트랜잭션에서만 수행하며 외부 PG 통신은 하지 않는다. */
@Slf4j(topic = "kr.it.reserve.payment.service.PaymentService")
final class PaymentPreparation {
    private final PaymentRepository paymentRepository;
    private final ReservationRepository reservationRepository;
    private final MemberRepository memberRepository;
    private final PortoneService portoneService;
    private final EntityManager entityManager;
    PaymentPreparation(PaymentRepository payments, ReservationRepository reservations,
                       MemberRepository members, PortoneService portone, EntityManager entityManager) {
        paymentRepository = payments;
        reservationRepository = reservations;
        memberRepository = members;
        portoneService = portone;
        this.entityManager = entityManager;
    }

    public PaymentPrepareDto preparePayment(PaymentRequestDto requestDto, Long memberId) {
        FinancialReservationLocks.Locked locked = new FinancialReservationLocks(memberRepository, reservationRepository, entityManager)
                .lock(requestDto.getReservationId(), memberId);
        Member member = locked.actor();
        Reservation reservation = locked.reservation();
        // 빈 결제 범위의 gap lock보다 회원·예약의 단일 행 잠금을 먼저 잡는다.
        List<Payment> lockedPayments = paymentRepository.findAllByReservationIdForUpdate(requestDto.getReservationId());
        entityManager.flush();
        for (Payment payment : lockedPayments) entityManager.refresh(payment, LockModeType.PESSIMISTIC_WRITE);

        // ★ 본인 예약인지 확인한다 (2026-08-09).
        //   예전엔 reservationId 를 body 에서 받아 그대로 조회만 했다. 로그인만 하면
        //   남의 예약에 대해 결제를 준비하고, 아래 금액 문제와 겹쳐 남의 예약을
        //   임의 금액으로 "결제 완료" 상태로 만들 수 있었다.
        if (reservation.getMember() == null || !reservation.getMember().getId().equals(memberId)) {
            log.warn("Payment prepare denied - not owner: reservationId={}, memberId={}",
                    reservation.getId(), memberId);
            throw new PaymentException("본인의 예약만 결제할 수 있어요.", HttpStatus.FORBIDDEN);
        }
        if (PaymentReservationPolicy.closedFor(reservation)) {
            throw new PaymentException("취소되거나 종료된 예약은 결제할 수 없어요.", HttpStatus.CONFLICT);
        }

        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            throw new PaymentException("이미 결제가 완료된 예약이에요.", HttpStatus.CONFLICT);
        }

        // ★ 결제 금액은 서버에서만 정한다 (2026-08-09).
        //   예전엔 requestDto.getAmount() 를 그대로 Payment.amount 에 넣었고,
        //   verifyAndCompletePayment 는 PG 결제액을 "그 값"과 비교했다. 즉 검증이
        //   공격자가 정한 숫자를 기준으로 통과했고, markDepositPaid 가 예약의
        //   예약금을 그 금액으로 덮어썼다. 요청 본문의 amount 는 이제 무시한다.
        int amount = resolveDepositAmount(reservation);
        if (amount <= 0) {
            throw new PaymentException("결제할 예약금이 없는 예약이에요.", HttpStatus.BAD_REQUEST);
        }

        // 회원 잠금을 기다리기 전의 RR snapshot 대신 현재 잠근 READY를 재사용한다.
        Payment existingReady = lockedPayments.stream()
                .filter(payment -> payment.getStatus() == Payment.PaymentStatus.READY).findFirst().orElse(null);

        if (existingReady != null) {
            // 재사용 시에도 금액을 예약 당시 확정된 값으로 다시 맞춘다 — 예전 READY 행에는
            // 클라이언트가 보냈던 금액이 그대로 남아 있을 수 있다.
            if (!Integer.valueOf(amount).equals(existingReady.getAmount())) {
                log.info("Resyncing READY payment amount: paymentId={}, {} -> {}",
                        existingReady.getId(), existingReady.getAmount(), amount);
                existingReady.setAmount(amount);
            }
            log.info("Reusing existing READY payment: paymentId={}, merchantUid={}",
                    existingReady.getId(), existingReady.getMerchantUid());
            return PaymentPrepareDto.builder()
                    .merchantUid(existingReady.getMerchantUid())
                    .amount(amount)
                    .productName(existingReady.getProductName())
                    .buyerName(existingReady.getBuyerName())
                    .buyerEmail(existingReady.getBuyerEmail())
                    .buyerTel(existingReady.getBuyerTel())
                    .storeId(portoneService.getStoreId())
                    .pgProvider(existingReady.getPgProvider())
                    .reservationId(reservation.getId())
                    .build();
        }

        String merchantUid = generateMerchantUid();

        Payment payment = Payment.builder()
                .member(member)
                .reservation(reservation)
                .merchantUid(merchantUid)
                .amount(amount)
                .productName(requestDto.getProductName())
                .buyerName(requestDto.getBuyerName() != null ? requestDto.getBuyerName() : member.getName())
                .buyerEmail(requestDto.getBuyerEmail() != null ? requestDto.getBuyerEmail() : member.getEmail())
                .buyerTel(requestDto.getBuyerTel())
                .pgProvider(requestDto.getPgProvider())
                .status(Payment.PaymentStatus.READY)
                .build();

        paymentRepository.save(payment);

        return PaymentPrepareDto.builder()
                .merchantUid(merchantUid)
                .amount(amount)
                .productName(requestDto.getProductName())
                .buyerName(payment.getBuyerName())
                .buyerEmail(payment.getBuyerEmail())
                .buyerTel(payment.getBuyerTel())
                .storeId(portoneService.getStoreId())
                .pgProvider(requestDto.getPgProvider())
                .reservationId(reservation.getId())
                .build();
    }

    private int resolveDepositAmount(Reservation reservation) {
        Integer fromReservation = reservation.getDepositAmount();
        if (fromReservation != null) {
            // 0원도 예약 당시 확정된 금액이다. 가게의 이후 가격을 가져와 유료 예약으로 바꾸지 않는다.
            return Math.max(0, fromReservation);
        }
        Store store = reservation.getStore();
        Integer fromStore = (store != null) ? store.getNoShowDeposit() : null;
        return (fromStore != null && fromStore > 0) ? fromStore : 0;
    }

    private String generateMerchantUid() {
        return "ORD-" + LocalDateTime.now(Clock.systemDefaultZone()).format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")) + "-" + UUID.randomUUID().toString().substring(0, 6);
    }
}
