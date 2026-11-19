package kr.it.reserve.inquiry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.InquiryException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.UUID;
import java.io.ByteArrayOutputStream;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ResendReceivedMailClientTest {
    private static final UUID EMAIL = UUID.fromString("11fe80d4-b61a-47af-91a2-e7139a198ba1");
    private static final String BASE = "https://api.resend.com/emails/receiving/" + EMAIL;
    private static final String URL = BASE + "?html_format=cid";
    private final RestClient.Builder builder = RestClient.builder();
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final ResendReceivedMailClient client = new ResendReceivedMailClient(new ObjectMapper(), builder, "synthetic-api");

    @Test
    void readsTheRequestedEmailFromTheReceivingApi() {
        server.expect(requestTo(URL)).andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer synthetic-api"))
                .andRespond(withSuccess("{\"id\":\"" + EMAIL + "\",\"text\":\"합성 본문\"}", MediaType.APPLICATION_JSON));
        assertThat(client.retrieve(EMAIL).orElseThrow().path("text").asText()).isEqualTo("합성 본문");
        server.verify();
    }

    @Test
    void providerFailureAndMismatchedIdCanBeRetried() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(requestTo(URL)).andRespond(withSuccess("{\"id\":\"different\"}", MediaType.APPLICATION_JSON));
        for (int i = 0; i < 2; i++) {
            assertThatThrownBy(() -> client.retrieve(EMAIL)).isInstanceOfSatisfying(InquiryException.class,
                    error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        }
        server.verify();
    }

    @Test
    void overlongResponseUsesTheEnvelopeWithoutParsingTheFullBody() {
        server.expect(requestTo(URL)).andRespond(withSuccess("x".repeat(2 * 1024 * 1024 + 1), MediaType.APPLICATION_JSON));
        assertThat(client.retrieve(EMAIL)).isEmpty();
        server.verify();
    }

    @Test
    void downloadsOnlyTheMailPhotoFromTheProviderCdnWithoutSendingTheApiKey() throws Exception {
        var mapper = new ObjectMapper();
        String photo = UUID.randomUUID().toString();
        String other = UUID.randomUUID().toString();
        String download = "https://inbound-cdn.resend.com/" + EMAIL + "/attachments/" + photo + "?signature=synthetic";
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png", bytes);
        var received = mapper.createArrayNode();
        var attachment = received.addObject().put("id", photo).put("size", bytes.size())
                .put("filename", "photo.png").put("content_type", "image/png");
        var outside = attachment.deepCopy().put("id", other);
        received.add(outside);
        var listing = mapper.createObjectNode();
        listing.putArray("data").add(outside.deepCopy().put("download_url", "https://example.invalid/photo.png"))
                .add(attachment.deepCopy().put("download_url", download));
        server.expect(requestTo(BASE + "/attachments")).andExpect(header("Authorization", "Bearer synthetic-api"))
                .andRespond(withSuccess(mapper.writeValueAsString(listing), MediaType.APPLICATION_JSON));
        server.expect(requestTo(download)).andExpect(headerDoesNotExist("Authorization"))
                .andRespond(withSuccess(bytes.toByteArray(), MediaType.IMAGE_PNG));
        assertThat(client.retrievePhotos(EMAIL, received)).singleElement().satisfies(photoData -> {
            assertThat(photoData.contentType()).isEqualTo("image/png");
            assertThat(photoData.bytes()).isEqualTo(bytes.toByteArray());
        });
        server.verify();
    }
}
