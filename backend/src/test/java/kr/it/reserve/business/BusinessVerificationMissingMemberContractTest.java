package kr.it.reserve.business;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.business.dto.BusinessVerificationRequest;
import kr.it.reserve.business.entity.BusinessVerification;
import kr.it.reserve.business.repository.BusinessVerificationRepository;
import kr.it.reserve.business.service.BusinessVerificationService;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.BizVerificationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessVerificationMissingMemberContractTest {

    private static final Long MEMBER_ID = 7L;
    private static final Long VERIFICATION_ID = 19L;

    @Mock private BusinessVerificationRepository verificationRepository;
    @Mock private MemberRepository memberRepository;
    @Mock private FileStorageService fileStorageService;
    @Mock private FileDeletionOutboxService fileDeletionOutboxService;
    @Mock private EmailService emailService;
    @Mock private AuditLogService auditLogService;

    @InjectMocks private BusinessVerificationService service;

    @ParameterizedTest(name = "{0}")
    @EnumSource(Operation.class)
    @DisplayName("회원이 사라진 사업자 업무는 같은 404를 반환하고 후속 업무를 실행하지 않는다")
    void missingActiveMemberStopsBusinessWork(Operation operation) {
        Member applicant = Member.builder().id(MEMBER_ID).role(Role.USER).build();
        Member admin = Member.builder().id(99L).build();
        BusinessVerificationRequest request = new BusinessVerificationRequest(
                new MockMultipartFile("licenseImage", "license.png", "image/png", new byte[]{1}),
                "계약 검사 가게", "123-45-67890", "회원 누락 검사");
        when(memberRepository.findActiveByIdForUpdate(MEMBER_ID)).thenReturn(Optional.empty());
        if (operation.reviewsExistingRequest()) {
            BusinessVerification verification = BusinessVerification.builder()
                    .id(VERIFICATION_ID)
                    .member(applicant)
                    .businessName("계약 검사 가게")
                    .status(BusinessVerification.VerificationStatus.PENDING)
                    .build();
            when(verificationRepository.findById(VERIFICATION_ID)).thenReturn(Optional.of(verification));
        }

        assertThatThrownBy(() -> operation.invoke(service, applicant, admin, request))
                .isInstanceOfSatisfying(BizVerificationException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(exception).hasMessage("회원을 찾을 수 없습니다.");
                });

        verify(memberRepository).findActiveByIdForUpdate(MEMBER_ID);
        verifyNoMoreInteractions(memberRepository);
        if (operation.reviewsExistingRequest()) {
            verify(verificationRepository).findById(VERIFICATION_ID);
            verifyNoMoreInteractions(verificationRepository);
        } else {
            verifyNoInteractions(verificationRepository);
        }
        verifyNoInteractions(fileStorageService, fileDeletionOutboxService, emailService, auditLogService);
        assertThat(applicant.getRole()).isEqualTo(Role.USER);
    }

    private enum Operation {
        SUBMIT, APPROVE, REJECT, REVOKE, RESIGN, UPDATE, CANCEL;

        boolean reviewsExistingRequest() {
            return this == APPROVE || this == REJECT;
        }

        void invoke(BusinessVerificationService target, Member applicant, Member admin,
                    BusinessVerificationRequest request) {
            switch (this) {
                case SUBMIT -> target.submitVerification(applicant, request);
                case APPROVE -> target.approveVerification(VERIFICATION_ID, admin);
                case REJECT -> target.rejectVerification(VERIFICATION_ID, admin, "서류를 다시 확인해주세요.");
                case REVOKE -> target.revokeBusinessRole(MEMBER_ID, admin);
                case RESIGN -> target.resignBusinessRole(applicant);
                case UPDATE -> target.updateVerification(applicant, request);
                case CANCEL -> target.cancelVerification(applicant);
            }
        }
    }
}
