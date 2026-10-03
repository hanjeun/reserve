package kr.it.reserve.audit;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.audit.entity.AuditLog;
import kr.it.reserve.audit.repository.AuditLogRepository;
import kr.it.reserve.audit.service.AuditCleanupWorker;
import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.audit.service.AdminSanctionService;
import kr.it.reserve.global.error.AuditException;
import kr.it.reserve.mailbox.entity.AdminSentMail;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.entity.Review;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

@ExtendWith(MockitoExtension.class)
class AuditLogSnapshotContractTest {

    private static final String ACTOR_EMAIL = "audit-operator@example.test";
    private static final String SOFT_DELETE_ACTION = "SOFT_DELETE";
    private static final String RESERVATION_TYPE = "RESERVATION";

    @Mock private AuditLogRepository auditLogRepository;
    @Mock private AdminSentMailRepository adminSentMailRepository;
    @Mock private ReservationRepository reservationRepository;
    @Mock private ReviewRepository reviewRepository;
    @Mock private AdvertisementRepository advertisementRepository;
    @Mock private AuditCleanupWorker auditCleanupWorker;
    @Mock private MemberRepository memberRepository;
    @Mock private StoreRepository storeRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private AuditLogService service;

    @BeforeEach
    void setUp() {
        service = new AuditLogService(auditLogRepository, adminSentMailRepository, reservationRepository,
                reviewRepository, advertisementRepository, objectMapper, auditCleanupWorker);
        Member actor = Member.builder().id(90L).email(ACTOR_EMAIL).build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(actor, null, List.of()));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("발송 메일은 본문을 보존하며 수신자와 빈 제목을 휴지통 스냅샷에 남긴다")
    void sentMailSoftDeleteKeepsTheMailAndSnapshotsItsRecipient() throws Exception {
        AdminSentMail mail = AdminSentMail.builder().id(11L).toEmail("recipient@example.test")
                .subject(null).body("보존할 발송 본문").build();
        when(adminSentMailRepository.findById(11L)).thenReturn(Optional.of(mail));
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        service.softDeleteSentMail(11L);

        assertThat(mail.isDeleted()).isTrue();
        assertThat(mail.getBody()).isEqualTo("보존할 발송 본문");
        assertRecordedLog("SENT_MAIL", 11L, SOFT_DELETE_ACTION,
                Map.of("toEmail", "recipient@example.test", "subject", ""), started, 30);
        verify(adminSentMailRepository).findById(11L);
        verifyNoMoreInteractions(auditLogRepository, adminSentMailRepository);
        verifyNoInteractions(reservationRepository, reviewRepository, advertisementRepository, auditCleanupWorker);
    }

    @Test
    @DisplayName("호출자가 삭제한 예약은 다시 변경하지 않고 같은 예약 스냅샷만 기록한다")
    void callerDeletedReservationOnlyAddsItsSnapshot() throws Exception {
        Reservation reservation = reservation();
        reservation.softDelete();
        LocalDateTime deletedAt = reservation.getDeletedAt();
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        service.logReservationDelete(reservation);

        assertThat(reservation.getDeletedAt()).isEqualTo(deletedAt);
        assertReservationSnapshot(21L, started);
        verifyNoMoreInteractions(auditLogRepository);
        verifyNoInteractions(adminSentMailRepository, reservationRepository,
                reviewRepository, advertisementRepository, auditCleanupWorker);
    }

    @Test
    @DisplayName("관리자 예약 삭제는 행과 예약 상태를 보존하며 예약 타입의 스냅샷을 기록한다")
    void reservationSoftDeleteKeepsTheRowAndItsStatus() throws Exception {
        Reservation reservation = reservation();
        when(reservationRepository.findById(21L)).thenReturn(Optional.of(reservation));
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        service.softDeleteReservation(21L);

        assertThat(reservation.isDeleted()).isTrue();
        assertThat(reservation.getStatus()).isEqualTo(Reservation.ReservationStatus.CANCELLED);
        assertReservationSnapshot(21L, started);
        verify(reservationRepository).findById(21L);
        verifyNoMoreInteractions(auditLogRepository, reservationRepository);
        verifyNoInteractions(adminSentMailRepository, reviewRepository, advertisementRepository, auditCleanupWorker);
    }

