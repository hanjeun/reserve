package kr.it.reserve.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.security.controller.CspReportController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
}
