package kr.it.reserve.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import kr.it.reserve.security.controller.CspReportController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

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
}
