package com.reserve.audit.controller;

import com.reserve.audit.service.AuditLogService;
import com.reserve.global.common.ApiResponse;
import com.reserve.member.entity.Member;
import com.reserve.member.repository.MemberRepository;
import com.reserve.store.dto.StoreResponse;
import com.reserve.store.entity.Store;
import com.reserve.store.repository.StoreRepository;
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

    // ── 회원 목록 조회 ────────────────────────────────────────────

    @GetMapping("/members")
    public ApiResponse<?> getMembers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        Page<Member> members = memberRepository.findByDeletedAtIsNullOrderByIdDesc(
                PageRequest.of(page, size));

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
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Member not found: " + id));
        if (member.getRole().name().equals("ADMIN")) {
            throw new IllegalArgumentException("관리자는 제재할 수 없습니다.");
        }
        int days = Integer.parseInt(body.getOrDefault("days", "7"));
        String reason = body.getOrDefault("reason", "");
        LocalDateTime until = LocalDateTime.now().plusDays(days);
        member.suspend(until, reason.isEmpty() ? null : reason);
        memberRepository.save(member);
        auditLogService.logMemberSanction(id, member.getEmail(), "SUSPEND",
                days + "일 정지" + (reason.isEmpty() ? "" : " / " + reason));
        log.info("Admin suspended member: id={}, until={}", id, until);
        return ApiResponse.success(null, days + "일간 정지 처리되었습니다.");
    }

    @PostMapping("/members/{id}/ban")
    public ApiResponse<Void> banMember(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Member not found: " + id));
        if (member.getRole().name().equals("ADMIN")) {
            throw new IllegalArgumentException("관리자는 제재할 수 없습니다.");
        }
        String reason = body.getOrDefault("reason", "");
        member.ban(reason.isEmpty() ? null : reason);
        memberRepository.save(member);
        auditLogService.logMemberSanction(id, member.getEmail(), "BAN",
                "영구 정지" + (reason.isEmpty() ? "" : " / " + reason));
        log.info("Admin banned member: id={}", id);
        return ApiResponse.success(null, "영구 정지 처리되었습니다.");
    }

    @PostMapping("/members/{id}/unban")
    public ApiResponse<Void> unbanMember(@PathVariable Long id) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Member not found: " + id));
        member.unban();
        memberRepository.save(member);
        auditLogService.logMemberSanction(id, member.getEmail(), "UNBAN", "정지 해제");
        log.info("Admin unbanned member: id={}", id);
        return ApiResponse.success(null, "정지가 해제되었습니다.");
    }

    // ── 가게 목록 조회 ────────────────────────────────────────────

    @GetMapping("/stores")
    public ApiResponse<?> getStores(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        Page<StoreResponse> stores = storeRepository
                .findByDeletedAtIsNullOrderByCreatedAtDesc(PageRequest.of(page, size))
                .map(StoreResponse::fromEntity);

        return ApiResponse.success(stores, "가게 목록 조회 성공");
    }

    // ── 가게 제재 ────────────────────────────────────────
    // 회원 제재와 동일한 패턴: 정지(기간)/영구정지/해제. 휴지통(소프트 삭제) 사용하지 않음.

    @PostMapping("/stores/{id}/suspend")
    public ApiResponse<Void> suspendStore(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        Store store = storeRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Store not found: " + id));
        int days = Integer.parseInt(body.getOrDefault("days", "7"));
        String reason = body.getOrDefault("reason", "");
        LocalDateTime until = LocalDateTime.now().plusDays(days);
        store.suspend(until, reason.isEmpty() ? null : reason);
        storeRepository.save(store);
        auditLogService.logStoreSanction(id, store.getName(), "SUSPEND",
                days + "일 영업정지" + (reason.isEmpty() ? "" : " / " + reason));
        log.info("Admin suspended store: id={}, until={}", id, until);
        return ApiResponse.success(null, days + "일간 영업정지 처리되었습니다.");
    }

    @PostMapping("/stores/{id}/ban")
    public ApiResponse<Void> banStore(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        Store store = storeRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Store not found: " + id));
        String reason = body.getOrDefault("reason", "");
        store.ban(reason.isEmpty() ? null : reason);
        storeRepository.save(store);
        auditLogService.logStoreSanction(id, store.getName(), "BAN",
                "영구 폐업 처리" + (reason.isEmpty() ? "" : " / " + reason));
        log.info("Admin banned store: id={}", id);
        return ApiResponse.success(null, "영구 폐업 처리되었습니다.");
    }

    @PostMapping("/stores/{id}/unban")
    public ApiResponse<Void> unbanStore(@PathVariable Long id) {
        Store store = storeRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Store not found: " + id));
        store.unban();
        storeRepository.save(store);
        auditLogService.logStoreSanction(id, store.getName(), "UNBAN", "영업정지 해제");
        log.info("Admin unbanned store: id={}", id);
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
}
