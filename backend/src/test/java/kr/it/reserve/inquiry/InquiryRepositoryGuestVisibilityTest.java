package kr.it.reserve.inquiry;

import kr.it.reserve.inquiry.entity.Inquiry;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class InquiryRepositoryGuestVisibilityTest {

    @Autowired
    private InquiryRepository inquiryRepository;

    @Test
    @DisplayName("관리자 문의 목록은 member가 없는 비회원 문의도 반환한다")
    void adminListIncludesGuestInquiry() {
        Inquiry guest = inquiryRepository.saveAndFlush(Inquiry.builder()
                .guestName("비회원")
                .guestEmail("guest@example.test")
                .category(Inquiry.InquiryCategory.ETC)
                .title("비회원 문의")
                .content("관리자 목록에서 사라지면 안 됩니다.")
                .build());

        var page = inquiryRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 20));

        assertThat(page.getContent())
                .extracting(Inquiry::getId)
                .contains(guest.getId());
    }
}
