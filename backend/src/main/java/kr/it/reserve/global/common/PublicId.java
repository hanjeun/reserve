package kr.it.reserve.global.common;

import java.util.Locale;
import java.util.regex.Pattern;

public final class PublicId {
    private static final String UUID_V4 = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
    private static final Pattern VALUE = Pattern.compile(UUID_V4);
    public static final String SEGMENT = "/{publicId:" + UUID_V4 + "}";

    private PublicId() {}

    public static String path(String prefix, String value) {
        return value != null && VALUE.matcher(value).matches() ? prefix + value.toLowerCase(Locale.ROOT) : null;
    }
}
