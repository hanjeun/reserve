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
    private static final String ORIGIN = "https://reserve.it.kr";
    private static final Set<String> IMAGE_HOSTS = Set.of("cdn.reserve.it.kr", "reserve.it.kr");
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
        String canonical = ORIGIN + "/store/" + store.getId();
        String html = title(requireShell(), pageTitle);
        html = meta(html, "name", "description", description);
        html = meta(html, "name", "robots", "index, follow");
        html = meta(html, "property", "og:title", pageTitle);
        html = meta(html, "property", "og:description", description);
        html = meta(html, "property", "og:url", canonical);
        html = meta(html, "property", "og:image:alt", pageTitle);
        html = meta(html, "name", "twitter:title", pageTitle);
        html = meta(html, "name", "twitter:description", description);
        html = html.replaceAll("(<link\\s+rel=\"canonical\"\\s+href=\")[^\"]*(\"\\s*/?>)",
                "$1" + Matcher.quoteReplacement(canonical) + "$2");
        String image = publicThumbnail(store);
        if (image != null) {
            html = meta(html, "property", "og:image", image);
            html = meta(html, "property", "og:image:secure_url", image);
            html = meta(html, "name", "twitter:image", image);
            html = removeMeta(html, "og:image:type");
            html = imageDimension(html, "og:image:width", store.getMainImageWidth());
            html = imageDimension(html, "og:image:height", store.getMainImageHeight());
        }
        return html;
    }

    private String requireShell() {
        if (shell == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Store page shell is unavailable");
        return shell;
    }

    private static String publicThumbnail(StoreResponse store) {
        String value = store.getMainImageUrl();
        if (value == null || value.isBlank()) return null;
        try {
            URI uri = new URI(value);
            // 채팅·인증 사진이나 서명 쿼리가 공유 수집기에 노출되지 않게 공개 썸네일만 받는다.
            String path = uri.getPath();
            return "https".equals(uri.getScheme()) && uri.getHost() != null
                    && IMAGE_HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT))
                    && uri.getUserInfo() == null && uri.getPort() == -1
                    && uri.getQuery() == null && uri.getFragment() == null
                    && path != null && path.matches("/users/[0-9]+/stores/" + store.getId() + "/thumbnails/[^/]+")
                    ? value : null;
        } catch (URISyntaxException exception) {
            return null;
        }
    }

    private static String title(String html, String value) {
        return TITLE.matcher(html).replaceFirst(Matcher.quoteReplacement("<title>" + escape(value) + "</title>"));
    }

    private static String meta(String html, String attribute, String key, String value) {
        return html.replaceAll("(<meta\\s+" + attribute + "=\"" + Pattern.quote(key) + "\"\\s+content=\")[^\"]*(\"\\s*/?>)",
                "$1" + Matcher.quoteReplacement(escape(value)) + "$2");
    }

    private static String imageDimension(String html, String key, Integer value) {
        return value != null && value > 0 ? meta(html, "property", key, value.toString()) : removeMeta(html, key);
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
