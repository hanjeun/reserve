package kr.it.reserve.inquiry;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import kr.it.reserve.inquiry.entity.Inquiry;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class InquiryRepositoryGuestVisibilityTest {

    @Autowired
    private InquiryRepository inquiryRepository;
    @Autowired private MemberRepository members;
    @Autowired private AdminSentMailRepository sentMail;
    @Autowired private MockMvc mvc;
    @MockitoBean private JavaMailSender mailSender;

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

    @Test
    void adminMailboxSearchIncludesGuestsAndRejectsOtherRoles() throws Exception {
        Inquiry guest = inquiryRepository.saveAndFlush(guest("검색용 문의").build());
        String inbox = "/api/inquiries/admin/all";
        mvc.perform(get(inbox).with(as(Role.USER)).param("search", "검색용")).andExpect(status().isForbidden());
        mvc.perform(get(inbox).with(as(Role.ADMIN)).param("search", "guest-mailbox@example.test"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content[0].id").value(guest.getId()))
                .andExpect(jsonPath("$.data.content[0].status").value("PENDING"));
        mvc.perform(get(inbox).with(as(Role.ADMIN)).param("search", "%"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content").isEmpty());
    }

    @Test
    void adminReplySendsToTheRegisteredAddressAndOnlyOnce() throws Exception {
        Member member = members.saveAndFlush(Member.builder().name("문의 회원").email("member-mailbox@example.test").build());
        Inquiry inquiry = inquiryRepository.saveAndFlush(guest("회원 문의").member(member).build());
        MimeMessage email = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(email);

        mvc.perform(reply(inquiry, Role.BUSINESS)).andExpect(status().isForbidden());
        verifyNoInteractions(mailSender);
        mvc.perform(reply(inquiry, Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ANSWERED"));
        mvc.perform(reply(inquiry, Role.ADMIN)).andExpect(status().isConflict());

        verify(mailSender).send(email);
        assertThat(email.getAllRecipients()).extracting(Object::toString).containsExactly(member.getEmail());
        assertThat(sentMail.findByDeletedAtIsNullOrderBySentAtDesc(PageRequest.of(0, 20)).getContent())
                .anyMatch(sent -> sent.getToEmail().equals(member.getEmail()) && sent.getBody().equals("확인했어요."));
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void aFailedSendLeavesTheInquiryPending() throws Exception {
        Inquiry inquiry = inquiryRepository.saveAndFlush(guest("발송 실패 확인").build());
        MimeMessage email = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(email);
        doThrow(new MailSendException("Synthetic failure")).when(mailSender).send(any(MimeMessage.class));
        long sentBefore = sentMail.count();

        try {
            mvc.perform(reply(inquiry, Role.ADMIN)).andExpect(status().is5xxServerError());

            assertThat(email.getAllRecipients()).extracting(Object::toString).containsExactly(inquiry.getGuestEmail());
            assertThat(inquiryRepository.findById(inquiry.getId()).orElseThrow().getStatus())
                    .isEqualTo(Inquiry.InquiryStatus.PENDING);
            assertThat(sentMail.count()).isEqualTo(sentBefore);
        } finally {
            inquiryRepository.deleteById(inquiry.getId());
        }
    }

    private static Inquiry.InquiryBuilder guest(String title) {
        return Inquiry.builder().guestName("문의 손님").guestEmail("guest-mailbox@example.test")
                .category(Inquiry.InquiryCategory.ETC).title(title).content("합성 문의 내용");
    }

    private static RequestPostProcessor as(Role role) {
        var user = Member.builder().id(9L).role(role).build();
        return authentication(new UsernamePasswordAuthenticationToken(user, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    private static MockHttpServletRequestBuilder reply(Inquiry inquiry, Role role) {
        return post("/api/inquiries/admin/{id}/reply", inquiry.getId()).with(as(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"answer\":\"확인했어요.\"}");
    }
}
