package kr.it.reserve.config;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.service.RefreshRejectedException;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * refresh 회전을 실제 JPA·H2로 한 바퀴 돌린다. 단위 테스트(TokenServiceRefreshRotationTest)가 못 보는 두 가지를 본다.
 *  1) 새 JPQL(id 조회·FOR UPDATE)이 SQL로 실행되고, 회전 결과가 커밋된다.
 *  2) 재사용 거절(401) 뒤에도 그 기기 행 삭제가 롤백되지 않는다(noRollbackFor).
 * H2의 행 잠금은 InnoDB와 다르므로 동시성 자체의 보증은 아니다.
 */
@SpringBootTest
class RefreshRotationPersistenceTest {

    @Autowired private TokenService tokenService;
    @Autowired private TokenProvider tokenProvider;
    @Autowired private RefreshTokenRepository refreshTokenRepository;
    @Autowired private MemberRepository memberRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private Member member;

    @BeforeEach
    void setUp() {
        member = memberRepository.save(Member.builder()
                .name("회전 통합")
                .email("rotation-" + UUID.randomUUID() + "@example.test")
                .role(Role.USER)
                .build());
    }

    @AfterEach
    void tearDown() {
        refreshTokenRepository.deleteAll(refreshTokenRepository.findByMemberId(member.getId()));
        memberRepository.deleteById(member.getId());
    }

    @Test
    @DisplayName("회전 → 유예 안 직전 토큰 → 유예 뒤 직전 토큰(행 삭제가 커밋됨)")
    void rotationGraceAndReuseAreCommitted() {
        String first = tokenProvider.generateRefreshToken(member);

        TokenService.RefreshResult rotated = tokenService.refresh(first);
        RefreshToken row = refreshTokenRepository.findByMemberId(member.getId()).get(0);
        assertThat(row.getRefreshToken()).isEqualTo(rotated.refreshToken());
        assertThat(row.getPreviousTokenHash()).isEqualTo(RefreshToken.hash(first));
        assertThat(refreshTokenRepository.findIdsByPreviousTokenHash(RefreshToken.hash(first)))
                .containsExactly(row.getId());

        // 탭 두 개가 같은 토큰으로 거의 동시에 refresh — 두 번째는 현재 토큰을 받는다.
        assertThat(tokenService.refresh(first).refreshToken()).isEqualTo(rotated.refreshToken());

        // 유예가 지난 뒤 옛 토큰이 다시 오면 재사용으로 보고 그 기기 행을 지운다.
        jdbcTemplate.update("UPDATE refresh_token SET rotated_at = DATEADD('MINUTE', -5, CURRENT_TIMESTAMP) WHERE id = ?",
                row.getId());
        assertThatThrownBy(() -> tokenService.refresh(first))
                .isInstanceOf(RefreshRejectedException.class)
                .extracting(e -> ((RefreshRejectedException) e).getReason())
                .isEqualTo(RefreshRejectedException.Reason.REUSED_TOKEN);
        assertThat(refreshTokenRepository.findById(row.getId())).isEmpty();

        // 같은 기기의 새 토큰도 함께 끊긴다.
        assertThatThrownBy(() -> tokenService.refresh(rotated.refreshToken()))
                .isInstanceOf(RefreshRejectedException.class)
                .extracting(e -> ((RefreshRejectedException) e).getReason())
                .isEqualTo(RefreshRejectedException.Reason.UNKNOWN_TOKEN);
    }

    @Test
    @DisplayName("로그아웃은 현재 토큰 행을 지운다")
    void revokeDeletesTheDeviceRow() {
        String token = tokenProvider.generateRefreshToken(member);

        tokenService.revoke(token);

        assertThat(refreshTokenRepository.findByMemberId(member.getId())).isEmpty();
    }
}