    @Test
    @DisplayName("리뷰 원문은 보존하고 작성자·별점·20자 요약을 스냅샷에 기록한다")
    void reviewSoftDeleteKeepsItsOriginalContent() throws Exception {
        String content = "12345678901234567890원문은 삭제하지 않고 보존합니다";
        Review review = Review.builder().id(31L).store(store()).member(Member.builder().id(7L).build())
                .rating(5).content(content).build();
        when(reviewRepository.findById(31L)).thenReturn(Optional.of(review));
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        service.softDeleteReview(31L);

        assertThat(review.isDeleted()).isTrue();
        assertThat(review.getContent()).isEqualTo(content);
        assertRecordedLog("REVIEW", 31L, SOFT_DELETE_ACTION,
                Map.of("가게", "스냅샷 가게", "작성자", "", "별점", "5점", "내용", "12345678901234567890..."),
                started, 30);
        verify(reviewRepository).findById(31L);
        verifyNoMoreInteractions(auditLogRepository, reviewRepository);
        verifyNoInteractions(adminSentMailRepository, reservationRepository, advertisementRepository, auditCleanupWorker);
    }

    @Test
    @DisplayName("광고를 숨겨도 결제 식별자와 종료 상태를 보존하고 광고 스냅샷을 남긴다")
    void advertisementSoftDeleteKeepsItsPaymentReference() throws Exception {
        Advertisement advertisement = Advertisement.builder().id(41L).store(store()).adType(AdType.BANNER)
                .startDate(LocalDate.of(2026, 9, 1)).endDate(LocalDate.of(2026, 9, 7))
                .status(AdStatus.EXPIRED).merchantUid("audit-advertisement-order").build();
        when(advertisementRepository.findById(41L)).thenReturn(Optional.of(advertisement));
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        service.softDeleteAdvertisement(41L);

        assertThat(advertisement.isDeleted()).isTrue();
        assertThat(advertisement.getMerchantUid()).isEqualTo("audit-advertisement-order");
        assertThat(advertisement.getStatus()).isEqualTo(AdStatus.EXPIRED);
        assertRecordedLog("ADVERTISEMENT", 41L, SOFT_DELETE_ACTION,
                Map.of("가게", "스냅샷 가게", "유형", "BANNER", "기간", "2026-09-01 ~ 2026-09-07", "상태", "EXPIRED"),
                started, 30);
        verify(advertisementRepository).findById(41L);
        verifyNoMoreInteractions(auditLogRepository, advertisementRepository);
        verifyNoInteractions(adminSentMailRepository, reservationRepository, reviewRepository, auditCleanupWorker);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"SENT_MAIL", RESERVATION_TYPE, "REVIEW", "ADVERTISEMENT", "reservation"})
    @DisplayName("복구는 지정된 저장소만 호출하고 해당 휴지통 기록만 제거한다")
    void restoreTargetsOnlyItsRepositoryAndItsTrashEntry(String entityType) throws Exception {
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        service.restore(entityType, 51L);

        String normalizedType = entityType.toUpperCase(Locale.ROOT);
        switch (normalizedType) {
            case "SENT_MAIL" -> verify(adminSentMailRepository).restoreById(51L);
            case RESERVATION_TYPE -> verify(reservationRepository).restoreById(51L);
            case "REVIEW" -> verify(reviewRepository).restoreById(51L);
            case "ADVERTISEMENT" -> verify(advertisementRepository).restoreById(51L);
            default -> throw new AssertionError("Unexpected test type: " + entityType);
        }
        verify(auditLogRepository).deleteSoftDeleteLog(normalizedType, 51L);
        assertRecordedLog(entityType, 51L, "RESTORE", Map.of(), started, 90);
        verifyNoMoreInteractions(auditLogRepository, adminSentMailRepository,
                reservationRepository, reviewRepository, advertisementRepository);
        verifyNoInteractions(auditCleanupWorker);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"MEMBER", "STORE"})
    @DisplayName("제재 대상인 회원·가게는 휴지통 복구로 변경하거나 감사 기록을 지우지 않는다")
    void unsupportedRestoreDoesNotChangeAnyRepository(String entityType) {
        assertThatThrownBy(() -> service.restore(entityType, 61L))
                .isInstanceOfSatisfying(AuditException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception).hasMessage("휴지통 복구가 지원되지 않는 항목입니다: " + entityType);
                });

        verifyNoInteractions(auditLogRepository, adminSentMailRepository, reservationRepository,
                reviewRepository, advertisementRepository, auditCleanupWorker);
    }

    private Reservation reservation() {
        return Reservation.builder().id(21L).store(store())
                .member(Member.builder().id(7L).name("예약 고객").build())
                .reservationDate(LocalDate.of(2026, 10, 3))
                .status(Reservation.ReservationStatus.CANCELLED).build();
    }

    @Test
    @DisplayName("회원 정지는 기간·정규화된 사유와 같은 관리자의 90일 감사 기록을 남긴다")
    void memberSuspensionKeepsItsReasonAndAuditIdentity() throws Exception {
        Member member = Member.builder().id(7L).email("customer@example.test").role(Role.USER).build();
        when(memberRepository.findByIdAndDeletedAtIsNull(7L)).thenReturn(Optional.of(member));
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        new AdminSanctionService(memberRepository, storeRepository, service)
                .suspendMember(7L, 3, "  반복 위반  ");

        assertThat(member.getSuspendedUntil()).isBetween(started.plusDays(3),
                LocalDateTime.now(Clock.systemDefaultZone()).plusDays(3));
        assertThat(member.getSuspendReason()).isEqualTo("반복 위반");
        assertThat(member.isSuspended()).isTrue();
        assertThat(member.isDeleted()).isFalse();
        assertRecordedLog("MEMBER", 7L, "SUSPEND",
                Map.of("이메일", "customer@example.test", "사유", "3일 정지 / 반복 위반"), started, 90);
        verifyNoInteractions(storeRepository, auditCleanupWorker);
    }

    @Test
    @DisplayName("가게 정지는 행 잠금 조회 후 기간과 감사 기록을 남기며 가게를 삭제하지 않는다")
    void storeSuspensionLocksTheStoreAndPreservesItsRow() throws Exception {
        Store store = store();
        when(storeRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(store));
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        new AdminSanctionService(memberRepository, storeRepository, service)
                .suspendStore(3L, 2, " ");

        assertThat(store.getSuspendedUntil()).isBetween(started.plusDays(2),
                LocalDateTime.now(Clock.systemDefaultZone()).plusDays(2));
        assertThat(store.getSuspendReason()).isNull();
        assertThat(store.isSuspended()).isTrue();
        assertThat(store.isDeleted()).isFalse();
        assertRecordedLog("STORE", 3L, "SUSPEND",
                Map.of("가게명", "스냅샷 가게", "사유", "2일 영업정지"), started, 90);
        verify(storeRepository).findByIdForUpdate(3L);
        verifyNoInteractions(memberRepository, auditCleanupWorker);
    }

    @Test
    @DisplayName("휴지통 타입 조회는 현재 만료 기준과 페이지 조건을 저장소에 전달한다")
    void trashQueryPreservesTheExpiryCutoffAndPage() {
        PageRequest page = PageRequest.of(1, 5);
        Page<AuditLog> result = new PageImpl<>(List.of(), page, 0);
        when(auditLogRepository.findRestorableByType(eq(RESERVATION_TYPE), any(), eq(page)))
                .thenReturn(result);
        LocalDateTime started = LocalDateTime.now(Clock.systemDefaultZone());

        assertThat(service.getTrashItems("reservation", page)).isSameAs(result);

        ArgumentCaptor<LocalDateTime> cutoff = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(auditLogRepository).findRestorableByType(eq(RESERVATION_TYPE), cutoff.capture(), eq(page));
        assertThat(cutoff.getValue()).isBetween(started, LocalDateTime.now(Clock.systemDefaultZone()));
        verifyNoMoreInteractions(auditLogRepository);
        verifyNoInteractions(auditCleanupWorker);
    }

    private Store store() {
        return Store.builder().id(3L).name("스냅샷 가게").build();
    }

    private void assertReservationSnapshot(Long reservationId, LocalDateTime started) throws Exception {
        assertRecordedLog(RESERVATION_TYPE, reservationId, SOFT_DELETE_ACTION,
                Map.of("가게", "스냅샷 가게", "예약자", "예약 고객", "날짜", "2026-10-03", "상태", "CANCELLED"),
                started, 30);
    }

    private void assertRecordedLog(String entityType, Long entityId, String action,
                                   Map<String, String> expectedSnapshot, LocalDateTime started,
                                   int retentionDays) throws Exception {
        ArgumentCaptor<AuditLog> saved = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(saved.capture());
        AuditLog log = saved.getValue();
        assertThat(log.getEntityType()).isEqualTo(entityType);
        assertThat(log.getEntityId()).isEqualTo(entityId);
        assertThat(log.getAction()).isEqualTo(action);
        assertThat(log.getActorEmail()).isEqualTo(ACTOR_EMAIL);
        assertThat(log.getExpiresAt()).isBetween(started.plusDays(retentionDays),
                LocalDateTime.now(Clock.systemDefaultZone()).plusDays(retentionDays));
        Map<String, String> snapshot = objectMapper.readValue(log.getSnapshot(), new TypeReference<>() {});
        assertThat(snapshot).containsExactlyInAnyOrderEntriesOf(expectedSnapshot);
    }
}
