package kr.it.reserve.inquiry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.Session;
import jakarta.mail.Multipart;
import jakarta.mail.internet.MimeMessage;
import kr.it.reserve.config.ApiPaths;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.file.repository.SupportMailPhotoRepository;
import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.global.error.InquiryException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.inquiry.entity.Inquiry;
import kr.it.reserve.inquiry.repository.InquiryRepository;
import kr.it.reserve.mailbox.repository.AdminSentMailRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.MailSendException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1",
        "spring.datasource.url=jdbc:h2:mem:resend-inbound;MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000",
        "mail.resend-inbound.enabled=true",
        "mail.resend-inbound.recipient=support@example.test",
        "mail.resend-inbound.signing-secret=whsec_MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        "mail.from=system@example.test"
})
@AutoConfigureMockMvc
class ResendInboundFlowTest {
    private static final byte[] SIGNING_KEY = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII);
    private static final String SUPPORT = "support@example.test";
    private static final String SENDER = "sender@example.test";
    private static final String MESSAGE_ID = "<original@example.test>";
    private static final String ADMIN_LIST = "/api/inquiries/admin/all";
    private static final String RESPONSE = "확인했어요.";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired InquiryRepository inquiries;
    @Autowired AdminSentMailRepository sentMail;
    @Autowired MemberRepository members;
    @Autowired SupportMailPhotoRepository photos;
    @Autowired TokenProvider tokens;
    @LocalServerPort int port;
    @MockitoBean ResendReceivedMailClient client;
    @MockitoBean JavaMailSender mailSender;
    @MockitoBean EmailService emailService;
    @MockitoBean RateLimiter limiter;

    @BeforeEach
    void allowRequests() {
        when(limiter.tryConsume(anyString(), any(RateLimiter.Policy.class))).thenReturn(true);
    }

    @Test
    void validDeliveryIsVisibleOnlyToAdminAndReplyKeepsTheThread() throws Exception {
        UUID id = UUID.randomUUID();
        byte[] body = envelope(id, SUPPORT, "손님 <" + SENDER + ">");
        when(client.retrieve(id)).thenReturn(Optional.of(mapper.createObjectNode().put("text", "합성 지원 문의")));

        mvc.perform(signed(ApiPaths.RESEND_INBOUND, body)).andExpect(status().isOk());
        mvc.perform(signed("/api/v1/inquiries/inbound/resend", body)).andExpect(status().isOk());
        verify(client).retrieve(id);
        verifyNoInteractions(mailSender);
        Inquiry saved = inquiry(id);

        mvc.perform(get(ADMIN_LIST)).andExpect(status().isUnauthorized());
        mvc.perform(get(ADMIN_LIST).with(actor(Role.USER))).andExpect(status().isForbidden());
        mvc.perform(get(ADMIN_LIST).param("search", SENDER).with(actor(Role.ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value(saved.getId()))
                .andExpect(jsonPath("$.data.content[0].inboundEmail").value(true))
                .andExpect(jsonPath("$.data.content[0].memberEmail").value(SENDER))
                .andExpect(jsonPath("$.data.content[0].content").value("합성 지원 문의"));

        MimeMessage mail = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(mail);
        mvc.perform(reply(saved.getId(), Role.USER)).andExpect(status().isForbidden());
        mvc.perform(reply(saved.getId(), Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ANSWERED"));
        mvc.perform(reply(saved.getId(), Role.ADMIN)).andExpect(status().isConflict());

        verify(mailSender).send(mail);
        assertThat(mail.getSubject()).isEqualTo("Re: 합성 문의");
        assertThat(mail.getAllRecipients()).extracting(Object::toString).containsExactly(SENDER);
        assertThat(mail.getReplyTo()).extracting(Object::toString).containsExactly(SUPPORT);
        assertThat(mail.getHeader("In-Reply-To", null)).isEqualTo(MESSAGE_ID);
        assertThat(mail.getHeader("References", null)).isEqualTo(MESSAGE_ID);
        assertThat(sentMail.findAll()).anyMatch(sent -> sent.getToEmail().equals(SENDER) && sent.getBody().equals(RESPONSE));
    }

    @Test
    void inquiryPreviewRendersTheDeliveryTemplateWithoutWritingOrSending() throws Exception {
        when(emailService.buildInquiryAlertContent(anyString(), anyString(), anyString(), anyString(), anyString())).thenCallRealMethod();
        long inquiryCount = inquiries.count();
        long photoCount = photos.count();
        String request = mapper.writeValueAsString(Map.of("category", "ETC", "title", "합성 <script> 제목",
                "content", "첫 줄\n둘째 줄", "guestName", "합성", "guestEmail", SENDER));
        for (String path : List.of("/api/inquiries/preview", "/api/v1/inquiries/preview")) {
            String result = mvc.perform(post(path).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(request))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
            String html = mapper.readTree(result).at("/data/html").asText();
            assertThat(html).isEqualTo(new EmailService(mailSender).buildInquiryAlertContent(
                    "합성 (비회원)", SENDER, "기타 문의", "합성 <script> 제목", "첫 줄\n둘째 줄"));
            assertThat(html).contains("RESERVE", "새 문의", "관리자 패널", "&lt;script&gt;", "첫 줄<br>둘째 줄");
        }
        assertThat(inquiries.count()).isEqualTo(inquiryCount);
        assertThat(photos.count()).isEqualTo(photoCount);
        verifyNoInteractions(mailSender, client);
        verify(limiter, never()).tryConsume(anyString(), eq(RateLimiter.Policy.INQUIRY_CREATE));
    }

    @Test
    void mailPreviewKeepsAdminAuthorizationAndDoesNotSendOrSave() throws Exception {
        String request = mapper.writeValueAsString(Map.of("toEmail", SENDER, "subject", "합성 제목", "body", "합성 <b>본문</b>"));
        long before = sentMail.count();
        mvc.perform(post("/api/admin/mail/preview").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/mail/preview").with(actor(Role.USER)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(request)).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/mail/preview").with(actor(Role.ADMIN)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(request)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.html").value(org.hamcrest.Matchers.containsString("합성 &lt;b&gt;본문&lt;/b&gt;")))
                .andExpect(jsonPath("$.data.html").value(org.hamcrest.Matchers.containsString("RESERVE. All rights reserved.")));
        assertThat(sentMail.count()).isEqualTo(before);
        verifyNoInteractions(mailSender, client);
        verify(limiter, never()).tryConsume(anyString(), eq(RateLimiter.Policy.ADMIN_MAIL_SEND));
    }

    @Test
    void previewLimitAndInvalidInputStopBeforeRendering() throws Exception {
        String request = mapper.writeValueAsString(Map.of("category", "ETC", "title", "합성", "content", "문의",
                "guestName", "합성", "guestEmail", SENDER));
        when(limiter.tryConsume(anyString(), eq(RateLimiter.Policy.MAIL_PREVIEW))).thenReturn(false);
        mvc.perform(post("/api/inquiries/preview").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isTooManyRequests());
        when(limiter.tryConsume(anyString(), eq(RateLimiter.Policy.MAIL_PREVIEW))).thenReturn(true);
        mvc.perform(post("/api/inquiries/preview").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(request.replace("ETC", "INVALID"))).andExpect(status().isBadRequest());
        verifyNoInteractions(emailService, mailSender, client);
    }

    @Test
    void rejectsTamperingAndStaleSignaturesAndIgnoresMailForOtherAddresses() throws Exception {
        UUID id = UUID.randomUUID();
        byte[] body = envelope(id, SUPPORT, SENDER);
        mvc.perform(signed(ApiPaths.RESEND_INBOUND, body).content(envelope(id, SUPPORT, "other@example.test")))
                .andExpect(status().isUnauthorized());
        mvc.perform(signed(ApiPaths.RESEND_INBOUND, body, Instant.now().minusSeconds(301).getEpochSecond()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(ApiPaths.RESEND_INBOUND).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(ApiPaths.RESEND_INBOUND).contentType(MediaType.APPLICATION_JSON).content(new byte[256 * 1024 + 1]))
                .andExpect(status().isPayloadTooLarge());
        mvc.perform(signed(ApiPaths.RESEND_INBOUND, envelope(id, "elsewhere@example.test", SENDER)))
                .andExpect(status().isOk());
        mvc.perform(signed(ApiPaths.RESEND_INBOUND, envelope(id, SUPPORT, "system@example.test")))
                .andExpect(status().isOk());
        assertThat(inquiries.existsByResendEmailId(id.toString())).isFalse();
        verifyNoInteractions(client, mailSender);
    }

    @Test
    void retriesTemporaryFailureAndStoresHtmlMailAsText() throws Exception {
        UUID id = UUID.randomUUID();
        byte[] body = envelope(id, SUPPORT, "html@example.test");
        when(client.retrieve(id))
                .thenThrow(new InquiryException("Synthetic provider failure", HttpStatus.SERVICE_UNAVAILABLE))
                .thenReturn(Optional.of(mapper.createObjectNode().put("html",
                        "<html><head><title>hidden title</title></head><body><p>예약 &amp; 일정</p>"
                                + "<script>hidden script</script><img src='https://example.test/pixel'><p>확인</p></body></html>")));
        mvc.perform(signed(ApiPaths.RESEND_INBOUND, body)).andExpect(status().isServiceUnavailable());
        assertThat(inquiries.existsByResendEmailId(id.toString())).isFalse();
        mvc.perform(signed(ApiPaths.RESEND_INBOUND, body)).andExpect(status().isOk());
        assertThat(inquiry(id).getContent()).contains("예약 & 일정", "확인").doesNotContain("<", "hidden", "example.test");
        verifyNoInteractions(mailSender);
    }

    @Test
    void parallelRedeliveriesStoreOnlyOneInquiry() throws Exception {
        UUID id = UUID.randomUUID();
        byte[] body = envelope(id, SUPPORT, "duplicate@example.test");
        var bothFetching = new CountDownLatch(2);
        when(client.retrieve(id)).thenAnswer(call -> {
            bothFetching.countDown();
            assertThat(bothFetching.await(5, TimeUnit.SECONDS)).isTrue();
            return Optional.of(mapper.createObjectNode().put("text", "동시 수신 확인"));
        });

        try (var threads = Executors.newFixedThreadPool(2)) {
            var first = threads.submit(() -> mvc.perform(signed(ApiPaths.RESEND_INBOUND, body)).andExpect(status().isOk()));
            var second = threads.submit(() -> mvc.perform(signed(ApiPaths.RESEND_INBOUND, body)).andExpect(status().isOk()));
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        }
        assertThat(inquiries.findAll().stream().filter(inquiry -> id.toString().equals(inquiry.getResendEmailId()))).hasSize(1);
    }

    @Test
    void outboundLimitPreservesPendingStatusWithoutSendingMail() throws Exception {
        UUID id = UUID.randomUUID();
        when(client.retrieve(id)).thenReturn(Optional.of(mapper.createObjectNode().put("text", "발송 한도 확인")));
        mvc.perform(signed(ApiPaths.RESEND_INBOUND, envelope(id, SUPPORT, "limit@example.test"))).andExpect(status().isOk());
        when(limiter.tryConsume("91", RateLimiter.Policy.ADMIN_MAIL_SEND)).thenReturn(false);
        mvc.perform(reply(inquiry(id).getId(), Role.ADMIN)).andExpect(status().isTooManyRequests());
        mvc.perform(post("/api/admin/mail/compose").with(actor(Role.ADMIN)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"toEmail":"reply@example.test","subject":"합성 발송","body":"발송 한도 확인","marketing":false}
                                """))
                .andExpect(status().isTooManyRequests());
        assertThat(inquiry(id).getStatus()).isEqualTo(Inquiry.InquiryStatus.PENDING);
        verifyNoInteractions(mailSender);
    }

    @Test
    void localHttpReceivesRepliesTrashesAndRestoresASyntheticInquiry() throws Exception {
        UUID id = UUID.randomUUID();
        byte[] body = envelope(id, SUPPORT, "local-http@example.test");
        byte[] photo = photoBytes();
        var receivedMail = mapper.createObjectNode().put("text", "로컬 수신 확인");
        var attachments = receivedMail.putArray("attachments");
        attachments.addObject().put("id", UUID.randomUUID().toString());
        when(client.retrieve(id)).thenReturn(Optional.of(receivedMail));
        when(client.retrievePhotos(id, attachments)).thenReturn(List.of(ImageFileValidator.inspect(photo, "image/png", "photo.png")));
        var mail = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(mail);
        Member admin = members.saveAndFlush(Member.builder().email("mailbox-admin-" + id + "@example.test")
                .name("합성 관리자").role(Role.ADMIN).provider(AuthProvider.LOCAL).termsAgreed(true).build());
        String token = tokens.issueVerifiedSession(admin, null, "PASSWORD_MFA").accessToken();

        try (var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
            assertThat(sendWebhook(http, body).statusCode()).isEqualTo(200);
            Inquiry received = inquiry(id);
            String detail = "/api/inquiries/admin/" + received.getId();
            String photoPath = detail + "/photos/" + photos.findInquiryPhotoIds(received.getId()).getFirst();
            var inbox = send(http, local(ADMIN_LIST + "?search=local-http", token).GET());
            assertThat(inbox.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(inbox.body()).at("/data/content/0/inboundEmail").asBoolean()).isTrue();
            var downloaded = http.send(local(photoPath, token).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
            assertThat(downloaded.statusCode()).isEqualTo(200);
            assertThat(downloaded.body()).isEqualTo(photo);

            var reply = send(http, local(detail + "/reply", token)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{\"answer\":\"확인했어요.\"}")));
            assertThat(reply.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(reply.body()).at("/data/status").asText()).isEqualTo("ANSWERED");
            verify(mailSender).send(mail);
            assertThat(mail.getHeader("In-Reply-To", null)).isEqualTo(MESSAGE_ID);

            assertThat(send(http, local(detail, token).DELETE()).statusCode()).isEqualTo(200);
            assertThat(send(http, local(detail, token).DELETE()).statusCode()).isEqualTo(200);
            assertThat(send(http, local(detail, token).GET()).statusCode()).isEqualTo(404);
            assertThat(send(http, local(photoPath, token).GET()).statusCode()).isEqualTo(404);
            var trash = send(http, local("/api/admin/trash?type=RECEIVED_INQUIRY", token).GET());
            assertThat(trash.statusCode()).isEqualTo(200);
            var trashed = mapper.readTree(trash.body()).at("/data/content");
            assertThat(trashed.size()).isEqualTo(1);
            assertThat(trashed.get(0).path("entityId").asLong()).isEqualTo(received.getId());

            assertThat(sendWebhook(http, body).statusCode()).isEqualTo(200);
            verify(client).retrieve(id);
            assertThat(send(http, local(detail, token).GET()).statusCode()).isEqualTo(404);
            String restore = "/api/admin/trash/RECEIVED_INQUIRY/" + received.getId() + "/restore";
            assertThat(send(http, local(restore, token).POST(HttpRequest.BodyPublishers.noBody())).statusCode()).isEqualTo(200);
            var restored = send(http, local(detail, token).GET());
            assertThat(restored.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(restored.body()).at("/data/status").asText()).isEqualTo("ANSWERED");
            assertThat(send(http, local(photoPath, token).GET()).statusCode()).isEqualTo(200);
            assertThat(send(http, local(restore, token).POST(HttpRequest.BodyPublishers.noBody())).statusCode()).isEqualTo(404);
        }
    }

    @Test
    void receivesWebsitePhotosAndSendsTheReplyAsAPrivateMimeAttachment() throws Exception {
        byte[] image = photoBytes();
        var upload = new MockMultipartFile("photos", "inquiry.png", "image/png", image);
        var request = jsonPart("""
                {"category":"ETC","title":"합성 사진 문의","content":"사진을 확인해주세요.",
                 "guestName":"합성 문의자","guestEmail":"photo-inquiry@example.test"}
                """);
        var created = mvc.perform(multipart("/api/inquiries").file(request).file(upload).with(csrf()))
                .andExpect(status().isOk()).andReturn();
        long inquiryId = mapper.readTree(created.getResponse().getContentAsString()).at("/data/id").asLong();
        long photoId = photos.findInquiryPhotoIds(inquiryId).getFirst();
        String path = "/api/inquiries/admin/" + inquiryId + "/photos/" + photoId;
        mvc.perform(get(path).with(actor(Role.USER))).andExpect(status().isForbidden());
        mvc.perform(get(path).with(actor(Role.ADMIN)))
                .andExpect(status().isOk()).andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(content().bytes(image));

        var mail = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(mail);
        long before = sentMail.count();
        long beforePhotos = photos.count();
        doThrow(new MailSendException("Synthetic SMTP failure")).doNothing().when(mailSender).send(mail);
        var answer = jsonPart("{\"answer\":\"확인했어요.\"}");
        mvc.perform(multipart("/api/inquiries/admin/{id}/reply", inquiryId).file(answer).file(upload)
                .with(actor(Role.ADMIN)).with(csrf())).andExpect(status().isInternalServerError());
        assertThat(sentMail.count()).isEqualTo(before);
        assertThat(photos.count()).isEqualTo(beforePhotos);
        assertThat(inquiries.findById(inquiryId).orElseThrow().getStatus()).isEqualTo(Inquiry.InquiryStatus.PENDING);

        mvc.perform(multipart("/api/inquiries/admin/{id}/reply", inquiryId).file(answer).file(upload)
                .with(actor(Role.ADMIN)).with(csrf())).andExpect(status().isOk());
        mail.saveChanges();
        var attachment = ((Multipart) mail.getContent()).getBodyPart(1);
        assertThat(attachment.getFileName()).isEqualTo("photo-1.png");
        try (var content = attachment.getInputStream()) {
            assertThat(content.readAllBytes()).isEqualTo(image);
        }
        var sent = sentMail.findAll().stream().filter(row -> "photo-inquiry@example.test".equals(row.getToEmail())).findFirst().orElseThrow();
        long sentPhoto = photos.findSentPhotoIds(sent.getId()).getFirst();
        mvc.perform(get("/api/admin/mail/sent/{id}/photos/{photoId}", sent.getId(), photoId).with(actor(Role.ADMIN)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/admin/mail/sent/{id}/photos/{photoId}", sent.getId(), sentPhoto).with(actor(Role.ADMIN)))
                .andExpect(status().isOk()).andExpect(content().bytes(image));
    }

    private static MockMultipartFile jsonPart(String json) {
        return new MockMultipartFile("request", "request.json", "application/json", json.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] photoBytes() throws Exception {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png", bytes);
        return bytes.toByteArray();
    }

    private HttpRequest.Builder local(String path, String token) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(8))
                .header("Cookie", "access_token=" + token).header("Origin", "https://reserve.it.kr");
    }

    private HttpResponse<String> sendWebhook(HttpClient http, byte[] body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + ApiPaths.RESEND_INBOUND))
                .timeout(Duration.ofSeconds(8)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArray(body));
        signatureHeaders(body, Instant.now().getEpochSecond()).forEach(request::header);
        return send(http, request);
    }

    private static HttpResponse<String> send(HttpClient http, HttpRequest.Builder request) throws Exception {
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private Inquiry inquiry(UUID id) {
        return inquiries.findAll().stream().filter(row -> id.toString().equals(row.getResendEmailId())).findFirst().orElseThrow();
    }

    private byte[] envelope(UUID id, String receivedFor, String sender) throws Exception {
        var event = mapper.createObjectNode().put("type", "email.received");
        var data = event.putObject("data").put("email_id", id.toString()).put("from", sender)
                .put("subject", "합성 문의").put("message_id", MESSAGE_ID);
        data.putArray("received_for").add(receivedFor);
        data.putArray("to").add(SUPPORT);
        return mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(event);
    }

    private static MockHttpServletRequestBuilder signed(String path, byte[] body) throws Exception {
        return signed(path, body, Instant.now().getEpochSecond());
    }

    private static MockHttpServletRequestBuilder signed(String path, byte[] body, long timestamp) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON).content(body);
        signatureHeaders(body, timestamp).forEach(request::header);
        return request;
    }

    private static Map<String, String> signatureHeaders(byte[] body, long timestamp) throws Exception {
        String id = "msg_" + UUID.randomUUID();
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SIGNING_KEY, "HmacSHA256"));
        mac.update((id + "." + timestamp + ".").getBytes(StandardCharsets.US_ASCII));
        String signature = Base64.getEncoder().encodeToString(mac.doFinal(body));
        return Map.of("svix-id", id, "svix-timestamp", Long.toString(timestamp),
                "svix-signature", "v1,unused v1," + signature);
    }

    private static MockHttpServletRequestBuilder reply(Long id, Role role) {
        return post("/api/inquiries/admin/{id}/reply", id).with(actor(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"answer\":\"" + RESPONSE + "\"}");
    }

    private static RequestPostProcessor actor(Role role) {
        var member = Member.builder().id(91L).role(role).build();
        return authentication(new UsernamePasswordAuthenticationToken(
                member, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
}
