package com.reserve.reservation.service;

import com.reserve.audit.service.AuditLogService;
import com.reserve.email.service.EmailService;
import com.reserve.global.error.ReservationException;
import com.reserve.member.entity.Member;
import com.reserve.member.repository.MemberRepository;
import com.reserve.payment.service.PaymentService;
import com.reserve.reservation.dto.ReservationCreateRequest;
import com.reserve.reservation.dto.ReservationResponse;
import com.reserve.reservation.dto.ReservationSearchDto;
import com.reserve.reservation.dto.ReservationUpdateRequest;
import com.reserve.reservation.entity.Reservation;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.store.repository.StoreRepository;
import com.reserve.store.entity.Store;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ReservationService {

    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;
    private final PaymentService paymentService;
    private final EmailService emailService;
    private final MemberRepository memberRepository;
    private final AuditLogService auditLogService;

    public ReservationService(
            ReservationRepository reservationRepository,
            StoreRepository storeRepository,
            @Lazy PaymentService paymentService,
            EmailService emailService,
            MemberRepository memberRepository,
            @Lazy AuditLogService auditLogService) {
        this.reservationRepository = reservationRepository;
        this.storeRepository = storeRepository;
        this.paymentService = paymentService;
        this.emailService = emailService;
        this.memberRepository = memberRepository;
        this.auditLogService = auditLogService;
    }

    /**
     * 예약 생성
     */
    @Transactional
    public ReservationResponse createReservation(ReservationCreateRequest request, Member member) {
        log.info("Reservation created: storeId={}, memberId={}", request.getStoreId(), member.getId());

        // 정지 체크 — JWT 크레임에는 status가 없으므로 DB에서 fresh 조회
        Member freshMember = memberRepository.findById(member.getId())
                .orElseThrow(() -> new ReservationException("회원 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
        if (freshMember.isSuspended()) {
            throw new ReservationException("계정이 정지된 상태입니다. 예약을 진행할 수 없습니다.", HttpStatus.FORBIDDEN);
        }
        if (!freshMember.isTermsAgreed()) {
            throw new ReservationException("서비스 이용 약관에 동의해야 예약할 수 있습니다.", HttpStatus.FORBIDDEN);
        }

        Store store = storeRepository.findById(request.getStoreId())
                .orElseThrow(() -> new ReservationException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        // 가게 주인이 정지된 경우 신규 예약 차단
        if (store.getOwner() != null && store.getOwner().isSuspended()) {
            throw new ReservationException("현재 운영이 중단된 가게입니다. 신규 예약을 받지 않습니다.", HttpStatus.BAD_REQUEST);
        }

        LocalDateTime reservationDateTime = LocalDateTime.of(request.getReservationDate(), request.getReservationTime());
        LocalDateTime now = LocalDateTime.now();

        if (reservationDateTime.isBefore(now)) {
            throw new ReservationException("예약 날짜/시간은 현재 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }

        // 예약 마감 시간 검증 (예약 시간 N시간 전까지만 예약 가능)
        if (store.getBookingDeadlineHours() != null && store.getBookingDeadlineHours() > 0) {
            LocalDateTime deadline = reservationDateTime.minusHours(store.getBookingDeadlineHours());
            if (now.isAfter(deadline)) {
                throw new ReservationException(
                    "예약 마감 시간이 지났습니다. 예약 시간 " + store.getBookingDeadlineHours() + "시간 전까지만 예약 가능합니다.",
                    HttpStatus.BAD_REQUEST
                );
            }
        }

        // 브레이크 타임 검증 (breakStartTime 이상, breakEndTime 미만은 예약 불가)
        if (store.getBreakStartTime() != null && store.getBreakEndTime() != null) {
            LocalTime resTime = request.getReservationTime();
            if (!resTime.isBefore(store.getBreakStartTime()) && resTime.isBefore(store.getBreakEndTime())) {
                String breakStr = store.getBreakStartTime().toString().substring(0, 5)
                    + " ~ " + store.getBreakEndTime().toString().substring(0, 5);
                throw new ReservationException(
                    "브레이크 타임(" + breakStr + ") 중에는 예약이 불가합니다. 다른 시간대를 선택해주세요.",
                    HttpStatus.BAD_REQUEST
                );
            }
        }

        // 나중 결제 허용 검증: allowLatePayment=false + 예약금 있으면 즉시 결제 필수
        boolean hasDeposit = store.getNoShowDeposit() != null && store.getNoShowDeposit() > 0;
        if (hasDeposit && !Boolean.TRUE.equals(store.getAllowLatePayment())) {
            // request에 skipPayment 플래그가 있으면(=나중 결제 시도) 거부
            if (Boolean.TRUE.equals(request.getSkipPayment())) {
                throw new ReservationException(
                        "이 가게는 나중 결제를 허용하지 않습니다. 예약금을 즉시 결제해주세요.",
                        HttpStatus.BAD_REQUEST
                );
            }
        }

        // 중복 예약 방지: 가게 정책에 따라 같은 날짜 활성 예약 여부 확인
        if (!Boolean.TRUE.equals(store.getAllowDuplicateReservation())) {
            boolean isDuplicate = reservationRepository.existsActiveReservationByMemberAndStoreAndDate(
                    member.getId(), store.getId(), request.getReservationDate());
            if (isDuplicate) {
                throw new ReservationException(
                        "이미 해당 날짜에 예약이 존재합니다. 같은 날 중복 예약은 불가합니다.",
                        HttpStatus.CONFLICT
                );
            }
        }

        // 동시간대 인원 체크
        int currentGuests = reservationRepository.sumActiveGuestsBySlot(
                store.getId(),
                request.getReservationDate(),
                request.getReservationTime()
        );
        if (store.getMaxCapacityPerSlot() != null) {
            int remaining = store.getMaxCapacityPerSlot() - currentGuests;
            if (remaining <= 0) {
                throw new ReservationException(
                        "해당 시간대 예약이 마감되었습니다. (" + currentGuests + "/" + store.getMaxCapacityPerSlot() + "명 마감) 다른 시간대를 선택해주세요.",
                        HttpStatus.CONFLICT
                );
            }
            if (request.getGuestCount() > remaining) {
                throw new ReservationException(
                        "선택하신 인원(" + request.getGuestCount() + "명)이 남은 자리(" + remaining + "명)를 초과합니다.",
                        HttpStatus.CONFLICT
                );
            }
        }

        // 자동 승인 여부에 따라 초기 상태 결정
        // - 예약금 없음 + 자동승인 ON → 즉시 CONFIRMED
        // - 예약금 있음 + 자동승인 ON → PENDING 유지, 결제 완료 시 PaymentService에서 CONFIRMED 전환
        // - 자동승인 OFF → 사장님이 수동 승인
        Reservation.ReservationStatus initialStatus =
                Boolean.TRUE.equals(store.getAutoApprovalEnabled()) && !hasDeposit
                        ? Reservation.ReservationStatus.CONFIRMED
                        : Reservation.ReservationStatus.PENDING;

        Reservation reservation = Reservation.builder()
                .member(member)
                .store(store)
                .reservationDate(request.getReservationDate())
                .reservationTime(request.getReservationTime())
                .guestCount(request.getGuestCount())
                .specialRequest(request.getSpecialRequest())
                .status(initialStatus)
                .depositAmount(store.getNoShowDeposit() != null ? store.getNoShowDeposit() : 0)
                .depositPaid(false)
                .build();

        ReservationResponse response = ReservationResponse.fromEntity(reservationRepository.save(reservation));

        // 사장님에게 새 예약 알림 (비동기) — 이메일 알림 설정 ON일 때만
        if (Boolean.TRUE.equals(store.getEmailNotificationEnabled())) {
            try {
                String ownerEmail = store.getOwner().getEmail();
                String ownerName  = store.getOwner().getName() != null ? store.getOwner().getName() : "사장님";
                emailService.sendNewReservationAlertToOwner(
                        ownerEmail, ownerName, store.getName(),
                        freshMember.getName(), freshMember.getEmail(),
                        request.getReservationDate().toString(),
                        request.getReservationTime().toString().substring(0, 5),
                        request.getGuestCount()
                );
            } catch (Exception e) {
                log.warn("Owner reservation notification email failed (service continues): {}", e.getMessage());
            }
        } else {
            log.debug("사장님 이메일 알림 비활성화 상태 — 발송 건너뜀");
        }

        return response;
    }

    /**
     * 예약 상세 조회
     */
    @Transactional(readOnly = true)
    public ReservationResponse getReservation(Long id, Member member) {
        Reservation reservation = findByIdOrThrow(id);
        validateOwnership(reservation, member);
        return ReservationResponse.fromEntity(reservation);
    }

    /**
     * 예약 수정 (사용자용)
     */
    @Transactional
    public ReservationResponse updateReservation(Long id, ReservationUpdateRequest request, Member member) {
        Reservation reservation = findByIdOrThrow(id);
        validateOwnership(reservation, member);

        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING) {
            throw new ReservationException("대기 중인 예약만 수정할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }

        if (request.getReservationDate() != null) reservation.setReservationDate(request.getReservationDate());
        if (request.getReservationTime() != null) reservation.setReservationTime(request.getReservationTime());
        if (request.getGuestCount() != null) reservation.setGuestCount(request.getGuestCount());
        if (request.getSpecialRequest() != null) reservation.setSpecialRequest(request.getSpecialRequest());

        LocalDateTime reservationDateTime = LocalDateTime.of(reservation.getReservationDate(), reservation.getReservationTime());
        if (reservationDateTime.isBefore(LocalDateTime.now())) {
            throw new ReservationException("수정하려는 날짜가 이미 지났습니다.", HttpStatus.BAD_REQUEST);
        }

        return ReservationResponse.fromEntity(reservationRepository.save(reservation));
    }

    /**
     * 예약 취소 (사용자용)
     */
    @Transactional
    public void cancelReservation(Long id, Member member) {
        Reservation reservation = findByIdOrThrow(id);
        validateOwnership(reservation, member);

        if (reservation.getStatus() == Reservation.ReservationStatus.CANCELLED) {
            throw new ReservationException("이미 취소된 예약입니다.", HttpStatus.BAD_REQUEST);
        }

        if (Boolean.TRUE.equals(reservation.getDepositPaid())) {
            paymentService.refundByReservationCancel(id);
        }

        reservation.setStatus(Reservation.ReservationStatus.CANCELLED);
    }

    /**
     * 예약 승인 (사업자용)
     */
    @Transactional
    public void approveReservation(Long id, Member owner) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING) {
            throw new ReservationException("대기 중인 예약만 승인 가능합니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.CONFIRMED);

        // 유저에게 승인 알림 (비동기) — 개인 알림 설정 ON일 때만
        if (reservation.getMember().isEmailNotificationEnabled()) {
            try {
                String memberName = reservation.getMember().getName() != null
                        ? reservation.getMember().getName() : "고객";
                emailService.sendReservationConfirmedEmail(
                        reservation.getMember().getEmail(),
                        memberName,
                        reservation.getStore().getName(),
                        reservation.getReservationDate().toString(),
                        reservation.getReservationTime().toString().substring(0, 5),
                        reservation.getGuestCount()
                );
            } catch (Exception e) {
                log.warn("예약 승인 알림 이메일 발송 실패: {}", e.getMessage());
            }
        }
    }

    /**
     * 예약 거절 (사업자용)
     */
    @Transactional
    public void rejectReservation(Long id, Member owner, String reason) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.PENDING) {
            throw new ReservationException("대기 중인 예약만 거절 가능합니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.REJECTED);
        reservation.setRejectionReason(reason != null ? reason : "가게 사정으로 인한 거절");

        // 유저에게 거절 알림 (비동기) — 개인 알림 설정 ON일 때만
        if (reservation.getMember().isEmailNotificationEnabled()) {
            try {
                String memberName = reservation.getMember().getName() != null
                        ? reservation.getMember().getName() : "고객";
                emailService.sendReservationRejectedEmail(
                        reservation.getMember().getEmail(),
                        memberName,
                        reservation.getStore().getName(),
                        reservation.getReservationDate().toString(),
                        reservation.getReservationTime().toString().substring(0, 5),
                        reservation.getGuestCount(),
                        reservation.getRejectionReason()
                );
            } catch (Exception e) {
                log.warn("Reservation rejection email failed: {}", e.getMessage());
            }
        }
    }

    /**
     * 이용완료 처리 (사업자용)
     */
    @Transactional
    public void completeReservation(Long id, Member owner) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED) {
            throw new ReservationException("승인된 예약만 이용완료 처리가 가능합니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.COMPLETED);
    }

    /**
     * 노쇼 처리 (사업자용)
     */
    @Transactional
    public void markNoShow(Long id, Member owner) {
        Reservation reservation = findByIdOrThrow(id);
        validateStoreOwner(reservation, owner);

        if (reservation.getStatus() != Reservation.ReservationStatus.CONFIRMED) {
            throw new ReservationException("승인된 예약만 노쇼 처리가 가능합니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.setStatus(Reservation.ReservationStatus.NO_SHOW);
    }

    /**
     * 예약 검색 및 목록 조회 (사업자용)
     */
    @Transactional(readOnly = true)
    public Page<ReservationResponse> searchReservations(Long storeId, ReservationSearchDto searchDto, Member owner) {
        Store store = storeRepository.findById(storeId)
                .orElseThrow(() -> new ReservationException("가게를 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        if (!store.getOwner().getId().equals(owner.getId())) {
            throw new ReservationException("본인 가게의 예약만 조회 가능합니다.", HttpStatus.FORBIDDEN);
        }

        Pageable pageable = PageRequest.of(searchDto.getPage(), searchDto.getSize());
        return reservationRepository.findByStoreOrderByReservationDateDescReservationTimeDesc(store, pageable)
                .map(ReservationResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    public List<ReservationResponse> getMyReservations(Member member) {
        List<Reservation> reservations = reservationRepository.findByMemberOrderByCreatedAtDesc(member);

        // COMPLETED 예약 ID만 모아서 리뷰 ID를 IN 쿼리 1번으로 조회 (N+1 방지)
        List<Long> completedIds = reservations.stream()
                .filter(r -> r.getStatus() == Reservation.ReservationStatus.COMPLETED)
                .map(Reservation::getId)
                .collect(Collectors.toList());

        Map<Long, Long> reviewIdByReservationId = new java.util.HashMap<>();
        if (!completedIds.isEmpty()) {
            reservationRepository.findReviewIdsByReservationIds(completedIds)
                    .forEach(row -> reviewIdByReservationId.put((Long) row[0], (Long) row[1]));
        }

        return reservations.stream()
                .map(r -> {
                    Long reviewId = reviewIdByReservationId.get(r.getId());
                    return reviewId != null
                            ? ReservationResponse.fromEntityWithReviewId(r, reviewId)
                            : ReservationResponse.fromEntity(r);
                })
                .collect(Collectors.toList());
    }

    /**
     * 사업자/관리자 - 가게 예약 목록 조회 (최신순)
     * - ADMIN: 페이지네이션 지원 (기본 100건/페이지)
     * - BUSINESS: 본인 소유 가게 예약 (fetch join + 단일 쿼리)
     */
    @Transactional(readOnly = true)
    public Page<ReservationResponse> getStoreReservations(Member owner, int page, int size) {
        int safeSize = Math.min(size, 100); // 최대 100건으로 고정
        Pageable pageable = PageRequest.of(page, safeSize);
        if (owner.isAdmin()) {
            return reservationRepository.findAllWithStoreAndMemberPaged(pageable)
                    .map(ReservationResponse::fromEntity);
        }
        // BUSINESS: owner 기준으로 가게-예약 한 번에 조회
        return reservationRepository.findByStoreOwnerOrderByCreatedAtDesc(owner, pageable)
                .map(ReservationResponse::fromEntity);
    }

    /**
     * 예약 목록에서 숨기기 (소프트 삭제)
     * 사용자/사업자가 완료·취소·거절·노쇼 예약을 목록에서 제거
     */
    @Transactional
    public void removeReservation(Long id, Member member) {
        Reservation reservation = findByIdOrThrow(id);

        // 사용자 본인 또는 가게 사장님만 가능
        boolean isOwner = reservation.getMember().getId().equals(member.getId());
        boolean isStoreOwner = reservation.getStore().getOwner().getId().equals(member.getId());
        if (!isOwner && !isStoreOwner && !member.isAdmin()) {
            throw new ReservationException("해당 예약에 대한 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }

        // 진행 중인 예약은 삭제 불가
        Reservation.ReservationStatus status = reservation.getStatus();
        boolean isDeletable = status == Reservation.ReservationStatus.CANCELLED
                || status == Reservation.ReservationStatus.REJECTED
                || status == Reservation.ReservationStatus.COMPLETED
                || status == Reservation.ReservationStatus.NO_SHOW;

        if (!isDeletable) {
            throw new ReservationException("완료·취소·거절·노쇼 상태의 예약만 삭제할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }

        reservation.softDelete();
        auditLogService.logReservationDelete(reservation);  // 관리자 휴지통에 기록 (삭제 주체 = 현재 로그인 유저)
        log.info("Reservation removed: id={}, memberId={}", id, member.getId());
    }

    // ========== 내부 도우미 메서드 ==========

    private Reservation findByIdOrThrow(Long id) {
        return reservationRepository.findById(id)
                .orElseThrow(() -> new ReservationException("예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private void validateOwnership(Reservation reservation, Member member) {
        if (!reservation.getMember().getId().equals(member.getId())) {
            throw new ReservationException("해당 예약에 대한 권한이 없습니다.", HttpStatus.FORBIDDEN);
        }
    }

    private void validateStoreOwner(Reservation reservation, Member owner) {
        if (owner.isAdmin()) return; // 관리자는 모든 예약 접근 가능
        if (!reservation.getStore().getOwner().getId().equals(owner.getId())) {
            throw new ReservationException("가게 소유자만 접근 가능합니다.", HttpStatus.FORBIDDEN);
        }
    }
}