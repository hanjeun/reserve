package com.reserve.member.service;

import com.reserve.business.repository.BusinessVerificationRepository;
import com.reserve.community.repository.CommunityCommentRepository;
import com.reserve.community.repository.CommunityPostRepository;
import com.reserve.community.repository.PostLikeRepository;
import com.reserve.config.jwt.entity.RefreshToken;
import com.reserve.config.jwt.repository.RefreshTokenRepository;
import com.reserve.config.oauth2.OAuthUnlinkService;
import com.reserve.inquiry.repository.InquiryRepository;
import com.reserve.notice.repository.NoticeRepository;
import com.reserve.email.service.EmailVerificationService;
import com.reserve.favorite.repository.FavoriteRepository;
import com.reserve.global.error.MemberException;
import com.reserve.member.dto.MemberDto;
import com.reserve.member.dto.MemberResponse;
import com.reserve.member.dto.MemberUpdateRequest;
import com.reserve.member.entity.AuthProvider;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.Role;
import com.reserve.member.repository.MemberRepository;
import com.reserve.promotion.repository.PromotionRepository;
import com.reserve.reservation.repository.ReservationRepository;
import com.reserve.review.repository.ReviewRepository;
import com.reserve.store.entity.Store;
import com.reserve.store.repository.StoreRepository;
import com.reserve.file.service.FileStorageService;
import com.reserve.file.util.FileStoragePaths;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Slf4j
@RequiredArgsConstructor
@Service
public class MemberService {

    private final MemberRepository memberRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder bCryptPasswordEncoder;
    private final EmailVerificationService emailVerificationService;
    private final OAuthUnlinkService oAuthUnlinkService;

    private final StoreRepository storeRepository;
    private final ReservationRepository reservationRepository;
    private final FavoriteRepository favoriteRepository;
    private final PromotionRepository promotionRepository;
    private final ReviewRepository reviewRepository;
    private final InquiryRepository inquiryRepository;
    private final CommunityPostRepository communityPostRepository;
    private final CommunityCommentRepository communityCommentRepository;
    private final PostLikeRepository postLikeRepository;
    private final NoticeRepository noticeRepository;
    private final FileStorageService fileStorageService;
    private final BusinessVerificationRepository businessVerificationRepository;

    @Transactional
    public Long join(MemberDto memberDto) {
        // 서버 측 필수 약관 동의 검증 (프론트 우회 방어)
        if (!memberDto.isTermsAgreed()) {
            throw new MemberException("필수 약관에 동의해주세요.", HttpStatus.BAD_REQUEST);
        }

        if (memberRepository.findByEmail(memberDto.getEmail()).isPresent()) {
            throw MemberException.conflict("이미 사용 중인 이메일입니다.");
        }

        if (!emailVerificationService.isEmailVerified(memberDto.getEmail())) {
            throw new MemberException("이메일 인증이 필요합니다.", HttpStatus.BAD_REQUEST);
        }

        return memberRepository.save(Member.builder()
                .name(memberDto.getName())
                .email(memberDto.getEmail())
                .password(bCryptPasswordEncoder.encode(memberDto.getPassword()))
                .role(memberDto.getRole())
                .provider(AuthProvider.LOCAL)
                .termsAgreed(true)
                .marketingAgreed(memberDto.isMarketingAgreed())
                .build()).getId();
    }

    public Member findById(Long id) {
        return memberRepository.findById(id)
                .orElseThrow(MemberException::notFound);
    }

    public MemberResponse getMemberResponse(Long id) {
        return MemberResponse.fromEntity(findById(id));
    }

    public Member findByEmail(String email) {
        return memberRepository.findByEmail(email)
                .orElseThrow(MemberException::notFound);
    }

