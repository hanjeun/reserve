package kr.it.reserve.business.service;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.business.dto.BusinessVerificationRequest;
import kr.it.reserve.business.dto.BusinessVerificationResponse;
import kr.it.reserve.business.entity.BusinessVerification;
import kr.it.reserve.business.entity.BusinessVerification.VerificationStatus;
import kr.it.reserve.business.repository.BusinessVerificationRepository;
import kr.it.reserve.global.error.BizVerificationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BusinessVerificationService {

    private final BusinessVerificationRepository verificationRepository;
    private final MemberRepository memberRepository;
    private final FileStorageService fileStorageService;
    private final EmailService emailService;
    private final AuditLogService auditLogService;

    /**
     * 사업자 인증 신청
     */
    @Transactional
    public BusinessVerificationResponse submitVerification(Member member, BusinessVerificationRequest request) {
        // 1. 이미 사업자인지 확인
        if (member.getRole() == Role.BUSINESS) {
            throw new BizVerificationException("이미 사업자로 등록되어 있습니다.");
        }

        // 2. 이미 대기중인 요청이 있는지 확인 (id만 사용)
        if (verificationRepository.existsByMemberIdAndStatus(member.getId(), VerificationStatus.PENDING)) {
            throw new BizVerificationException("이미 대기 중인 사업자 인증 요청이 있습니다.");
        }

        // 3. 파일 유효성 검사
        validateSubmitRequest(request);

        // 4. 이미지 저장 (파일이 아닌 key를 DB에 저장 → 조회 시 Pre-signed URL 생성)
        String licenseImageKey = fileStorageService.storeFile(request.getLicenseImage(), FileStoragePaths.business(member.getId()));

        // 5. 인증 요청 생성
        BusinessVerification verification = BusinessVerification.builder()
                .member(member)
                .licenseImageKey(licenseImageKey)
                .businessName(request.getBusinessName().trim())
                .businessNumber(request.getBusinessNumber())
                .memo(request.getMemo())
                .status(VerificationStatus.PENDING)
                .build();

        log.info("Business verification submitted: memberId={}", member.getId());
        return BusinessVerificationResponse.fromEntity(verificationRepository.save(verification));
    }

    /**
     * 사업자 인증 승인 (관리자용)
     */
    @Transactional
    public BusinessVerificationResponse approveVerification(Long verificationId, Member admin) {
        BusinessVerification verification = findVerificationOrThrow(verificationId);

        if (verification.getStatus() != VerificationStatus.PENDING) {
            throw new BizVerificationException("심사 대기 상태인 요청만 승인할 수 있습니다.");
        }

        // 인증 승인 처리 (엔티티 메서드 활용)
        verification.approve(admin);

        // 회원 권한을 BUSINESS로 변경
        Member member = verification.getMember();
        member.setRole(Role.BUSINESS);
        memberRepository.save(member);

        // 승인 이메일 발송 (비동기)
        emailService.sendBusinessApprovedEmail(
            member.getEmail(),
            member.getName(),
            verification.getBusinessName()
        );

        log.info("Business verification approved: verificationId={}, memberId={}", verificationId, member.getId());
        auditLogService.logBusinessVerification(member.getId(), member.getEmail(), "APPROVED", verification.getBusinessName());
        return BusinessVerificationResponse.fromEntity(verification);
    }

    /**
     * 사업자 인증 거절 (관리자용)
     */
    @Transactional
    public BusinessVerificationResponse rejectVerification(Long verificationId, Member admin, String reason) {
        if (reason == null || reason.trim().isEmpty()) {
            throw new BizVerificationException("반려 사유를 입력해주세요.");
        }

        BusinessVerification verification = findVerificationOrThrow(verificationId);

        if (verification.getStatus() != VerificationStatus.PENDING) {
            throw new BizVerificationException("심사 대기 상태인 요청만 거절할 수 있습니다.");
        }

        // 인증 거절 처리 (엔티티 메서드 활용)
        verification.reject(admin, reason.trim());

        // 거절 이메일 발송 (비동기)
        Member member = verification.getMember();
        emailService.sendBusinessRejectedEmail(
            member.getEmail(),
            member.getName(),
            verification.getBusinessName(),
            reason.trim()
        );

        log.info("Business verification rejected: verificationId={}, reason={}", verificationId, reason);
        auditLogService.logBusinessVerification(member.getId(), member.getEmail(), "REJECTED", reason.trim());
        return BusinessVerificationResponse.fromEntity(verification);
    }

    /**
     * 사업자 자격 취소 (관리자용)
     */
    @Transactional
    public void revokeBusinessRole(Long memberId, Member admin) {
        Member targetMember = memberRepository.findById(memberId)
                .orElseThrow(() -> new BizVerificationException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        if (targetMember.getRole() != Role.BUSINESS) {
            throw new BizVerificationException("해당 회원은 사업자 권한이 없습니다.");
        }

        // 권한 회수
        targetMember.setRole(Role.USER);
        memberRepository.save(targetMember);

        // 기존 승인된 인증을 거절(취소) 상태로 변경
        verificationRepository.findTopByMemberAndStatusOrderByCreatedAtDesc(targetMember, VerificationStatus.APPROVED)
                .ifPresent(v -> v.reject(admin, "관리자에 의해 사업자 자격이 취소되었습니다."));

        log.info("Business role revoked: memberId={}, adminId={}", memberId, admin.getId());
    }

    /**
     * 사업자 자격 포기 (사용자 본인)
     */
    @Transactional
    public void resignBusinessRole(Member member) {
        // thin Member 대신 DB에서 fresh 로드 후 수정 (null 덮어쓰기 방지)
        Member freshMember = memberRepository.findById(member.getId())
                .orElseThrow(() -> new BizVerificationException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));

        if (freshMember.getRole() != Role.BUSINESS) {
            throw new BizVerificationException("사업자 권한을 보유하고 있지 않습니다.");
        }

        freshMember.setRole(Role.USER);
        memberRepository.save(freshMember);

        log.info("Business role surrendered: memberId={}", freshMember.getId());
    }

    /**
     * 사업자 인증 신청 수정 (PENDING 상태일 때만 가능)
     */
    @Transactional
    public BusinessVerificationResponse updateVerification(Member member, BusinessVerificationRequest request) {
        BusinessVerification verification = verificationRepository.findTopByMemberIdOrderByCreatedAtDesc(member.getId())
                .orElseThrow(() -> new BizVerificationException("신청 내역이 없습니다.", HttpStatus.NOT_FOUND));

        if (verification.getStatus() != VerificationStatus.PENDING) {
            throw new BizVerificationException("심사 대기 중인 신청만 수정할 수 있습니다.");
        }

        // 텍스트 필드 업데이트
        if (request.getBusinessName() != null && !request.getBusinessName().isBlank()) {
            verification.setBusinessName(request.getBusinessName().trim());
        }
        if (request.getBusinessNumber() != null) {
            verification.setBusinessNumber(request.getBusinessNumber());
        }
        if (request.getMemo() != null) {
            verification.setMemo(request.getMemo());
        }

        // 이미지 변경 시 기존 S3 파일 삭제 후 새 파일 업로드
        if (request.getLicenseImage() != null && !request.getLicenseImage().isEmpty()) {
            fileStorageService.deleteFile(verification.getLicenseImageKey());
            String newKey = fileStorageService.storeFile(
                    request.getLicenseImage(), FileStoragePaths.business(member.getId()));
            verification.setLicenseImageKey(newKey);
        }

        log.info("Business verification updated: memberId={}", member.getId());
        return BusinessVerificationResponse.fromEntity(verificationRepository.save(verification));
    }

    /**
     * 사업자 인증 신청 취소 (사용자 본인)
     */
    @Transactional
    public void cancelVerification(Member member) {
        BusinessVerification verification = verificationRepository.findTopByMemberIdOrderByCreatedAtDesc(member.getId())
                .orElseThrow(() -> new BizVerificationException("신청 내역이 없습니다.", HttpStatus.NOT_FOUND));

        if (verification.getStatus() != VerificationStatus.PENDING) {
            throw new BizVerificationException("이미 처리가 완료된 신청은 취소할 수 없습니다.");
        }

        // S3 이미지 삭제 (취소 시 불필요한 파일 정리)
        fileStorageService.deleteFile(verification.getLicenseImageKey());

        verificationRepository.delete(verification);
        log.info("Business verification cancelled: memberId={}", member.getId());
    }

    // --- 단순 조회 메서드 ---

    public Optional<BusinessVerificationResponse> getMyVerificationStatus(Member member) {
        return verificationRepository.findTopByMemberIdOrderByCreatedAtDesc(member.getId())
                .map(BusinessVerificationResponse::fromEntity);
    }

    public Page<BusinessVerificationResponse> getPendingVerifications(Pageable pageable) {
        return verificationRepository.findByStatusOrderByCreatedAtDesc(VerificationStatus.PENDING, pageable)
                .map(BusinessVerificationResponse::fromEntity);
    }

    public Page<BusinessVerificationResponse> getAllVerifications(Pageable pageable) {
        return verificationRepository.findAllByOrderByCreatedAtDesc(pageable)
                .map(BusinessVerificationResponse::fromEntity);
    }

    public Page<BusinessVerificationResponse> getVerificationsByStatus(VerificationStatus status, Pageable pageable) {
        return verificationRepository.findByStatusOrderByCreatedAtDesc(status, pageable)
                .map(BusinessVerificationResponse::fromEntity);
    }

    public BusinessVerificationResponse getVerificationDetail(Long id) {
        BusinessVerification verification = findVerificationOrThrow(id);
        // 사업자 등록증 이미지: S3 key → 5분짜리 Pre-signed URL 발급
        String presignedUrl = fileStorageService.getPresignedUrl(verification.getLicenseImageKey(), 5);
        return BusinessVerificationResponse.fromEntityWithPresignedUrl(verification, presignedUrl);
    }

    public long getPendingCount() {
        return verificationRepository.countByStatus(VerificationStatus.PENDING);
    }

    // --- Helper Methods ---

    private BusinessVerification findVerificationOrThrow(Long id) {
        return verificationRepository.findById(id)
                .orElseThrow(() -> new BizVerificationException("해당 인증 요청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND));
    }

    private void validateSubmitRequest(BusinessVerificationRequest request) {
        if (request.getLicenseImage() == null || request.getLicenseImage().isEmpty()) {
            throw new BizVerificationException("사업자 등록증 이미지를 업로드해주세요.");
        }
        if (request.getBusinessName() == null || request.getBusinessName().isBlank()) {
            throw new BizVerificationException("상호명을 입력해주세요.");
        }
    }
}