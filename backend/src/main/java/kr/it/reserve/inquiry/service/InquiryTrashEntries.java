package kr.it.reserve.inquiry.service;

import kr.it.reserve.global.error.AuditException;
import kr.it.reserve.global.trash.ReceivedInquiryTrash;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class InquiryTrashEntries implements ReceivedInquiryTrash {
    private final InquiryRepository inquiries;

    @Override
    public void restore(Long id) {
        if (inquiries.restoreTrashed(id) == 0) throw AuditException.notFound("복구할 문의를 찾을 수 없어요.");
    }

    @Override
    public void purge(Long id) {
        inquiries.deleteTrashed(id);
    }
}
