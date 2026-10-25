package kr.it.reserve.store.service;

import kr.it.reserve.store.dto.StoreResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 같은 릴리스의 SPA HTML에 공개 가게의 메타만 넣는다. 화면과 해시 자산은 그대로 둔다. */
@Service
public class StorePageService {
    @Value("#{siteUrls.appOrigin}")
    private String origin = kr.it.reserve.config.SiteUrls.DEFAULT_APP_ORIGIN;
    private static final String META_PROPERTY = "property";
    private static final Set<String> IMAGE_HOSTS = Set.of("cdn.reserve.it.kr", "reserve.it.kr", "app.reserve.it.kr");
    private static final Pattern TITLE = Pattern.compile("<title>[^<]*</title>");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private final StoreService stores;
    private final String shell;

    public StorePageService(StoreService stores,
                            @Value("classpath:store-shell/index.html") Resource resource) throws IOException {
        this.stores = stores;
        this.shell = resource.exists() ? resource.getContentAsString(StandardCharsets.UTF_8) : null;
    }

    public String storePage(Long id) {
        return render(stores.getStore(id));
    }

    public String notFoundPage() {
        return meta(title(requireShell(), "가게를 찾을 수 없어요 | RESERVE"), "name", "robots", "noindex, nofollow");
    }

    String render(StoreResponse store) {
        String pageTitle = shorten(store.getName(), 100) + " | RESERVE";
        String description = shorten(store.getDescription(), 160);
        if (description.isBlank()) description = shorten(store.getName(), 100) + "의 정보를 확인하고 예약하세요.";
        String canonical = origin + "/store/" + store.getId();
        String html = title(requireShell(), pageTitle);
        html = meta(html, "name", "description", description);
        html = meta(html, "name", "robots", "index, follow");
        html = meta(html, META_PROPERTY, "og:title", pageTitle);
        html = meta(html, META_PROPERTY, "og:description", description);
        html = meta(html, META_PROPERTY, "og:url", canonical);
        html = meta(html, META_PROPERTY, "og:image:alt", pageTitle);
        html = meta(html, "name", "twitter:title", pageTitle);
        html = meta(html, "name", "twitter:description", description);
        html = html.replaceAll("(<link\\s+rel=\"canonical\"\\s+href=\")[^\"]*(\"\\s*/?>)",
                "$1" + Matcher.quoteReplacement(canonical) + "$2");
        String image = publicThumbnail(store);
        if (image != null) {
            html = meta(html, META_PROPERTY, "og:image", image);
            html = meta(html, META_PROPERTY, "og:image:secure_url", image);
            html = meta(html, "name", "twitter:image", image);
            html = removeMeta(html, "og:image:type");
            html = imageDimension(html, "og:image:width", store.getMainImageWidth());
            html = imageDimension(html, "og:image:height", store.getMainImageHeight());
        }
        return withImageHint(html, store);
    }

