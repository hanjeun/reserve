package com.reserve.config.oauth2;

import com.reserve.member.entity.AuthProvider;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.Role;
import com.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * OAuth2 로그인 성공 시 사용자 정보를 처리하는 서비스
 * 주의: 네이버의 경우 이메일이 '연락처 이메일'로 고유하지 않을 수 있습니다.
 * 따라서 provider + providerId를 기본 식별자로 사용합니다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final MemberRepository memberRepository;

    @Override
    @Transactional
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        OAuth2User oAuth2User = super.loadUser(userRequest);

        // 1. OAuth2 제공자 확인 (google, naver, kakao)
        String registrationId = userRequest.getClientRegistration().getRegistrationId();
        AuthProvider provider = AuthProvider.valueOf(registrationId.toUpperCase());

        // 2. OAuth Access Token 추출 (연동 해제용으로 저장)
        String accessToken = userRequest.getAccessToken().getTokenValue();

        // 3. 사용자 정보 추출
        String userNameAttributeName = userRequest.getClientRegistration()
                .getProviderDetails()
                .getUserInfoEndpoint()
                .getUserNameAttributeName();

        OAuth2UserInfo userInfo = OAuth2UserInfoFactory.getOAuth2UserInfo(
                provider,
                oAuth2User.getAttributes()
        );

        log.info("OAuth2 로그인 - Provider: {}, ProviderId: {}, Email: {}, Name: {}",
                provider, userInfo.getProviderId(), userInfo.getEmail(), userInfo.getName());

        // 4. 회원 조회 또는 생성 (Access Token도 함께 저장)
        boolean isNewUser = false;
        Member member = processOAuth2User(provider, userInfo, accessToken);
        // 약관 미동의 신규 유저 체크
        if (!member.isTermsAgreed()) isNewUser = true;

        return new CustomOAuth2User(member, oAuth2User.getAttributes(), userNameAttributeName, isNewUser);
    }

    /**
     * OAuth2 사용자 정보로 회원 조회 또는 생성
     * 식별 우선순위:
     * 1. provider + providerId (가장 신뢰성 높음)
     * 2. 이메일 (LOCAL 회원 연결용, 단 같은 provider가 아닌 경우 주의)
     */
    private Member processOAuth2User(AuthProvider provider, OAuth2UserInfo userInfo, String accessToken) {
        // 1순위: provider + providerId로 기존 회원 조회 (가장 정확한 방법)
        Optional<Member> existingMember = memberRepository.findByProviderAndProviderId(
                provider,
                userInfo.getProviderId()
        );

        if (existingMember.isPresent()) {
            // 기존 OAuth 회원: 정보 업데이트
            log.info("Existing OAuth2 member login: email={}, provider={}", userInfo.getEmail(), provider);
            return updateExistingMember(existingMember.get(), userInfo, accessToken);
        }

        // 2순위: 이메일로 기존 회원 조회
        String email = userInfo.getEmail();
        if (email != null && !email.isEmpty()) {
            Optional<Member> memberByEmail = memberRepository.findByEmail(email);

            if (memberByEmail.isPresent()) {
                Member member = memberByEmail.get();

                // 이미 다른 OAuth 제공자로 가입한 경우 → 에러
                if (member.getProvider() != null && member.getProvider() != AuthProvider.LOCAL) {
                    log.warn("Email already registered with different OAuth provider: email={}, existing={}, attempted={}",
                            email, member.getProvider(), provider);
                    String msg = "이미 " + member.getProvider().name() + " 계정으로 가입된 이메일입니다. "
                            + member.getProvider().name() + " 로그인을 이용해주세요.";
                    throw new OAuth2AuthenticationException(
                            new org.springframework.security.oauth2.core.OAuth2Error("email_conflict"), msg
                    );
                }

                // LOCAL 회원인 경우 → 에러 (자동 연결 안 함)
                if (member.getProvider() == null || member.getProvider() == AuthProvider.LOCAL) {
                    log.warn("Email already registered: email={}, attempted provider={}", email, provider);
                    String msg = "이미 이메일로 가입된 계정이 있습니다. 기존 계정으로 로그인해주세요.";
                    throw new OAuth2AuthenticationException(
                            new org.springframework.security.oauth2.core.OAuth2Error("email_conflict"), msg
                    );
                }
            }
        }

        // 3순위: 신규 회원 생성
        log.info("New OAuth2 member registered: email={}, provider={}", email, provider);
        return createNewMember(provider, userInfo, accessToken);
    }

    /**
     * 기존 회원 정보 업데이트
     */
    private Member updateExistingMember(Member member, OAuth2UserInfo userInfo, String accessToken) {
        // 엔티티에 정의된 메서드 호출 (이름과 프로필 이미지 업데이트)
        member.updateOAuth(userInfo.getName(), userInfo.getProfileImage());

        // 이메일 변경 처리 로직 (이메일은 특수한 경우이므로 별도 처리)
        if (userInfo.getEmail() != null && !userInfo.getEmail().equals(member.getEmail())) {
            Optional<Member> existingEmail = memberRepository.findByEmail(userInfo.getEmail());
            if (existingEmail.isEmpty()) {
                member.setEmail(userInfo.getEmail());
            }
        }

        // Access Token 업데이트
        member.setOauthAccessToken(accessToken);

        return memberRepository.save(member);
    }

    /**
     * 신규 회원 생성
     */
    // CustomOAuth2UserService.java 일부
    private Member createNewMember(AuthProvider provider, OAuth2UserInfo userInfo, String accessToken) {
        String email = userInfo.getEmail();

        // 중복 체크 및 이메일 생성 로직
        if (email == null || memberRepository.findByEmail(email).isPresent()) {
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
