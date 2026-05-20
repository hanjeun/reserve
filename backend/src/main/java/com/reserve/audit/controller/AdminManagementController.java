package com.reserve.audit.controller;

import com.reserve.audit.service.AuditLogService;
import com.reserve.global.common.ApiResponse;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.MemberStatus;
import com.reserve.member.repository.MemberRepository;
import com.reserve.store.dto.StoreResponse;
import com.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

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

    // ── 회원 소프트 삭제 ──────────────────────────────────────────

    @DeleteMapping("/members/{id}")
    public ApiResponse<Void> softDeleteMember(@PathVariable Long id) {
        log.info("Admin soft-delete member: id={}", id);
        auditLogService.softDeleteMember(id);
        return ApiResponse.success(null, "회원이 휴지통으로 이동되었습니다.");
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

    // ── 가게 소프트 삭제 ──────────────────────────────────────────

    @DeleteMapping("/stores/{id}")
    public ApiResponse<Void> softDeleteStore(@PathVariable Long id) {
        log.info("Admin soft-delete store: id={}", id);
        auditLogService.softDeleteStore(id);
        return ApiResponse.success(null, "가게가 휴지통으로 이동되었습니다.");
    }

    // ── 예약 소프트 삭제 ──────────────────────────────────────────

    @DeleteMapping("/reservations/{id}")
    public ApiResponse<Void> softDeleteReservation(@PathVariable Long id) {
        log.info("Admin soft-delete reservation: id={}", id);
        auditLogService.softDeleteReservation(id);
        return ApiResponse.success(null, "예약이 휴지통으로 이동되었습니다.");
    }
}
