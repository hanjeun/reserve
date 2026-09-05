package kr.it.reserve.audit.controller;

import kr.it.reserve.audit.service.AuditLogService;
import kr.it.reserve.audit.service.AdminSanctionService;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 관리자 회원/가게 관리.
 *
 * 설계 메모: 회원/가게는 "휴지통(소프트 삭제)" 개념을 사용하지 않는다.
 * 휴지통은 실수로 지워도 되돌릴 수 있는 콘텐츠(예약, 리뷰, 메일)에만 어울리는 개념이고,
 * 회원·가게는 운영 정책 위반에 대한 제재가 목적이므로 정지(SUSPENDED)/영구정지(BANNED)로
 * 처리한다 — 휴지통보다 의미가 명확하고, 해제(복구)도 명시적인 별도 액션으로 분리된다.
 * 회원 탈퇴/가게 폐업으로 인한 실제 삭제는 본인만 수행 가능 (MemberApiController/StoreApiController).
 */
@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/admin/manage")
@PreAuthorize("hasRole('ADMIN')")
public class AdminManagementController {

    private final MemberRepository memberRepository;
    private final StoreRepository storeRepository;
    private final AuditLogService auditLogService;
    private final AdminSanctionService adminSanctionService;

    // ── 회원 목록 조회 ────────────────────────────────────────────

    /** 한 번에 내려줄 수 있는 최대 건수. 호출측이 {@code size=100000} 을 보내 전량을 끌어가지 못하게 막는다. */
    private static final int MAX_PAGE_SIZE = 100;

    /**
     * 회원 목록. {@code search} 가 있으면 이름·이메일로 <b>서버에서</b> 걸러낸다.
     *
     * <p>예전에는 검색 파라미터가 아예 없어서 프론트가 {@code size=100} 으로 받은 뒤
     * 그 배열 안에서만 {@code filter} 했다 — 101번째 회원은 검색도 조회도 불가능했다.
     * {@code AdminAdsTab} 이 같은 문제를 먼저 서버로 옮겼고, 여기도 같은 패턴을 따른다.
     */
    @GetMapping("/members")
    public ApiResponse<?> getMembers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search
    ) {
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        PageRequest pageRequest = PageRequest.of(safePage, safeSize);

        String keyword = search != null ? search.trim() : "";
        Page<Member> members = keyword.isEmpty()
                ? memberRepository.findByDeletedAtIsNullOrderByIdDesc(pageRequest)
                : memberRepository.searchByNameOrEmail(keyword, pageRequest);

        Page<?> result = members.map(m -> Map.of(
                "id",       m.getId(),
                "name",     m.getName() != null ? m.getName() : "",
                "email",    m.getEmail(),
                "role",     m.getRole().name(),
                "provider", m.getProvider().name(),
                "status",   m.getStatus() != null ? m.getStatus().name() : "ACTIVE",
                "suspendedUntil", m.getSuspendedUntil() != null ? m.getSuspendedUntil().toLocalDate().toString() : "",
                "suspendReason", m.getSuspendReason() != null ? m.getSuspendReason() : ""
        ));

        return ApiResponse.success(result, "회원 목록 조회 성공");
    }

    // ── 회원 제재 ────────────────────────────────────────

    @PostMapping("/members/{id}/suspend")
    public ApiResponse<Void> suspendMember(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        int days = parseDays(body.getOrDefault("days", "7"));
        String reason = body.getOrDefault("reason", "");
        adminSanctionService.suspendMember(id, days, reason);
        return ApiResponse.success(null, days + "일간 정지 처리되었습니다.");
    }

    @PostMapping("/members/{id}/ban")
    public ApiResponse<Void> banMember(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String reason = body.getOrDefault("reason", "");
        adminSanctionService.banMember(id, reason);
        return ApiResponse.success(null, "영구 정지 처리되었습니다.");
    }

    @PostMapping("/members/{id}/unban")
    public ApiResponse<Void> unbanMember(@PathVariable Long id) {
        adminSanctionService.unbanMember(id);
        return ApiResponse.success(null, "정지가 해제되었습니다.");
    }

    // ── 가게 목록 조회 ────────────────────────────────────────────

    @GetMapping("/stores")
    public ApiResponse<?> getStores(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search
    ) {
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        String keyword = search != null ? search.trim() : "";
        Page<StoreResponse> stores = storeRepository
                .searchForAdmin(keyword, PageRequest.of(safePage, safeSize))
                .map(StoreResponse::fromEntity);

        return ApiResponse.success(stores, "가게 목록 조회 성공");
    }

    // ── 가게 제재 ────────────────────────────────────────
    // 회원 제재와 동일한 패턴: 정지(기간)/영구정지/해제. 휴지통(소프트 삭제) 사용하지 않음.

    @PostMapping("/stores/{id}/suspend")
    public ApiResponse<Void> suspendStore(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        int days = parseDays(body.getOrDefault("days", "7"));
        String reason = body.getOrDefault("reason", "");
        adminSanctionService.suspendStore(id, days, reason);
        return ApiResponse.success(null, days + "일간 영업정지 처리되었습니다.");
    }

    @PostMapping("/stores/{id}/ban")
    public ApiResponse<Void> banStore(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String reason = body.getOrDefault("reason", "");
        adminSanctionService.banStore(id, reason);
        return ApiResponse.success(null, "영구 폐업 처리되었습니다.");
    }

    @PostMapping("/stores/{id}/unban")
    public ApiResponse<Void> unbanStore(@PathVariable Long id) {
        adminSanctionService.unbanStore(id);
        return ApiResponse.success(null, "영업정지가 해제되었습니다.");
    }

    // ── 예약 소프트 삭제 ──────────────────────────────────────────
    // 예약은 진짜 휴지통(복구 가능한 소프트 삭제)이 어울리는 콘텐츠라 유지

    @DeleteMapping("/reservations/{id}")
    public ApiResponse<Void> softDeleteReservation(@PathVariable Long id) {
        log.info("Admin soft-delete reservation: id={}", id);
        auditLogService.softDeleteReservation(id);
        return ApiResponse.success(null, "예약이 휴지통으로 이동되었습니다.");
    }

    private int parseDays(String rawDays) {
        try {
            return Integer.parseInt(rawDays);
        } catch (NumberFormatException e) {
            throw new MemberException("정지 기간은 숫자로 입력해주세요.", org.springframework.http.HttpStatus.BAD_REQUEST);
        }
    }
}
