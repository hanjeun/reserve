package kr.it.reserve.notice;

import kr.it.reserve.notice.entity.Notice;
import kr.it.reserve.notice.repository.NoticeRepository;
import kr.it.reserve.notice.service.NoticeService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class NoticeReadBoundaryTest {
    @Test void getNeverWritesAndPostUsesAtomicIncrement() {
        var repository = mock(NoticeRepository.class);
        var service = new NoticeService(repository, mock(MemberRepository.class));
        var notice = Notice.builder().id(1L).author(Member.builder().name("담당자").build()).viewCount(3).build();
        when(repository.findById(1L)).thenReturn(Optional.of(notice));
        assertThat(service.getNoticeById(1L).getViewCount()).isEqualTo(3);
        assertThat(notice.getViewCount()).isEqualTo(3);
        verify(repository, never()).incrementViewCount(any());
        service.recordView(1L);
        verify(repository).incrementViewCount(1L);
    }
}
