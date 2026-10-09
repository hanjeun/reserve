package kr.it.reserve.global.error;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import jakarta.servlet.http.HttpServletResponse;

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

    @Test
    void closedEventStreamDoesNotTryToWriteAJsonErrorIntoTheEventResponse() throws Exception {
        mvc.perform(get("/error-probe/closed-stream"))
                .andExpect(content().contentType(MediaType.TEXT_EVENT_STREAM))
                .andExpect(content().string(""));
    }

    @RestController
    static class Probe {
        @GetMapping("/error-probe")
        int getPage(@RequestParam int page) { return page; }

        @PostMapping(value = "/error-probe", consumes = "application/json")
        Body postBody(@RequestBody Body body) { return body; }

        @GetMapping("/error-probe/failure")
        void fail() { throw new IllegalStateException("private-error"); }

        @GetMapping("/error-probe/closed-stream")
        void closedStream(HttpServletResponse response) throws AsyncRequestNotUsableException {
            response.setContentType(MediaType.TEXT_EVENT_STREAM_VALUE);
            throw new AsyncRequestNotUsableException("Response is no longer usable");
        }
    }

    record Body(int value) { }
}
