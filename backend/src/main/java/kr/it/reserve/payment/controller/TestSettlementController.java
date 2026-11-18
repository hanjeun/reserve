package kr.it.reserve.payment.controller;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.service.TestSettlementService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.YearMonth;

@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/business/settlements")
@PreAuthorize("hasAnyRole('BUSINESS', 'ADMIN')")
public class TestSettlementController {
    private static final String MONTH_FORMAT = "[1-9]\\d{3}-(0[1-9]|1[0-2])";
    private final TestSettlementService settlements;
    public record Request(@NotBlank @Size(max = 36) String requestId, @NotNull @Positive Long paymentId) { }
    @ModelAttribute void privateResponse(HttpServletResponse response) { response.setHeader("Cache-Control", "no-store"); }
    public record Availability(boolean enabled) { }
    @GetMapping("/status")
    public ApiResponse<Availability> status() {
        return ApiResponse.success(new Availability(settlements.isEnabled()), "TEST 가상 정산 준비 상태예요.");
    }
    @GetMapping
    public ApiResponse<TestSettlementService.Page> page(@RequestParam @Positive Long storeId,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page,
            @RequestParam(required = false) @Pattern(regexp = MONTH_FORMAT) String month, @AuthenticationPrincipal Member member) {
        return ApiResponse.success(settlements.page(storeId, member, page, month == null ? null : YearMonth.parse(month)), "TEST 가상 정산 내역이에요.");
    }
    @GetMapping("/monthly")
    public ApiResponse<TestSettlementService.MonthlySummary> monthly(@RequestParam @Positive Long storeId,
            @RequestParam @Pattern(regexp = MONTH_FORMAT) String month, @AuthenticationPrincipal Member member) {
        return ApiResponse.success(settlements.monthly(storeId, member, YearMonth.parse(month)), "TEST 월별 정산 내역이에요.");
    }
    @GetMapping(value = "/monthly.csv", produces = "text/csv")
    public ResponseEntity<String> monthlyCsv(@RequestParam @Positive Long storeId,
            @RequestParam @Pattern(regexp = MONTH_FORMAT) String month, @AuthenticationPrincipal Member member) {
        String filename = "reserve-test-settlement-" + storeId + "-" + month + ".csv";
        return ResponseEntity.ok().contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .body(settlements.monthlyCsv(storeId, member, YearMonth.parse(month)));
    }
    @PostMapping("/{storeId}/simulate")
    public ApiResponse<TestSettlementService.Receipt> simulate(@PathVariable @Positive Long storeId,
            @Valid @RequestBody Request body, @AuthenticationPrincipal Member member) {
        return ApiResponse.success(settlements.simulate(storeId, body.paymentId(), body.requestId(), member), "TEST 가상 정산을 기록했어요.");
    }
}
