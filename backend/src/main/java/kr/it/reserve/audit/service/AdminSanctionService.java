package kr.it.reserve.audit.service;

import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** 제재 상태 변경과 감사로그 저장을 같은 트랜잭션으로 묶는 쓰기 관문. */
@Service
@RequiredArgsConstructor
@Slf4j
public class AdminSanctionService {

    private final MemberRepository memberRepository;
    private final StoreRepository storeRepository;
    private final AuditLogService auditLogService;

    @Transactional
    public void suspendMember(Long id, int days, String rawReason) {
        validateDays(days);
        Member member = memberRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(MemberException::notFound);
        requireSanctionable(member);
        String reason = normalize(rawReason);
        LocalDateTime until = LocalDateTime.now().plusDays(days);
        member.suspend(until, reason);
        auditLogService.logMemberSanction(id, member.getEmail(), "SUSPEND",
                days + "일 정지" + suffix(reason));
        log.info("Admin suspended member: id={}, until={}", id, until);
    }

    @Transactional
    public void banMember(Long id, String rawReason) {
        Member member = memberRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(MemberException::notFound);
        requireSanctionable(member);
        String reason = normalize(rawReason);
        member.ban(reason);
        auditLogService.logMemberSanction(id, member.getEmail(), "BAN",
                "영구 정지" + suffix(reason));
        log.info("Admin banned member: id={}", id);
    }

    @Transactional
    public void unbanMember(Long id) {
        Member member = memberRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(MemberException::notFound);
        member.unban();
        auditLogService.logMemberSanction(id, member.getEmail(), "UNBAN", "정지 해제");
        log.info("Admin unbanned member: id={}", id);
    }

    @Transactional
    public void suspendStore(Long id, int days, String rawReason) {
        validateDays(days);
        Store store = findOpenStore(id);
        String reason = normalize(rawReason);
        LocalDateTime until = LocalDateTime.now().plusDays(days);
        store.suspend(until, reason);
        auditLogService.logStoreSanction(id, store.getName(), "SUSPEND",
                days + "일 영업정지" + suffix(reason));
        log.info("Admin suspended store: id={}, until={}", id, until);
    }

    @Transactional
    public void banStore(Long id, String rawReason) {
        Store store = findOpenStore(id);
        String reason = normalize(rawReason);
        store.ban(reason);
        auditLogService.logStoreSanction(id, store.getName(), "BAN",
                "영구 정지" + suffix(reason));
        log.info("Admin banned store: id={}", id);
    }

    @Transactional
    public void unbanStore(Long id) {
        Store store = findOpenStore(id);
        store.unban();
        auditLogService.logStoreSanction(id, store.getName(), "UNBAN", "영업정지 해제");
        log.info("Admin unbanned store: id={}", id);
    }

    private Store findOpenStore(Long id) {
        Store store = storeRepository.findById(id).orElseThrow(StoreException::notFound);
        if (store.isDeleted()) throw StoreException.notFound();
        return store;
    }

    private void requireSanctionable(Member member) {
        if (member.isAdmin()) {
            throw new MemberException("관리자는 제재할 수 없습니다.");
        }
    }

    private void validateDays(int days) {
        if (days < 1 || days > 3650) {
            throw new MemberException("정지 기간은 1일 이상 3650일 이하여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    private String normalize(String reason) {
        if (reason == null || reason.isBlank()) return null;
        String trimmed = reason.trim();
        return trimmed.length() <= 200 ? trimmed : trimmed.substring(0, 200);
    }

    private String suffix(String reason) {
        return reason == null ? "" : " / " + reason;
    }
}