    private String requireShell() {
        if (shell == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Store page shell is unavailable");
        return shell;
    }

    private static String publicThumbnail(StoreResponse store) {
        return publicStoreImage(store.getMainImageUrl(), store.getId(), "thumbnails");
    }

    private static String publicStoreImage(String value, Long storeId, String folder) {
        if (value == null || value.isBlank()) return null;
        try {
            URI uri = new URI(value);
            // 공개 가게의 관리 경로 사진만 사용하며 비공개·서명 URL은 제외한다.
            String path = uri.getPath();
            return "https".equals(uri.getScheme()) && uri.getHost() != null
                    && IMAGE_HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT))
                    && uri.getUserInfo() == null && uri.getPort() == -1
                    && uri.getQuery() == null && uri.getFragment() == null
                    && path != null && !path.contains("\\") && !path.endsWith("/.") && !path.endsWith("/..")
                    && path.equals(uri.normalize().getPath())
                    && path.matches("/users/[0-9]+/stores/" + storeId + "/" + folder + "/[^/]+")
                    ? value : null;
        } catch (URISyntaxException exception) {
            return null;
        }
    }

    private record ImageHint(String url, Integer width, Integer height) {}

    private static ImageHint coverImage(StoreResponse store) {
        if (store.getDetailImageUrls() != null && !store.getDetailImageUrls().isEmpty()) {
            String first = store.getDetailImageUrls().getFirst();
            if (store.getDetailImageMeta() == null) return null;
            for (StoreResponse.ImageMeta meta : store.getDetailImageMeta()) {
                if (meta == null || first == null || !first.equals(meta.getUrl())) continue;
                String url = publicStoreImage(first, store.getId(), "images");
                return url != null && positive(meta.getWidth()) && positive(meta.getHeight())
                        ? new ImageHint(url, meta.getWidth(), meta.getHeight()) : null;
            }
            // 대표 사진 크기를 측정하지 않은 상세 사진의 크기로 사용하지 않는다.
            return null;
        }
        String url = publicThumbnail(store);
        return url != null && positive(store.getMainImageWidth()) && positive(store.getMainImageHeight())
                ? new ImageHint(url, store.getMainImageWidth(), store.getMainImageHeight()) : null;
    }

    private static boolean positive(Integer value) { return value != null && value > 0; }

    private static Double galleryLayoutRatio(StoreResponse store) {
        if (store.getDetailImageUrls() == null || store.getDetailImageUrls().size() < 2
                || store.getDetailImageMeta() == null) return null;
        double ratio = Double.POSITIVE_INFINITY;
        for (String url : store.getDetailImageUrls()) {
            if (publicStoreImage(url, store.getId(), "images") == null) return null;
            StoreResponse.ImageMeta measured = null;
            for (StoreResponse.ImageMeta meta : store.getDetailImageMeta()) {
                if (meta != null && url.equals(meta.getUrl())) { measured = meta; break; }
            }
            if (measured == null || !positive(measured.getWidth()) || !positive(measured.getHeight())) return null;
            ratio = Math.min(ratio, (double) measured.getWidth() / measured.getHeight());
        }
        return ratio;
    }

    private static String withImageHint(String html, StoreResponse store) {
        ImageHint image = coverImage(store);
        if (image == null) return html;
        // 실행 코드나 비공개 DTO가 아닌 메타데이터만 담고 화면에서 가게 ID를 다시 확인한다.
        String hint = """
                <meta name="reserve-store-image-id" content="%s" />
                <meta name="reserve-store-image-url" content="%s" />
                <meta name="reserve-store-image-width" content="%s" />
                <meta name="reserve-store-image-height" content="%s" />
                <link rel="preload" as="image" href="%s" referrerpolicy="no-referrer" fetchpriority="high" />
                """.formatted(store.getId(), escape(image.url()), image.width(), image.height(), escape(image.url()));
        Double layoutRatio = galleryLayoutRatio(store);
        if (layoutRatio != null) {
            // 배치 값은 사진 크기·미리 읽기·OG 메타데이터와 별도로 유지한다.
            hint += "<meta name=\"reserve-store-image-layout-ratio\" content=\"" + layoutRatio + "\" />\n";
        }
        return html.replace("</head>", hint + "</head>");
    }

    private static String title(String html, String value) {
        return TITLE.matcher(html).replaceFirst(Matcher.quoteReplacement("<title>" + escape(value) + "</title>"));
    }

    private static String meta(String html, String attribute, String key, String value) {
        return html.replaceAll("(<meta\\s+" + attribute + "=\"" + Pattern.quote(key) + "\"\\s+content=\")[^\"]*(\"\\s*/?>)",
                "$1" + Matcher.quoteReplacement(escape(value)) + "$2");
    }

    private static String imageDimension(String html, String key, Integer value) {
        return value != null && value > 0 ? meta(html, META_PROPERTY, key, value.toString()) : removeMeta(html, key);
    }

    private static String removeMeta(String html, String key) {
        return html.replaceAll("<meta\\s+property=\"" + Pattern.quote(key) + "\"\\s+content=\"[^\"]*\"\\s*/?>", "");
    }

    private static String shorten(String value, int limit) {
        if (value == null) return "";
        String text = WHITESPACE.matcher(value).replaceAll(" ").trim();
        return text.substring(0, text.offsetByCodePoints(0, Math.min(limit, text.codePointCount(0, text.length()))));
    }

    private static String escape(String value) {
        return HtmlUtils.htmlEscape(value, StandardCharsets.UTF_8.name());
    }
}
