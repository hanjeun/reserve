package kr.it.reserve.reservation.admission;

import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.LocalTime;

@RestController @RequiredArgsConstructor
@RequestMapping("/api/reservations/admission")
public class AdmissionController {
    private final AdmissionService admission;
    private final RateLimiter limiter;
    public record CampaignView(String id, java.time.Instant opensAt, java.time.Instant closesAt, int leaseSeconds) { }
    public record Ticket(String ticket) { }

    @GetMapping
    public ApiResponse<CampaignView> campaign(@RequestParam Long storeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime time) {
        member(false);
        var c = admission.match(storeId, date, time);
        return ApiResponse.success(c == null ? null : new CampaignView(c.getId(), c.getOpensAt(), c.getClosesAt(), c.getLeaseSeconds()), "입장 대기 설정 조회 성공");
    }
    @PostMapping("/{id}")
    public ApiResponse<AdmissionService.Status> join(@PathVariable String id) { return ApiResponse.success(admission.join(id, member(true)), "입장 대기 접수 성공"); }
    @PostMapping("/{id}/status")
    public ApiResponse<AdmissionService.Status> status(@PathVariable String id, @RequestBody Ticket ticket) { return ApiResponse.success(admission.status(id, member(false), ticket.ticket()), "입장 상태 조회 성공"); }
    @DeleteMapping("/{id}")
    public ApiResponse<AdmissionService.Status> cancel(@PathVariable String id, @RequestBody Ticket ticket) { return ApiResponse.success(admission.cancel(id, member(true), ticket.ticket()), "입장 대기 취소 성공"); }

    private Long member(boolean write) {
        var m = SecurityUtil.getCurrentMember();
        if (m.isSuspended() || !m.isTermsAgreed()) throw new ReservationException("예약할 수 있는 회원 상태를 확인해주세요.", HttpStatus.FORBIDDEN);
        // Separate user bucket: NAT users do not share a single queue status budget.
        if (!limiter.tryConsume("admission:" + m.getId(), write ? RateLimiter.Policy.WAITING_JOIN : RateLimiter.Policy.PROFILE_READ))
            throw new ReservationException("대기 상태를 잠시 후 다시 확인해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        return m.getId();
    }
}
