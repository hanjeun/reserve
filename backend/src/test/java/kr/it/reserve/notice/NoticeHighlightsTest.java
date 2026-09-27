package kr.it.reserve.notice;

import kr.it.reserve.notice.entity.Notice;
import kr.it.reserve.notice.repository.NoticeRepository;
import kr.it.reserve.notice.service.NoticeService;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NoticeHighlightsTest {

    @Mock NoticeRepository noticeRepository;
    @Mock MemberRepository memberRepository;
    @InjectMocks NoticeService noticeService;

    @Test
    void clampsPublicHighlightsAndDoesNotExposeContent() {
        Notice notice = Notice.builder()
                .id(7L)
                .title("운영 안내")
                .content("목록에는 내려가면 안 되는 긴 본문")
                .isImportant(true)
                .build();
        when(noticeRepository.findHighlights(org.mockito.ArgumentMatchers.any(Pageable.class)))
                .thenReturn(List.of(notice));

        var result = noticeService.getHighlights(99);

        verify(noticeRepository).findHighlights(argThat(pageable -> pageable.getPageSize() == 5));
        assertThat(result).singleElement().satisfies(summary -> {
            assertThat(summary.getId()).isEqualTo(7L);
            assertThat(summary.getTitle()).isEqualTo("운영 안내");
            assertThat(summary.getIsImportant()).isTrue();
        });
    }
}