    @Transactional
    public MemberResponse updateMember(Long memberId, MemberUpdateRequest request) {
        log.info("Member updated: memberId={}", memberId);
        Member member = findById(memberId);

        if (request.getName() != null && !request.getName().isEmpty()) {
            member.setName(request.getName());
        }

        if (request.getEmail() != null && !request.getEmail().isEmpty()) {
            if (!member.getEmail().equals(request.getEmail())) {
                if (memberRepository.findByEmail(request.getEmail()).isPresent()) {
                    throw new MemberException("이미 사용 중인 이메일입니다.", HttpStatus.CONFLICT);
                }
                member.setEmail(request.getEmail());
            }
        }

        if (request.getPassword() != null && !request.getPassword().isEmpty()) {
            if (member.isOAuthUser()) {
                throw new MemberException("소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.", HttpStatus.FORBIDDEN);
            }
            if (request.getPassword().length() < 8) {
                throw new MemberException("비밀번호는 8자 이상이어야 합니다.", HttpStatus.BAD_REQUEST);
            }
            if (!request.getPassword().equals(request.getPasswordConfirm())) {
                throw new MemberException("비밀번호가 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
            }
            member.setPassword(bCryptPasswordEncoder.encode(request.getPassword()));
        }

        if (request.getRole() != null && !request.getRole().isEmpty()) {
            try {
                Role newRole = Role.valueOf(request.getRole().toUpperCase());
                member.setRole(newRole);
            } catch (IllegalArgumentException e) {
                throw new MemberException("유효하지 않은 권한입니다: " + request.getRole(), HttpStatus.BAD_REQUEST);
            }
        }

        if (request.getEmailNotificationEnabled() != null) {
            member.setEmailNotificationEnabled(request.getEmailNotificationEnabled());
        }

        Member updated = memberRepository.save(member);
        log.info("Member update completed: memberId={}", memberId);

        return MemberResponse.fromEntity(updated);
    }

    @Transactional
    public MemberResponse deleteProfileImage(Long memberId) {
        log.info("Profile image deleted: memberId={}", memberId);
        Member member = findById(memberId);

        fileStorageService.deleteFile(member.getProfileImage());

        member.setProfileImage(null);
        member.setProfileImageLocked(true);
        Member updated = memberRepository.save(member);
        log.info("Profile image delete completed: memberId={}", memberId);
        return MemberResponse.fromEntity(updated);
    }

    @Transactional
    public MemberResponse updateProfileImage(Long memberId, MultipartFile image) {
        log.info("Profile image updated: memberId={}", memberId);
        Member member = findById(memberId);

        fileStorageService.deleteFile(member.getProfileImage());

        String key = fileStorageService.storeFile(image, FileStoragePaths.userProfile(memberId));
        member.setProfileImage(fileStorageService.getPublicUrl(key));
        member.setProfileImageLocked(true);
        Member updated = memberRepository.save(member);
        log.info("Profile image update completed: memberId={}", memberId);
        return MemberResponse.fromEntity(updated);
    }

    /**
     * 마케팅 수신 동의 토글 (선택 동의 — 가입 후 언제든 변경 가능).
     * PIPA 준수: 동의/철회 시각을 별도 로그 테이블에 남겨야 하지만
     * 현재는 단순 플래그 업데이트. 필요 시 AuditLog와 연동 예정.
     */
    @Transactional
    public MemberResponse updateMarketingConsent(Long memberId, boolean marketingAgreed) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(MemberException::notFound);
        member.setMarketingAgreed(marketingAgreed);
        return MemberResponse.fromEntity(memberRepository.save(member));
    }

    /**
     * 소셜 로그인 신규 가입 시 약관 동의 처리.
     * termsAgreed(필수)는 항상 true로 세팅, marketingAgreed(선택)는 사용자 선택값 반영.
     */
    @Transactional
    public void agreeTerms(Long memberId, boolean marketingAgreed) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new MemberException("회원을 찾을 수 없습니다."));
        member.setTermsAgreed(true);
        member.setMarketingAgreed(marketingAgreed);
    }

    @Transactional
    public void deleteMember(Long memberId) {
        log.info("Member deletion started: memberId={}", memberId);
        Member member = findById(memberId);

        if (member.isOAuthUser()) {
            log.info("OAuth unlink attempted");
            oAuthUnlinkService.unlinkOAuth(member);
        }

        List<Store> ownedStores = storeRepository.findByOwnerId(memberId);

        for (Store store : ownedStores) {
            Long storeId = store.getId();
            reviewRepository.deleteByStoreId(storeId);
            reservationRepository.deleteByStoreId(storeId);
            favoriteRepository.deleteByStoreId(storeId);
            promotionRepository.deleteByStoreId(storeId);

            if (store.getMainImageUrl() != null) {
                fileStorageService.deleteFile(store.getMainImageUrl());
            }
            store.getDetailImageList().forEach(fileStorageService::deleteFile);
        }

        storeRepository.deleteAll(ownedStores);

        reviewRepository.deleteByMemberId(memberId);
        reservationRepository.deleteByMemberId(memberId);
        favoriteRepository.deleteByMemberId(memberId);
        promotionRepository.deleteByMemberId(memberId);
        inquiryRepository.deleteByMemberId(memberId);

        List<Long> postIds = communityPostRepository.findPostIdsByAuthorId(memberId);
        if (!postIds.isEmpty()) {
            postLikeRepository.deleteByPostIds(postIds);
            communityCommentRepository.deleteByPostIds(postIds);
        }

        postLikeRepository.deleteByMemberId(memberId);
        communityCommentRepository.deleteByAuthorId(memberId);
        communityPostRepository.deleteByAuthorId(memberId);
        noticeRepository.deleteByAuthorId(memberId);
        businessVerificationRepository.deleteByMemberId(memberId);

        List<RefreshToken> tokens = refreshTokenRepository.findByMemberId(memberId);
        refreshTokenRepository.deleteAll(tokens);

        memberRepository.deleteById(memberId);
        log.info("Member deletion completed: memberId={}", memberId);
    }
}
