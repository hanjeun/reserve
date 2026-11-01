package kr.it.reserve.global.security.ip;

import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class IpLoginProtectionTest {
    private final IpProtectionStore store = mock(IpProtectionStore.class);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final Member member = Member.builder().id(7L).build();
    private IpLoginProtection protection;

    @BeforeEach void setup() {
        var properties = properties();
        protection = new IpLoginProtection(properties, store);
        request.setRemoteAddr("192.0.2.7");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }
    @AfterEach void cleanup() { RequestContextHolder.resetRequestAttributes(); }
    private static IpProtectionProperties properties() {
        var value = new IpProtectionProperties();
        value.setEnabled(true);
        value.setFingerprintKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        return value;
    }

    @Test void disabledProtectionNeverTouchesRedisOrChangesSessionIssuance() {
        protection = new IpLoginProtection(new IpProtectionProperties(), null);
        RequestContextHolder.resetRequestAttributes();
        assertThat(protection.needsStepUp(member)).isFalse();
        assertThat(protection.blocked(request)).isZero();
        protection.failed(request);
        protection.beforeSession(member, false).run();
        verifyNoInteractions(store);
    }
    @Test void enablingRequiresADedicatedKeyAndRedis() {
        var value = properties();
        value.setFingerprintKey("invalid");
        assertThatThrownBy(() -> new IpLoginProtection(value, store)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new IpLoginProtection(properties(), null)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void unknownNetworkCannotIssuePrimarySessionOrSeedHistory() {
        assertThat(protection.needsStepUp(member)).isTrue();
        assertThatThrownBy(() -> protection.beforeSession(member, false)).isInstanceOf(AuthException.class);
        verify(store, never()).remember(anyString(), anyString());
    }
    @Test void knownHistoryIsPseudonymousAndOnlyRecordedAfterSuccessfulIssuance() {
        when(store.known(anyString(), anyString())).thenReturn(true);
        assertThat(protection.needsStepUp(member)).isFalse();
        Runnable committed = protection.beforeSession(member, false);
        verify(store, never()).remember(anyString(), anyString());
        committed.run();
        var owner = ArgumentCaptor.forClass(String.class);
        var network = ArgumentCaptor.forClass(String.class);
        verify(store).remember(owner.capture(), network.capture());
        assertThat(owner.getValue()).matches("[0-9a-f]{64}");
        assertThat(network.getValue()).matches("[0-9a-f]{64}").doesNotContain("192.0.2.7");
    }
    @Test void verifiedFactorCanAdmitANewNetworkWithoutClearingPriorFailures() {
        protection.beforeSession(member, true).run();
        verify(store).remember(anyString(), anyString());
        verify(store, never()).known(anyString(), anyString());
    }
    @Test void grantIsBoundToTheCurrentAccountVersionAndNetwork() {
        protection.approveCurrent(member);
        protection.beforeSession(member, false).run();
        assertThatThrownBy(() -> protection.beforeSession(Member.builder().id(8L).build(), false)).isInstanceOf(AuthException.class);
        member.rotateAuthVersion();
        assertThatThrownBy(() -> protection.beforeSession(member, false)).isInstanceOf(AuthException.class);
        protection.approveCurrent(member);
        request.setRemoteAddr("198.51.100.7");
        assertThatThrownBy(() -> protection.beforeSession(member, false)).isInstanceOf(AuthException.class);
    }
    @Test void pendingProofUsesTicketAndNetworkAndCannotBeReusedWithAnotherBinding() {
        protection.bind("synthetic-ticket", member);
        var ticket = ArgumentCaptor.forClass(String.class);
        var binding = ArgumentCaptor.forClass(String.class);
        verify(store).bind(ticket.capture(), binding.capture());
        when(store.binding(ticket.getValue(), binding.getValue())).thenReturn(true);
        protection.requireBinding("synthetic-ticket", member);
        assertThatThrownBy(() -> protection.requireBinding("other-ticket", member)).isInstanceOf(AuthException.class);
        request.setRemoteAddr("198.51.100.7");
        assertThatThrownBy(() -> protection.requireBinding("synthetic-ticket", member)).isInstanceOf(AuthException.class);
    }
    @Test void redisOutagePreservesExistingLimitsButDoesNotAdmitAnUnknownPrimaryLogin() {
        when(store.known(anyString(), anyString())).thenThrow(new IpProtectionStore.Unavailable());
        when(store.blocked(anyString())).thenThrow(new IpProtectionStore.Unavailable());
        doThrow(new IpProtectionStore.Unavailable()).when(store).remember(anyString(), anyString());
        assertThat(protection.blocked(request)).isZero();
        assertThatThrownBy(() -> protection.needsStepUp(member)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> protection.beforeSession(member, false)).isInstanceOf(AuthException.class);
        assertThatCode(() -> protection.beforeSession(member, true).run()).doesNotThrowAnyException();
    }
    @Test void onlyExplicitTrustedPeersCanSupplyARealIpAndMissingProxyHeadersCannotSeedTrust() {
        var value = properties();
        value.setTrustedProxies(List.of("10.0.0.0/8"));
        var addresses = new TrustedClientIp(value.getTrustedProxies());
        request.addHeader("X-Real-IP", "198.51.100.7");
        request.addHeader("X-Forwarded-For", "203.0.113.9");
        assertThat(addresses.extract(request)).isEqualTo("192.0.2.7");
        request.setRemoteAddr("10.0.0.2");
        assertThat(addresses.extract(request)).isEqualTo("198.51.100.7");
        request.removeHeader("X-Real-IP");
        assertThat(addresses.extract(request)).isNull();
    }
    @Test void ipv6AndMappedIpv4HaveCanonicalKeysWithoutDnsLookup() {
        assertThat(TrustedClientIp.literal("2001:db8::1")).isEqualTo(TrustedClientIp.literal("2001:0db8:0000:0000:0000:0000:0000:0001"));
        assertThat(TrustedClientIp.literal("::ffff:192.0.2.7")).isEqualTo("192.0.2.7");
    }
    @Test void wildcardAndInvalidProxyRangesCannotTrustAllClientHeaders() {
        for (String range : List.of("0.0.0.0/0", "::/0", "10.0.0.1/33", "example.com/32"))
            assertThatThrownBy(() -> new TrustedClientIp(List.of(range))).isInstanceOf(IllegalArgumentException.class);
    }
    @ParameterizedTest @NullAndEmptySource
    @ValueSource(strings = {"example.com", "ffff", "127.1", "192.000.2.1", "256.0.0.1", "::gg", "fe80::1%eth0", "192.0.2.1,198.51.100.1", " 192.0.2.1"})
    void rejectsNonLiteralOrAmbiguousAddresses(String address) { assertThat(TrustedClientIp.literal(address)).isNull(); }
}
