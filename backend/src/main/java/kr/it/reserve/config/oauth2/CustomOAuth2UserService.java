package kr.it.reserve.config.oauth2;

import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.List;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/**
 * 연락처 이메일은 고유 식별자가 아닐 수 있어 provider + providerId로 회원을 식별한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final MemberRepository memberRepository;
    private final OAuthSubjectSecurityService subjectSecurity;
    @org.springframework.beans.factory.annotation.Autowired
    private kr.it.reserve.member.service.LoginMethodService loginMethods;

    @Override
    @Transactional
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        Instant tokenIssuedAt = userRequest.getAccessToken().getIssuedAt();
        LocalDateTime authenticatedAt = tokenIssuedAt == null ? null
                : LocalDateTime.ofInstant(tokenIssuedAt.truncatedTo(ChronoUnit.MILLIS), ZoneOffset.UTC);
        subjectSecurity.requireFreshAuthentication(authenticatedAt, userRequest.getAccessToken().getExpiresAt());
        OAuth2User oAuth2User = super.loadUser(userRequest);

        String registrationId = userRequest.getClientRegistration().getRegistrationId();
        AuthProvider provider = AuthProvider.valueOf(registrationId.toUpperCase());

        // 연동 해제에 사용할 제공자 토큰을 보관한다.
        String accessToken = userRequest.getAccessToken().getTokenValue();

        String userNameAttributeName = userRequest.getClientRegistration()
                .getProviderDetails()
                .getUserInfoEndpoint()
                .getUserNameAttributeName();

        OAuth2UserInfo userInfo = OAuth2UserInfoFactory.getOAuth2UserInfo(
                provider,
                oAuth2User.getAttributes()
        );

        log.info("OAuth2 user info received: provider={}", provider);

        boolean isNewUser = false;
        var attributes = org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        Member managed = null;
        if (loginMethods != null && attributes instanceof org.springframework.web.context.request.ServletRequestAttributes servlet) {
            try {
                managed = loginMethods.completeOAuth(servlet.getRequest(), provider, userInfo, accessToken,
                        authenticatedAt, userRequest.getAccessToken().getExpiresAt());
            } catch (kr.it.reserve.global.error.BusinessException | IllegalArgumentException exception) {
                throw new OAuth2AuthenticationException("login_method_expired");
            }
        }
        Member member = managed != null ? managed : processOAuth2User(provider, userInfo, accessToken, authenticatedAt,
                userRequest.getAccessToken().getExpiresAt());
        if (!member.isTermsAgreed()) isNewUser = true;

        return new CustomOAuth2User(member, oAuth2User.getAttributes(), userNameAttributeName, isNewUser,
                userRequest.getAccessToken().getExpiresAt(), managed != null);
    }

    /** 제공자 subject로 회원을 식별하고 이메일 중복은 자동 연결 없이 거절한다. */
    private Member processOAuth2User(AuthProvider provider, OAuth2UserInfo userInfo, String accessToken,
            LocalDateTime authenticatedAt, Instant tokenExpiresAt) {
        OAuthSubjectSecurity subject;
        try {
            subject = subjectSecurity.lock(provider, userInfo.getProviderId());
        } catch (IllegalArgumentException exception) {
            throw new OAuth2AuthenticationException("invalid_user");
        }
        subjectSecurity.requireFreshAuthentication(authenticatedAt, tokenExpiresAt);
        List<Long> existingMemberIds = memberRepository.findActiveIdsByProviderAndProviderIdForUpdate(
                provider.name(),
                userInfo.getProviderId()
        );

        if (!existingMemberIds.isEmpty()) {
            if (existingMemberIds.size() != 1) throw new OAuth2AuthenticationException("invalid_user");
            log.info("Existing OAuth2 member login: memberId={}, provider={}",
                    existingMemberIds.getFirst(), provider);
            Member member = updateExistingMember(existingMemberIds.getFirst(), provider, userInfo, accessToken,
                    authenticatedAt, subject);
            return completeAuthentication(subject, member, authenticatedAt, tokenExpiresAt);
        }

        if (!subject.acceptsAuthentication(authenticatedAt)) {
            throw new OAuth2AuthenticationException("oauth_reauthentication_required");
        }

        String email = userInfo.getEmail();
        if (email != null && !email.isEmpty()) {
            Optional<Member> memberByEmail = memberRepository.findByEmailAndDeletedAtIsNull(email);

            if (memberByEmail.isPresent()) {
                Member member = memberByEmail.get();

                // 이미 다른 OAuth 제공자로 가입한 경우 → 에러
                if (member.getProvider() != null && member.getProvider() != AuthProvider.LOCAL) {
                    log.warn("OAuth2 email conflict: existingProvider={}, attemptedProvider={}",
                            member.getProvider(), provider);
                    String msg = "이미 " + member.getProvider().name() + " 계정으로 가입된 이메일이에요. "
                            + member.getProvider().name() + " 로그인을 이용해주세요.";
                    throw new OAuth2AuthenticationException(
                            new org.springframework.security.oauth2.core.OAuth2Error("email_conflict"), msg
                    );
                }

                // LOCAL 회원인 경우 → 에러 (자동 연결 안 함)
                if (member.getProvider() == null || member.getProvider() == AuthProvider.LOCAL) {
                    log.warn("OAuth2 email conflict with local account: attemptedProvider={}", provider);
                    String msg = "이미 이메일로 가입된 계정이 있어요. 기존 계정으로 로그인해주세요.";
                    throw new OAuth2AuthenticationException(
                            new org.springframework.security.oauth2.core.OAuth2Error("email_conflict"), msg
                    );
                }
            }
        }

        Member created = createNewMember(provider, userInfo, accessToken, authenticatedAt);
        log.info("New OAuth2 member registered: memberId={}, provider={}", created.getId(), provider);
        return completeAuthentication(subject, created, authenticatedAt, tokenExpiresAt);
    }

    private Member completeAuthentication(OAuthSubjectSecurity subject, Member member,
            LocalDateTime authenticatedAt, Instant tokenExpiresAt) {
        // INSERT/이메일 unique 잠금 대기도 마친 뒤 실제 커밋 직전에 시간 경계를 재확인한다.
        memberRepository.flush();
        subjectSecurity.requireFreshAuthentication(authenticatedAt, tokenExpiresAt);
        subject.authenticated(authenticatedAt, subjectSecurity.now());
        return member;
    }

    /**
     * 기존 회원 정보 업데이트
     */
    private Member updateExistingMember(Long memberId, AuthProvider provider, OAuth2UserInfo userInfo, String accessToken,
            LocalDateTime authenticatedAt, OAuthSubjectSecurity subject) {
        // 탈퇴와 소셜 재로그인의 프로필/토큰 갱신을 같은 회원 행에서 직렬화한다.
        Member member = memberRepository.findActiveByIdForUpdate(memberId)
                .orElseThrow(() -> new OAuth2AuthenticationException("invalid_user"));
        if (member.isAccountProtected()) throw new OAuth2AuthenticationException("account_protected");
        if (member.getProvider() != provider || !userInfo.getProviderId().equals(member.getProviderId())) {
            throw new OAuth2AuthenticationException("invalid_user");
        }
        subject.mergeMemberState(member.getOauthAuthenticatedAt(), member.getOauthSecurityRevokedAt());
        if (!member.acceptsOAuthAuthentication(authenticatedAt) || !subject.acceptsAuthentication(authenticatedAt)) {
            throw new OAuth2AuthenticationException("oauth_reauthentication_required");
        }

        if (!member.isLoginMethodsManaged()) member.updateOAuth(userInfo.getName(), userInfo.getProfileImage());

        // 이메일 변경 처리 로직 (이메일은 특수한 경우이므로 별도 처리)
        if (!member.isLoginMethodsManaged() && userInfo.getEmail() != null && !userInfo.getEmail().equals(member.getEmail())) {
            Optional<Member> existingEmail = memberRepository.findByEmailAndDeletedAtIsNull(userInfo.getEmail());
            if (existingEmail.isEmpty()) {
                member.setEmail(userInfo.getEmail());
            }
        }

        // Access Token 업데이트
        member.setOauthAccessToken(accessToken);
        member.setOauthAuthenticatedAt(authenticatedAt);

        return memberRepository.save(member);
    }

    /**
     * 신규 회원 생성
     */
    // CustomOAuth2UserService.java 일부
    private Member createNewMember(AuthProvider provider, OAuth2UserInfo userInfo, String accessToken,
            LocalDateTime authenticatedAt) {
        String email = userInfo.getEmail();

        // 중복 체크 및 이메일 생성 로직
        if (email == null || memberRepository.findByEmailAndDeletedAtIsNull(email).isPresent()) {
            email = generateUniqueEmail(provider, userInfo.getProviderId());
        }

        // Builder 내부에 도메인 규칙 적용
        return memberRepository.save(Member.builder()
                .email(email)
                .name(userInfo.getName() != null ? userInfo.getName() : "사용자")
                .profileImage(userInfo.getProfileImage())
                .provider(provider)
                .providerId(userInfo.getProviderId())
                .oauthAccessToken(accessToken)
                .oauthAuthenticatedAt(authenticatedAt)
                .role(Role.USER)
                .build());
    }

    /**
     * 고유한 이메일 주소 생성
     * 이메일이 없거나 중복인 경우 사용
     */
    private String generateUniqueEmail(AuthProvider provider, String providerId) {
        return provider.name().toLowerCase() + "_" + providerId + "@" + provider.name().toLowerCase() + ".local";
    }
}
