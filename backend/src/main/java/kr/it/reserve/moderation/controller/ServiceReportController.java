package kr.it.reserve.moderation.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.moderation.entity.ServiceReport.TargetType;
import kr.it.reserve.moderation.service.ServiceReportService;
import kr.it.reserve.moderation.service.ServiceReportService.Reason;
import kr.it.reserve.moderation.service.ServiceReportService.Receipt;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/service-reports")
@RequiredArgsConstructor
public class ServiceReportController {
    private final ServiceReportService reports;
    private final RateLimiter rateLimiter;

    @PostMapping
    public ApiResponse<Receipt> submit(@Valid @RequestBody Submission body, HttpServletRequest http) {
        return ApiResponse.success(reports.submit(reporter(http), body.type(), body.targetId(), body.reason(), body.details()),
                "신고를 접수했어요.");
    }

    @GetMapping("/mine")
    public ResponseEntity<ApiResponse<Page<Receipt>>> mine(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                reports.mine(SecurityUtil.getCurrentMember(), page, size), "내 신고 조회 성공"));
    }

    @PostMapping("/{id}/appeal")
    public ApiResponse<Receipt> appeal(@PathVariable Long id, @Valid @RequestBody Appeal body, HttpServletRequest http) {
        return ApiResponse.success(reports.appeal(reporter(http), id, body.details(), body.revision()), "이의를 접수했어요.");
    }

    private Member reporter(HttpServletRequest http) {
        var member = SecurityUtil.getCurrentMember();
        var policy = RateLimiter.Policy.CHAT_REPORT;
        // 신고 유형이나 이의 경로를 바꿔도 기존 신고 예산을 함께 사용해요.
        if (!rateLimiter.tryConsume("review-report-ip:" + IpExtractor.extract(http), policy)
                || !rateLimiter.tryConsume("review-report-member:" + member.getId(), policy)) {
            throw new BusinessException("잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return member;
    }

    public record Submission(@NotNull TargetType type, @NotNull @Positive Long targetId, @NotNull Reason reason,
            @NotBlank @Size(max = 500) String details) { }
    public record Appeal(@NotBlank @Size(max = 500) String details, @NotNull @PositiveOrZero Long revision) { }
}
