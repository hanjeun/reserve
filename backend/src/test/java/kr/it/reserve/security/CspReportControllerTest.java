package kr.it.reserve.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import kr.it.reserve.security.controller.CspReportController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.slf4j.LoggerFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CspReportControllerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
                .standaloneSetup(new CspReportController(new ObjectMapper()))
                .build();
    }

    @Test
    void acceptsLegacyAndReportingApiPayloadsWithoutReturningContent() throws Exception {
        mockMvc.perform(post("/api/csp-reports")
                        .contentType("application/csp-report")
                        .content("""
                                {"csp-report":{"effective-directive":"script-src-elem","blocked-uri":"https://blocked.example/path?token=secret"}}
                                """))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/csp-reports")
                        .contentType("application/reports+json")
                        .content("""
                                [{"type":"csp-violation","body":{"effectiveDirective":"connect-src","blockedURL":"https://api.example/private"}}]
                                """))
                .andExpect(status().isNoContent());
    }

    @Test
    void ignoresMalformedReports() throws Exception {
        mockMvc.perform(post("/api/csp-reports")
                        .contentType("application/csp-report")
                        .content("not-json"))
                .andExpect(status().isNoContent());
    }

    @Test
    void logsOnlyASafeSourceCategoryForExtensionInjectedEval() throws Exception {
        Logger logger = (Logger) LoggerFactory.getLogger(CspReportController.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            mockMvc.perform(post("/api/csp-reports")
                            .contentType("application/csp-report")
                            .content("""
                                    {"csp-report":{"effective-directive":"script-src",
                                    "blocked-uri":"eval",
                                    "source-file":"chrome-extension://private-extension-id/injected.js"}}
                                    """))
                    .andExpect(status().isNoContent());

            org.assertj.core.api.Assertions.assertThat(appender.list)
                    .extracting(ILoggingEvent::getFormattedMessage)
                    .anySatisfy(message -> org.assertj.core.api.Assertions.assertThat(message)
                            .contains("directive=script, blockedScheme=eval, sourceCategory=browser-extension")
                            .doesNotContain("private-extension-id")
                            .doesNotContain("injected.js"));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void malformedSourceUriDoesNotLeakPrivateReportData() throws Exception {
        String sourceFile = "https://private-user:private-password@reserve.it.kr/private-source.js"
                + "?token=private%zz-token#private-fragment";
        String body = new ObjectMapper().writeValueAsString(Map.of("csp-report", Map.of(
                "effective-directive", "script-src",
                "blocked-uri", "https://blocked.example/private-resource?token=private-blocked-token",
                "source-file", sourceFile,
                "document-uri", "https://reserve.it.kr/account/private-document?token=private-document-token"
        )));
        Logger logger = (Logger) LoggerFactory.getLogger(CspReportController.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            mockMvc.perform(post("/api/csp-reports")
                            .contentType("application/csp-report")
                            .content(body))
                    .andExpect(status().isNoContent());

            assertThat(appender.list)
                    .extracting(ILoggingEvent::getFormattedMessage)
                    .containsExactly("CSP violation observed: directive=script, blockedScheme=https, sourceCategory=invalid, blockedCategory=external-web");
            assertThat(appender.list.getFirst().getArgumentArray())
                    .containsExactly("script", "https", "invalid", "external-web");
            assertThat(appender.list.getFirst().getThrowableProxy()).isNull();
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @ParameterizedTest(name = "{0}: {1}")
    @CsvSource(textBlock = """
            reserve.it.kr, first-party
            ASSETS.RESERVE.IT.KR, first-party
            notreserve.it.kr, external-web
            reserve.it.kr.attacker.example, external-web
            cdn.portone.io, portone
            pay.portone.io, portone
            checkout.iamport.kr, portone
            notportone.io, external-web
            dapi.kakao.com, kakao
            assets.kakao.com, kakao
            t1.kakaocdn.net, kakao
            t1.daumcdn.net, kakao
            notkakao.com, external-web
            o1.ingest.sentry.io, sentry
            notsentry.io, external-web
            lh3.googleusercontent.com, google-profile
            lh3.googleusercontent.com.attacker.example, external-web
            images.unsplash.com, unsplash
            placehold.co, placeholder
            """)
    void classifiesWebHostBoundariesWithoutLoggingPrivateReportData(String host, String expectedCategory)
            throws Exception {
        String sourceFile = "https://private-user:private-password@" + host
                + "/private-source.js?token=private-source-token#private-fragment";
        String body = new ObjectMapper().writeValueAsString(Map.of("csp-report", Map.of(
                "effective-directive", "script-src",
                "blocked-uri", "https://blocked.example/private-resource?token=private-blocked-token",
                "source-file", sourceFile,
                "document-uri", "https://reserve.it.kr/account/private-document?token=private-document-token"
        )));
        Logger logger = (Logger) LoggerFactory.getLogger(CspReportController.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            mockMvc.perform(post("/api/csp-reports")
                            .contentType("application/csp-report")
                            .content(body))
                    .andExpect(status().isNoContent());

            assertThat(appender.list)
                    .extracting(ILoggingEvent::getFormattedMessage)
                    .containsExactly("CSP violation observed: directive=script, blockedScheme=https, sourceCategory="
                            + expectedCategory + ", blockedCategory=external-web");
            assertThat(appender.list.getFirst().getArgumentArray())
                    .containsExactly("script", "https", expectedCategory, "external-web");
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void recordsBlockedImageCategoryWithoutItsPrivatePathOrQuery() throws Exception {
        Logger logger = (Logger) LoggerFactory.getLogger(CspReportController.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            mockMvc.perform(post("/api/csp-reports").contentType("application/csp-report").content("""
                    {"csp-report":{"effective-directive":"img-src",
                    "blocked-uri":"https://lh3.googleusercontent.com/private-photo?token=private-token",
                    "source-file":"https://reserve.it.kr/assets/private.js"}}
                    """)).andExpect(status().isNoContent());
            assertThat(appender.list).extracting(ILoggingEvent::getFormattedMessage).containsExactly(
                    "CSP violation observed: directive=img, blockedScheme=https, sourceCategory=first-party, blockedCategory=google-profile");
            assertThat(appender.list.getFirst().getArgumentArray()).containsExactly("img", "https", "first-party", "google-profile");
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }
}
