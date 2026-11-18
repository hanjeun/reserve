package kr.it.reserve.store.util;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public final class StorePublicImage {
    private static final Set<String> IMAGE_HOSTS = Set.of("cdn.reserve.it.kr", "reserve.it.kr", "app.reserve.it.kr");

    private StorePublicImage() {}

    public static String thumbnail(String value, Long storeId) {
        return thumbnail(value, storeId, "");
    }

    public static String thumbnail(String value, Long storeId, String environment) {
        return published(value, storeId, "thumbnails", environment);
    }

    public static String detail(String value, Long storeId) {
        return published(value, storeId, "images", "");
    }

    private static String published(String value, Long storeId, String folder, String environment) {
        if (value == null || value.isBlank() || storeId == null || storeId <= 0) return null;
        try {
            URI uri = new URI(value);
            String path = uri.getPath();
            String namespace = environment.isBlank() ? "" : "/" + Pattern.quote(environment.strip());
            // 같은 가게의 공개 사진 경로만 사용하며 서명 URL을 제외한다.
            return "https".equals(uri.getScheme()) && uri.getHost() != null
                    && IMAGE_HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT))
                    && uri.getUserInfo() == null && uri.getPort() == -1
                    && uri.getQuery() == null && uri.getFragment() == null
                    && path != null && !path.contains("\\") && !path.endsWith("/.") && !path.endsWith("/..")
                    && path.equals(uri.normalize().getPath())
                    && path.matches(namespace + "/users/[0-9]+/stores/" + storeId + "/" + folder + "/[^/]+")
                    ? value : null;
        } catch (URISyntaxException exception) {
            return null;
        }
    }
}
