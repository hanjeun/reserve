package kr.it.reserve.config;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Pattern;

/** 기존 API와 v1의 라우팅·보안 경로를 같은 규칙으로 확장한다. */
public final class ApiPaths {
    public static final String LEGACY_PREFIX = "/api";
    public static final String V1_PREFIX = "/api/v1";
    private static final Pattern VERSION_SEGMENT = Pattern.compile("v[0-9]+");

    private ApiPaths() {
    }

    public static String[] withV1Aliases(String... paths) {
        Set<String> aliases = new LinkedHashSet<>();
        for (String path : paths) {
            aliases.add(path);
            if (isLegacyApiPath(path)) {
                aliases.add(V1_PREFIX + path.substring(LEGACY_PREFIX.length()));
            }
        }
        return aliases.toArray(String[]::new);
    }

    public static boolean matchesAlias(String path, String legacyPath) {
        return legacyPath.equals(path)
                || (isLegacyApiPath(legacyPath)
                && (V1_PREFIX + legacyPath.substring(LEGACY_PREFIX.length())).equals(path));
    }

    public static boolean isUnsupportedVersion(String path) {
        String version = firstApiSegment(path);
        return VERSION_SEGMENT.matcher(version).matches() && !"v1".equals(version);
    }

    private static boolean isLegacyApiPath(String path) {
        return (LEGACY_PREFIX.equals(path) || path.startsWith(LEGACY_PREFIX + "/"))
                && !VERSION_SEGMENT.matcher(firstApiSegment(path)).matches();
    }

    private static String firstApiSegment(String path) {
        if (!path.startsWith(LEGACY_PREFIX + "/")) return "";
        int start = LEGACY_PREFIX.length() + 1;
        int end = path.indexOf('/', start);
        return path.substring(start, end < 0 ? path.length() : end);
    }
}
