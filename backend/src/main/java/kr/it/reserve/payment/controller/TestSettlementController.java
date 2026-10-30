package kr.it.reserve.payment.controller;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.service.TestSettlementService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/business/settlements")
@PreAuthorize("hasAnyRole('BUSINESS', 'ADMIN')")
public class TestSettlementController {
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
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page, @AuthenticationPrincipal Member member) {
        return ApiResponse.success(settlements.page(storeId, member, page), "TEST 가상 정산 내역이에요.");
    }
    @PostMapping("/{storeId}/simulate")
    public ApiResponse<TestSettlementService.Receipt> simulate(@PathVariable @Positive Long storeId,
            @Valid @RequestBody Request body, @AuthenticationPrincipal Member member) {
        return ApiResponse.success(settlements.simulate(storeId, body.paymentId(), body.requestId(), member), "TEST 가상 정산을 기록했어요.");
    }
}
