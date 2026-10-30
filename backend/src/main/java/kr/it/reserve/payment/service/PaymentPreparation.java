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

        // 결제 준비 전에 예약 소유권을 확인한다.
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

        if (kr.it.reserve.reservation.service.ReservationPaymentPolicy.expiredAt(reservation, LocalDateTime.now(Clock.systemDefaultZone()))) {
            throw new PaymentException("결제 기한이 지났어요. 내 예약에서 상태를 확인해주세요.", HttpStatus.CONFLICT);
        }

        // 결제 금액은 요청값이 아니라 예약 당시 서버에서 확정한 금액을 사용한다.
        int amount = resolveDepositAmount(reservation);
        if (amount <= 0) {
            throw new PaymentException("결제할 예약금이 없는 예약이에요.", HttpStatus.BAD_REQUEST);
        }

        // 회원 잠금을 기다리기 전의 RR snapshot 대신 현재 잠근 READY를 재사용한다.
        Payment existingReady = lockedPayments.stream()
                .filter(payment -> payment.getStatus() == Payment.PaymentStatus.READY).findFirst().orElse(null);

        if (existingReady != null) {
            // 재사용할 결제 대기 행도 예약의 확정 금액과 다시 맞춘다.
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
        return "ORD" + LocalDateTime.now(Clock.systemDefaultZone()).format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")) + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }
}
