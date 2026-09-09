package kr.it.reserve.global.error;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerTest {
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new Probe()).setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void invalidNumberAndMissingParameterAre400WithoutEchoingInput() throws Exception {
        mvc.perform(get("/error-probe").param("page", "private-input@example.test"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.success").value(false))
                .andExpect(content().string(not(containsString("private-input"))));
        mvc.perform(get("/error-probe")).andExpect(status().isBadRequest());
    }

    @Test
    void malformedJsonIs400WithoutEchoingBody() throws Exception {
        mvc.perform(post("/error-probe").contentType(MediaType.APPLICATION_JSON).content("{private-body"))
                .andExpect(status().isBadRequest()).andExpect(content().string(not(containsString("private-body"))));
    }

    @Test
    void wrongMethodAndMediaTypeKeepTheirHttpSemantics() throws Exception {
        mvc.perform(put("/error-probe")).andExpect(status().isMethodNotAllowed()).andExpect(header().exists("Allow"));
        mvc.perform(post("/error-probe").contentType(MediaType.TEXT_PLAIN).content("text"))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void genuineServerFailureRemains500WithGenericMessage() throws Exception {
        mvc.perform(get("/error-probe/failure")).andExpect(status().isInternalServerError())
                .andExpect(content().string(not(containsString("private-error"))));
    }

    @RestController
    static class Probe {
        @GetMapping("/error-probe")
        int getPage(@RequestParam int page) { return page; }

        @PostMapping(value = "/error-probe", consumes = "application/json")
        Body postBody(@RequestBody Body body) { return body; }

        @GetMapping("/error-probe/failure")
        void fail() { throw new IllegalStateException("private-error"); }
    }

    record Body(int value) { }
}
