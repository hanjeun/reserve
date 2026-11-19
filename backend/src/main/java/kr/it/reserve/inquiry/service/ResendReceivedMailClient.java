package kr.it.reserve.inquiry.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.file.service.SupportMailPhotos;
import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.file.util.ImageFileValidator.ValidatedImage;
import kr.it.reserve.global.error.FileException;
import kr.it.reserve.global.error.InquiryException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Component
@ConditionalOnProperty(name = "mail.resend-inbound.enabled", havingValue = "true")
public class ResendReceivedMailClient {
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private final RestClient client;
    private final RestClient downloads;
    private final ObjectMapper mapper;

    @Autowired
    public ResendReceivedMailClient(ObjectMapper mapper, @Value("${mail.resend-inbound.api-key}") String apiKey) {
        this(mapper, clientBuilder(), apiKey);
    }

    ResendReceivedMailClient(ObjectMapper mapper, RestClient.Builder builder, String apiKey) {
        if (apiKey.isBlank()) throw new IllegalStateException("A Resend receiving API key is required");
        this.mapper = mapper;
        this.downloads = builder.clone().build();
        this.client = builder.baseUrl("https://api.resend.com")
                .defaultHeaders(headers -> headers.setBearerAuth(apiKey)).build();
    }

    Optional<JsonNode> retrieve(UUID emailId) {
        Optional<JsonNode> mail = readJson(client.get().uri("/emails/receiving/{id}?html_format=cid", emailId));
        if (mail.isPresent() && !emailId.toString().equalsIgnoreCase(mail.get().path("id").asText())) {
            throw unavailable();
        }
        return mail;
    }

    List<ValidatedImage> retrievePhotos(UUID emailId, JsonNode attachments) {
        Set<String> allowedIds = new HashSet<>();
        for (JsonNode attachment : attachments) {
            if (eligible(attachment)) allowedIds.add(attachment.path("id").asText());
            if (allowedIds.size() == SupportMailPhotos.MAX_PHOTOS) break;
        }
        if (allowedIds.isEmpty()) return List.of();

        JsonNode listing = readJson(client.get().uri("/emails/receiving/{id}/attachments", emailId))
                .orElseThrow(ResendReceivedMailClient::unavailable);
        JsonNode items = listing.path("data");
        if (!items.isArray()) throw unavailable();
        List<ValidatedImage> photos = new ArrayList<>();
        for (JsonNode item : items) {
            String attachmentId = item.path("id").asText();
            if (!allowedIds.remove(attachmentId) || !eligible(item)) continue;
            URI url = attachmentUrl(item.path("download_url").asText(), emailId, attachmentId);
            if (url == null) continue;
            byte[] bytes = downloadPhoto(url);
            if (bytes.length == 0 || bytes.length > SupportMailPhotos.MAX_PHOTO_BYTES) continue;
            try {
                photos.add(ImageFileValidator.inspect(bytes, item.path("content_type").asText(), item.path("filename").asText()));
            } catch (FileException unsupported) {
                // 사진으로 판별되지 않은 첨부는 보관하지 않고 문의 본문은 접수한다.
            }
        }
        return photos;
    }

    private static boolean eligible(JsonNode attachment) {
        long size = attachment.path("size").asLong(-1);
        return size > 0 && size <= SupportMailPhotos.MAX_PHOTO_BYTES
                && SupportMailPhotos.supportedType(attachment.path("content_type").asText());
    }

    private static URI attachmentUrl(String value, UUID emailId, String attachmentId) {
        try {
            if (!UUID.fromString(attachmentId).toString().equalsIgnoreCase(attachmentId)) return null;
            URI uri = URI.create(value);
            String path = "/" + emailId + "/attachments/" + attachmentId;
            if ("https".equalsIgnoreCase(uri.getScheme()) && "inbound-cdn.resend.com".equalsIgnoreCase(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null && uri.getFragment() == null
                    && path.equals(uri.getRawPath())) return uri;
        } catch (IllegalArgumentException invalid) {
            return null;
        }
        return null;
    }

    private byte[] downloadPhoto(URI url) {
        try {
            return downloads.get().uri(url).exchange((request, response) -> {
                if (!response.getStatusCode().is2xxSuccessful()) throw unavailable();
                if (response.getHeaders().getContentLength() > SupportMailPhotos.MAX_PHOTO_BYTES) return new byte[0];
                return response.getBody().readNBytes(SupportMailPhotos.MAX_PHOTO_BYTES + 1);
            });
        } catch (RestClientException failure) {
            throw unavailable();
        }
    }

    private Optional<JsonNode> readJson(RestClient.RequestHeadersSpec<?> request) {
        try {
            return request.accept(MediaType.APPLICATION_JSON).exchange((outbound, response) -> {
                if (!response.getStatusCode().is2xxSuccessful()) throw unavailable();
                byte[] body = response.getBody().readNBytes(MAX_RESPONSE_BYTES + 1);
                if (body.length > MAX_RESPONSE_BYTES) return Optional.empty();
                JsonNode mail = mapper.readTree(body);
                if (mail == null || !mail.isObject()) throw unavailable();
                return Optional.of(mail);
            });
        } catch (RestClientException failure) {
            throw unavailable();
        }
    }

    private static RestClient.Builder clientBuilder() {
        var factory = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(HttpURLConnection connection, String method) throws IOException {
                super.prepareConnection(connection, method);
                connection.setInstanceFollowRedirects(false);
            }
        };
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(4));
        return RestClient.builder().requestFactory(factory);
    }

    private static InquiryException unavailable() {
        return new InquiryException("수신 메일을 불러오지 못했어요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
