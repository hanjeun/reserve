package kr.it.reserve.member.service;

import kr.it.reserve.business.repository.BusinessVerificationRepository;
import kr.it.reserve.community.repository.CommunityCommentRepository;
import kr.it.reserve.community.repository.CommunityPostRepository;
import kr.it.reserve.community.repository.PostLikeRepository;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.oauth2.OAuthUnlinkService;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import kr.it.reserve.notice.repository.NoticeRepository;
import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.favorite.repository.FavoriteRepository;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.dto.MemberDto;
import kr.it.reserve.member.dto.LocationUpdateRequest;
import kr.it.reserve.member.dto.MemberResponse;
import kr.it.reserve.member.dto.MemberUpdateRequest;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.review.repository.ReviewRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.file.util.FileStoragePaths;
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
    private final PwnedPasswordChecker pwnedPasswordChecker;

    /**
     * 유출 비밀번호 거부 문구. 회원가입·비밀번호 변경에서 같은 문구를 쓴다.
     * "몇 번 유출됐는지"는 알려주지 않는다 — 사용자가 할 수 있는 행동이 바뀌지 않는데
     * 숫자만 크면 불안만 준다.
     */
    private static final String PWNED_PASSWORD_MESSAGE =
            "다른 사이트에서 유출된 적이 있는 비밀번호입니다. 다른 비밀번호를 사용해주세요.";

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

        // 유출 리스트 검사는 마지막에 둔다 — 이메일 중복·인증처럼 서버 안에서 끝나는 검증을
        // 먼저 통과시켜야, 어차피 거절될 요청에 외부 API 호출을 낭비하지 않는다.
        if (pwnedPasswordChecker.isPwned(memberDto.getPassword())) {
            throw new MemberException(PWNED_PASSWORD_MESSAGE, HttpStatus.BAD_REQUEST);
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

    /**
     * 이메일로 회원을 찾되 <b>없으면 예외 대신 null</b>을 반환한다.
     *
     * <p>로그인처럼 "계정이 없다"는 사실 자체를 응답으로 드러내면 안 되는 경로에서 쓴다.
     * {@link #findByEmail}은 미존재 시 404 {@code 회원을 찾을 수 없습니다.}를 던지는데,
     * 로그인에서 그걸 쓰면 비밀번호를 모르는 사람도 이메일만 넣어보고 가입 여부를 확정할 수 있다
     * (user enumeration). 호출측이 존재/부재를 구분하지 않고 같은 응답을 내도록 null 을 준다.
     *
     * @return 회원 또는 {@code null}
     */
    public Member findByEmailOrNull(String email) {
        return memberRepository.findByEmail(email).orElse(null);
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
            if (pwnedPasswordChecker.isPwned(request.getPassword())) {
                throw new MemberException(PWNED_PASSWORD_MESSAGE, HttpStatus.BAD_REQUEST);
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
     * 위치 기반 거리순 정렬용 좌표 등록/수정.
     * 브라우저 Geolocation 거부·인앱 브라우저 미지원 시 사용자가 마이페이지에서
     * 주소 검색으로 직접 등록하는 폴백 경로 — StoreForm의 AddressSearch와 동일한
     * Kakao 주소 검색 결과(latitude/longitude)를 그대로 저장.
     */
    @Transactional
    /**
     * 마이페이지 위치 등록.
     *
     * 2026-07 전수조사: 예전엔 좌표(latitude/longitude)만 저장했다. 저장 자체는 잘 동작했지만
     * (거리순 정렬/우리동네 배지 모두 정상), 좌표로 주소를 역산할 수는 없으니 위치 탭을 다시 열면
     * 화면이 항상 빈 상태로 보여서 사용자 입장에선 "저장이 안 됐다"고 느껴졌다.
     * → AddressSearch가 다루는 3종(도로명/우편번호/상세주소)을 Store와 동일하게 모두 보관한다.
     *
     * 각 주소 필드는 null/blank면 기존 값을 덮어쓰지 않는다 — 좌표만 넘기는 호출
     * (브라우저 Geolocation 기반 등)이 기존에 등록해둔 주소를 지워버리면 안 되기 때문.
     */
    public MemberResponse updateLocation(Long memberId, LocationUpdateRequest request) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(MemberException::notFound);

        member.setLatitude(request.getLatitude());
        member.setLongitude(request.getLongitude());

        if (hasText(request.getAddress()))       member.setLocationAddress(request.getAddress());
        if (hasText(request.getZipCode()))       member.setLocationZipCode(request.getZipCode());
        if (hasText(request.getAddressDetail())) member.setLocationAddressDetail(request.getAddressDetail());

        return MemberResponse.fromEntity(memberRepository.save(member));
    }

    private boolean hasText(String s) {
        return s != null && !s.isBlank();
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
