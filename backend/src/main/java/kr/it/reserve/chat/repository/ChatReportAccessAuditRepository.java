package kr.it.reserve.chat.repository;
import kr.it.reserve.chat.entity.ChatReportAccessAudit;
import org.springframework.data.repository.Repository;

/** 갱신·삭제 메서드는 노출하지 않는다. */
public interface ChatReportAccessAuditRepository extends Repository<ChatReportAccessAudit, Long> {
    ChatReportAccessAudit save(ChatReportAccessAudit audit);
}
