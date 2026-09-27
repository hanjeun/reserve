package kr.it.reserve.chat.service;

import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import kr.it.reserve.chat.repository.ChatReportAccessAuditRepository;
import kr.it.reserve.global.error.ChatException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ChatReportAuditService {
    private final ChatReportAccessAuditRepository audits;

    /** 외부 조회의 readOnly 트랜잭션과 분리한다. 감사 저장 실패 시 원문 응답도 실패한다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Member admin, Long reportId, Long messageId, ChatReportAccessAudit.Action action) {
        if (admin == null || admin.getId() == null || admin.getRole() != Role.ADMIN)
            throw new ChatException("접근 권한이 없습니다.", HttpStatus.FORBIDDEN);
        audits.save(new ChatReportAccessAudit(reportId, admin.getId(), messageId, action));
    }
}
