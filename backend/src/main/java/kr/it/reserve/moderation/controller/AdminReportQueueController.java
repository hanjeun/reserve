package kr.it.reserve.moderation.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.moderation.repository.AdminReportQueueRepository;
import kr.it.reserve.moderation.service.ServiceReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/report-queue")
@RequiredArgsConstructor
public class AdminReportQueueController {
    private final ServiceReportService reports;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<AdminReportQueueRepository.QueueRow>>> list(@RequestParam(required = false) QueueType type,
            @RequestParam(required = false) QueueStatus status, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return privateData(reports.queue(SecurityUtil.getCurrentMember(), type == null ? null : type.name(),
                status == null ? null : status.name(), page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ServiceReportService.CaseDetail>> detail(@PathVariable Long id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return privateData(reports.detail(SecurityUtil.getCurrentMember(), id, page, size));
    }

    @PatchMapping("/{id}")
    public ApiResponse<ServiceReportService.Receipt> decide(@PathVariable Long id, @Valid @RequestBody Decision body) {
        return ApiResponse.success(reports.decide(SecurityUtil.getCurrentMember(), id, body.result(), body.note(), body.revision()),
                "신고 처리 결과를 저장했어요.");
    }

    private <T> ResponseEntity<ApiResponse<T>> privateData(T data) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(data, "신고 내역 조회 성공"));
    }

    public enum QueueType { REVIEW, RESERVATION, CHAT, FEED, FEED_COMMENT }
    public enum QueueStatus { OPEN, REVIEWING, APPEALED, RESOLVED, DISMISSED, REJECTED }
    public record Decision(@NotNull ServiceReportService.Decision result, @NotBlank @Size(max = 500) String note,
            @NotNull @PositiveOrZero Long revision) { }
}
