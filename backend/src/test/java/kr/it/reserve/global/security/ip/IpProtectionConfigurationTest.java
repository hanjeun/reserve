package kr.it.reserve.global.security.ip;

import kr.it.reserve.global.redis.RedisFailureBackoff;
import kr.it.reserve.global.redis.RedisNamespace;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import java.io.IOException;
import java.util.HashSet;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.ArgumentMatchers.anyString;

class IpProtectionConfigurationTest {
    @Test void credentialVersionChangeRequiresTheSameNetworkToBeConfirmedAgain() {
        var properties = new IpProtectionProperties();
        properties.setEnabled(true);
        properties.setFingerprintKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        var store = mock(IpProtectionStore.class);
        var known = new HashSet<String>();
        when(store.browser(anyString(), anyString(), anyString(), anyString(), anyString())).thenAnswer(call ->
                known.contains(call.getArgument(0) + ":" + call.getArgument(1)) ? 1L : 0L);
        doAnswer(call -> { known.add(call.getArgument(0) + ":" + call.getArgument(1)); return null; })
                .when(store).rememberBrowser(anyString(), anyString(), anyString(), anyString(), anyString());
        var protection = new IpLoginProtection(properties, store);
        var member = Member.builder().id(7L).build();
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("192.0.2.10");
        var previous = RequestContextHolder.getRequestAttributes();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        try {
            assertThat(protection.needsStepUp(member)).isTrue();
            protection.approveCurrent(member);
            protection.prepareBrowser(member, true);
            protection.beforeSession(member, false).run();
            var response = new org.springframework.mock.web.MockHttpServletResponse();
            protection.writeBrowserCookie(request, response);
            String raw = response.getHeader("Set-Cookie").split("[=;]")[1];
            request.setCookies(new jakarta.servlet.http.Cookie("__Host-reserve_browser", raw));
            assertThat(protection.needsStepUp(member)).isFalse();
            member.rotateAuthVersion();
            assertThat(protection.needsStepUp(member)).isTrue();
            assertThatThrownBy(() -> protection.beforeSession(member, false))
                    .isInstanceOf(kr.it.reserve.global.error.AuthException.class);
        } finally { RequestContextHolder.setRequestAttributes(previous); }
    }

    private final ApplicationContextRunner context = new ApplicationContextRunner().withUserConfiguration(IpProtectionConfiguration.class);
    private ApplicationContextRunner redis() {
        return context.withBean(StringRedisTemplate.class, () -> mock(StringRedisTemplate.class))
                .withBean(RedisNamespace.class, () -> RedisNamespace.LOCAL)
                .withBean(RedisFailureBackoff.class, RedisFailureBackoff::new);
    }
    @Test void defaultDisabledNeedsNoRedisOrSecret() {
        context.run(application -> {
            assertThat(application).hasNotFailed().hasSingleBean(IpLoginProtection.class).doesNotHaveBean(IpProtectionStore.class);
            assertThat(application.getBean(IpLoginProtection.class).enabled()).isFalse();
        });
    }
    @Test void enablingWithoutRedisFailsInsteadOfSilentlyDisablingProtection() {
        context.withPropertyValues("reserve.security.ip-protection.enabled=true").run(application -> assertThat(application).hasFailed());
    }
    @Test void enablingWithoutADedicatedKeyFails() {
        redis().withPropertyValues("reserve.security.ip-protection.enabled=true").run(application -> assertThat(application).hasFailed());
    }
    @Test void explicitConfigurationBindsThePreparedRedisStore() {
        redis().withPropertyValues("reserve.security.ip-protection.enabled=true",
                "reserve.security.ip-protection.fingerprint-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "reserve.security.ip-protection.trusted-proxies[0]=10.0.0.2/32").run(application -> {
            assertThat(application).hasNotFailed().hasSingleBean(IpProtectionStore.class);
            assertThat(application.getBean(IpLoginProtection.class).enabled()).isTrue();
        });
    }

    @Test void deploymentEnvironmentBindsThroughTheCommonProfile() {
        redis().withInitializer(application -> {
            try {
                new YamlPropertySourceLoader().load("common", new ClassPathResource("application-common.yml"))
                        .forEach(source -> application.getEnvironment().getPropertySources().addLast(source));
            } catch (IOException failure) { throw new IllegalStateException(failure); }
        }).withPropertyValues("RESERVE_SECURITY_IP_PROTECTION_ENABLED=true",
                "RESERVE_SECURITY_IP_PROTECTION_FINGERPRINT_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "RESERVE_SECURITY_IP_PROTECTION_TRUSTED_PROXIES=10.0.0.2/32,10.0.0.3/32").run(application -> {
            assertThat(application).hasNotFailed().hasSingleBean(IpProtectionStore.class);
            assertThat(application.getBean(IpLoginProtection.class).enabled()).isTrue();
            assertThat(application.getBean(IpProtectionProperties.class).getTrustedProxies())
                    .containsExactly("10.0.0.2/32", "10.0.0.3/32");
        });
    }

    @Test void productionRejectsDefaultRedisIdentityAndSharedProxySubnets() {
        var production = context.withBean(StringRedisTemplate.class, () -> mock(StringRedisTemplate.class))
                .withBean(RedisNamespace.class, () -> RedisNamespace.PRODUCTION)
                .withBean(RedisFailureBackoff.class, RedisFailureBackoff::new)
                .withPropertyValues("reserve.security.ip-protection.enabled=true",
                        "reserve.security.ip-protection.fingerprint-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        production.withPropertyValues("reserve.redis.username=default", "reserve.security.ip-protection.trusted-proxies=172.30.30.2/32")
                .run(application -> assertThat(application).hasFailed());
        production.withPropertyValues("reserve.redis.username=reserve_app", "reserve.security.ip-protection.trusted-proxies=172.30.30.0/29")
                .run(application -> assertThat(application).hasFailed());
        production.withPropertyValues("reserve.redis.username=reserve_app", "reserve.security.ip-protection.trusted-proxies=172.30.30.2/32")
                .run(application -> assertThat(application).hasNotFailed());
    }
}
