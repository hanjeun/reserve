package kr.it.reserve.config;

import jakarta.persistence.EntityManagerFactory;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.service.RefreshRejectedException;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

/** 실제 JPA·H2의 저장과 거부 커밋을 확인한다. InnoDB 잠금은 별도 MySQL 시험의 범위다. */
@SpringBootTest
class RefreshRotationPersistenceTest {
    @Autowired private TokenService tokenService;
    @Autowired private TokenProvider tokenProvider;
    @Autowired private RefreshTokenRepository refreshTokenRepository;
    @Autowired private MemberRepository memberRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private EntityManagerFactory entityManagerFactory;
    @Autowired private kr.it.reserve.member.mfa.MfaAccountRepository mfaAccounts;
    protected Member member;
    @BeforeEach void setUp() {
        member = memberRepository.save(Member.builder().name("회전 통합")
                .email("rotation-" + UUID.randomUUID() + "@example.test").password("synthetic-test-hash")
                .provider(AuthProvider.LOCAL).role(Role.USER).build());
    }
    @AfterEach void tearDown() {
        refreshTokenRepository.deleteAll(refreshTokenRepository.findByMemberId(member.getId()));
        memberRepository.deleteById(member.getId());
    }
    @Test void authenticationUsesOneStatementAndImmediatelyObservesDeviceRevocation() {
        var issued = tokenProvider.issueSession(member, null);
        jdbcTemplate.update("UPDATE member SET role = 'ADMIN' WHERE member_id = ?", member.getId());
        var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean previouslyEnabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        try {
            long before = statistics.getPrepareStatementCount();
            var verified = tokenProvider.verifyAuthentication(issued.accessToken());
            assertThat(verified.member().getId()).isEqualTo(member.getId());
            assertThat(verified.member().getRole()).isEqualTo(Role.ADMIN);
            assertThat(statistics.getPrepareStatementCount() - before).isEqualTo(1);

            tokenService.revoke(issued.refreshToken());
            long afterRevocation = statistics.getPrepareStatementCount();
            assertThat(tokenProvider.validToken(issued.accessToken())).isTrue();
            assertThatThrownBy(() -> tokenProvider.verifyAuthentication(issued.accessToken())).isInstanceOf(AuthException.class);
            assertThat(statistics.getPrepareStatementCount() - afterRevocation).isEqualTo(1);
        } finally {
            statistics.setStatisticsEnabled(previouslyEnabled);
        }
    }
    @Test void aSignedSidCannotAuthenticateWhenItsDatabaseOwnerIsAnotherMember() {
        var issued = tokenProvider.issueSession(member, null);
        Long sessionId = refreshTokenRepository.findByMemberId(member.getId()).getFirst().getId();
        Member other = memberRepository.saveAndFlush(Member.builder().name("다른 세션 회원")
                .email("sid-owner-" + UUID.randomUUID() + "@example.test").password("synthetic-test-hash")
                .provider(AuthProvider.LOCAL).role(Role.USER).build());
        try {
            jdbcTemplate.update("UPDATE login_session SET member_id = ? WHERE id = ?", other.getId(), sessionId);
            assertThat(tokenProvider.validToken(issued.accessToken())).isTrue();
            assertThatThrownBy(() -> tokenProvider.verifyAuthentication(issued.accessToken())).isInstanceOf(AuthException.class);
        } finally {
            refreshTokenRepository.deleteById(sessionId);
            memberRepository.deleteById(other.getId());
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"ADMIN", "BUSINESS", "USER"})
    void enrolledMfaIsObservedInTheSameAuthenticationQueryAndOnlyRequiredForAdmin(Role role) {
        var issued = tokenProvider.issueSession(member, null);
        var account = new kr.it.reserve.member.mfa.MfaAccount(member.getId(), LocalDateTime.now());
        account.enable(); mfaAccounts.saveAndFlush(account);
        jdbcTemplate.update("UPDATE member SET role = ? WHERE member_id = ?", role.name(), member.getId());
        var statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean enabled = statistics.isStatisticsEnabled(); statistics.setStatisticsEnabled(true);
        try {
            long before = statistics.getPrepareStatementCount();
            if (role == Role.ADMIN) {
                assertThatThrownBy(() -> tokenProvider.verifyAuthentication(issued.accessToken())).isInstanceOf(AuthException.class);
            } else {
                assertThat(tokenProvider.verifyAuthentication(issued.accessToken()).member().getRole()).isEqualTo(role);
            }
            assertThat(statistics.getPrepareStatementCount() - before).isEqualTo(1);
        } finally {
            statistics.setStatisticsEnabled(enabled); mfaAccounts.deleteById(member.getId());
        }
    }
    @Test void rotationGraceAndReuseRevocationAreCommittedWithoutRawTokenStorage() {
        var first = tokenProvider.issueSession(member, null);
        var current = tokenService.refresh(first.refreshToken());
        RefreshToken row = refreshTokenRepository.findByMemberId(member.getId()).getFirst();
        assertThat(row.getRefreshTokenHash()).isEqualTo(RefreshToken.hash(current.refreshToken()));
        assertThat(row.getPreviousTokenHash()).isEqualTo(RefreshToken.hash(first.refreshToken()));
        assertThat(row.getRotationVersion()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForMap("SELECT * FROM login_session WHERE id = ?", row.getId()).values().toString())
                .doesNotContain(first.refreshToken(), current.refreshToken());
        assertThat(tokenService.refresh(first.refreshToken()).refreshToken()).isEqualTo(current.refreshToken());

        jdbcTemplate.update("UPDATE login_session SET rotated_at = ? WHERE id = ?",
                Timestamp.valueOf(row.getRotatedAt().minusMinutes(5)), row.getId());
        assertThatThrownBy(() -> tokenService.refresh(first.refreshToken()))
                .isInstanceOf(RefreshRejectedException.class)
                .extracting(error -> ((RefreshRejectedException) error).getReason())
                .isEqualTo(RefreshRejectedException.Reason.REUSED_TOKEN);
        assertThat(refreshTokenRepository.findById(row.getId())).isEmpty();
        assertThatThrownBy(() -> tokenProvider.getActiveMemberFromToken(current.accessToken())).isInstanceOf(AuthException.class);
    }
    @Test void logoutOfAnOlderGenerationRevokesOnlyThatDeviceImmediately() {
        var first = tokenProvider.issueSession(member, null);
        var other = tokenProvider.issueSession(member, null);
        var next = tokenService.refresh(first.refreshToken());
        tokenService.refresh(next.refreshToken());
        tokenService.revoke(first.refreshToken());
        assertThatThrownBy(() -> tokenProvider.getActiveMemberFromToken(first.accessToken())).isInstanceOf(AuthException.class);
        assertThat(tokenProvider.getActiveMemberFromToken(other.accessToken()).getId()).isEqualTo(member.getId());
        assertThat(refreshTokenRepository.findByMemberId(member.getId())).hasSize(1);
    }
    @Test void aTokenTwoGenerationsOldRevokesTheCurrentFamilyAndCommitsTheDeletion() {
        var first = tokenProvider.issueSession(member, null);
        var second = tokenService.refresh(first.refreshToken());
        var third = tokenService.refresh(second.refreshToken());
        assertThatThrownBy(() -> tokenService.refresh(first.refreshToken())).isInstanceOf(RefreshRejectedException.class)
                .extracting(error -> ((RefreshRejectedException) error).getReason())
                .isEqualTo(RefreshRejectedException.Reason.REUSED_TOKEN);
        assertThat(refreshTokenRepository.findByMemberId(member.getId())).isEmpty();
        assertThatThrownBy(() -> tokenProvider.getActiveMemberFromToken(third.accessToken())).isInstanceOf(AuthException.class);
    }
    @Test void providerProofWithNanosecondsIsCanonicalizedBeforeDatabaseRoundTripAndRefresh() {
        LocalDateTime original = LocalDateTime.now(ZoneOffset.UTC).withNano(123_456_789);
        LocalDateTime canonical = original.withNano(123_000_000);
        member.setProvider(AuthProvider.GOOGLE); member.setProviderId("synthetic-" + UUID.randomUUID());
        member.setOauthAuthenticatedAt(original);
        member = memberRepository.saveAndFlush(member);
        var first = tokenProvider.issueSession(member, original);
        RefreshToken row = refreshTokenRepository.findByMemberId(member.getId()).getFirst();
        assertThat(row.getOauthAuthenticatedAt()).isEqualTo(canonical);
        assertThat(tokenProvider.getOAuthAuthenticationAt(first.accessToken())).isEqualTo(canonical);
        assertThat(tokenProvider.getActiveMemberFromToken(first.accessToken()).getId()).isEqualTo(member.getId());
        var current = tokenService.refresh(first.refreshToken());
        assertThat(tokenProvider.getOAuthAuthenticationAt(current.accessToken())).isEqualTo(canonical);
        assertThat(tokenService.refresh(first.refreshToken()).refreshToken()).isEqualTo(current.refreshToken());
        assertThat(tokenProvider.getActiveMemberFromToken(current.accessToken()).getId()).isEqualTo(member.getId());
    }
}
