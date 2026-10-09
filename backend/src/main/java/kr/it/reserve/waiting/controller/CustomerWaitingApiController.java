package kr.it.reserve.waiting.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.waiting.dto.*;
import kr.it.reserve.waiting.error.WaitingException;
import kr.it.reserve.waiting.service.CustomerWaitingService;
import kr.it.reserve.waiting.service.WaitingEventStream;
import kr.it.reserve.waiting.service.WaitingRetentionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/waiting")
@RequiredArgsConstructor
public class CustomerWaitingApiController {
    private final CustomerWaitingService waiting;
    private final WaitingEventStream streams;
    private final RateLimiter rateLimiter;
    private final WaitingRetentionService retention;

    @GetMapping("/retention-policy")
    public ResponseEntity<ApiResponse<WaitingRetentionService.CustomerPolicy>> retentionPolicy() {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(ApiResponse.success(retention.customerPolicy(), "웨이팅 개인정보 안내를 불러왔어요."));
    }

    @GetMapping("/stores")
    public ApiResponse<Page<StoreResponse>> directory(@RequestParam(defaultValue = "") String keyword,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "12") int size,
                                                     @RequestParam(defaultValue = "") String region,
                                                     @RequestParam(defaultValue = "ALL") String status,
                                                     @RequestParam(defaultValue = "recommended") String sort) {
        return ApiResponse.success(waiting.directory(keyword, page, size,
                new CustomerWaitingService.DirectoryFilters(region, status, sort)), "웨이팅 가게를 불러왔어요.");
    }

    @GetMapping("/my")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<Page<MyWaitingResponse>> mine(@RequestParam(defaultValue = "0") int page,
                                                    @RequestParam(defaultValue = "20") int size,
                                                    @RequestParam(defaultValue = "") String keyword,
                                                    @RequestParam(defaultValue = "ALL") String status,
                                                    @RequestParam(defaultValue = "recent") String sort) {
        return ApiResponse.success(waiting.mine(SecurityUtil.getCurrentMember(), page, size, keyword, status, sort), "내 웨이팅을 불러왔어요.");
    }

    @PostMapping("/stores/{storeId}/entries")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<WaitingEntryResponse>> join(@PathVariable Long storeId,
            @Valid @RequestBody JoinWaitingRequest body, HttpServletRequest request) {
        var member = SecurityUtil.getCurrentMember();
        if (!rateLimiter.tryConsume("waiting:member:" + member.getId(), RateLimiter.Policy.WAITING_JOIN)
                || !rateLimiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.WAITING_JOIN)) {
            throw new WaitingException("접수 요청이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(waiting.join(member, storeId, body), "웨이팅을 접수했어요."));
    }

    @PostMapping("/entries/{entryId}/cancel")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<WaitingEntryResponse> cancel(@PathVariable Long entryId) {
        return ApiResponse.success(waiting.cancel(SecurityUtil.getCurrentMember(), entryId), "웨이팅을 취소했어요.");
    }

    @GetMapping("/entries/{entryId}/qr")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<WaitingQrResponse> entryQr(@PathVariable Long entryId) {
        return ApiResponse.success(waiting.entryQr(SecurityUtil.getCurrentMember(), entryId), "입장 QR을 불러왔어요.");
    }

    @GetMapping("/stores/{storeId}/onsite-qr")
    @PreAuthorize("hasAnyRole('BUSINESS', 'ADMIN')")
    public ApiResponse<WaitingQrResponse> onsiteQr(@PathVariable Long storeId) {
        return ApiResponse.success(waiting.onsiteQr(SecurityUtil.getCurrentMember(), storeId), "현장 접수 QR을 불러왔어요.");
    }

    @PostMapping("/qr-checkin")
    @PreAuthorize("hasAnyRole('BUSINESS', 'ADMIN')")
    public ApiResponse<CustomerWaitingService.CheckinResponse> checkin(@Valid @RequestBody QrRequest body,
                                                                       HttpServletRequest request) {
        if (!rateLimiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.QR_CHECKIN)) {
            throw new WaitingException("QR 요청이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        return ApiResponse.success(waiting.checkin(SecurityUtil.getCurrentMember(), body.token()), "웨이팅 입장을 처리했어요.");
    }

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SseEmitter> events() {
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("X-Accel-Buffering", "no")
                .body(streams.subscribe(SecurityUtil.getCurrentMember()));
    }

    public record QrRequest(@NotBlank(message = "QR 토큰이 필요해요.") @Size(max = 2048, message = "올바른 QR을 확인해주세요.") String token) {}
}
