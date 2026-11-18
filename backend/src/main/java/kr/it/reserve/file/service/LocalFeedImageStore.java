package kr.it.reserve.file.service;

import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.file.util.FileStoragePaths;
import kr.it.reserve.global.error.FileException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.function.Supplier;

/** 로컬 프로필에서 피드·리뷰 사진의 암호문을 저장한다. */
@Component
public class LocalFeedImageStore {
    private static final String NAMESPACE = "local-feed/";
    private static final String PREFIX_PATTERN = "users/\\d+/(feed|reviews)/images";
    private static final String UUID_PATTERN = "/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private static final String KEY_PATTERN = NAMESPACE + "(?:" + PREFIX_PATTERN + UUID_PATTERN + "\\.bin"
            + "|users/\\d+/reviews/images" + UUID_PATTERN + "\\.(?:with-thumb|thumb)\\.bin)";
    private static final int LIMIT = (int) ImageFileValidator.MAX_FILE_BYTES + 28;
    private final boolean enabled;
    private final Path root;

    public LocalFeedImageStore(@Value("${feed.media.local-enabled:false}") boolean enabled,
                              @Value("${feed.media.local-directory:}") String directory,
                              Environment environment) {
        this.enabled = enabled;
        if (!enabled) { root = null; return; }
        if (!environment.acceptsProfiles(Profiles.of("local"))
                || environment.acceptsProfiles(Profiles.of("prod", "blue", "green"))) {
            throw new IllegalStateException("Local feed storage requires an exclusively local profile");
        }
        Path configured = directory == null || directory.isBlank() ? null : Path.of(directory).normalize();
        if (configured == null || !configured.isAbsolute() || configured.getParent() == null) {
            throw new IllegalArgumentException("Local feed storage requires an absolute dedicated directory");
        }
        try {
            rejectLinks(configured);
            Files.createDirectories(configured);
            rejectLinks(configured);
            root = configured.toRealPath(LinkOption.NOFOLLOW_LINKS);
        } catch (IOException exception) {
            throw new IllegalStateException("Local feed storage is unavailable", exception);
        }
    }

    public boolean isEnabled() { return enabled; }
    public static boolean isLocalKey(String key) { return key != null && key.matches(KEY_PATTERN); }
    public boolean owns(String key) { return enabled && isLocalKey(key); }

    public boolean underPrefix(String key, String prefix) {
        return owns(key) && prefix != null && prefix.matches(PREFIX_PATTERN)
                && key.startsWith(NAMESPACE + prefix + "/");
    }

    public String store(byte[] encrypted, String prefix) {
        return store(encrypted, prefix, null);
    }

    String store(byte[] encrypted, String prefix, byte[] thumbnail) {
        if (!enabled || prefix == null || !prefix.matches(PREFIX_PATTERN)
                || encrypted == null || encrypted.length < 28 || encrypted.length > LIMIT) {
            throw FileException.invalid("올바른 로컬 피드 사진이 아니에요.");
        }
        String key = NAMESPACE + prefix + "/" + UUID.randomUUID()
                + (thumbnail == null ? ".bin" : FileStoragePaths.REVIEW_IMAGE_WITH_THUMBNAIL);
        String smallKey = FileStoragePaths.reviewThumbnailKey(key);
        if (thumbnail != null && (smallKey == null || thumbnail.length < 28 || thumbnail.length > LIMIT)) {
            throw FileException.invalid("올바른 로컬 리뷰 사진이 아니에요.");
        }
        if (smallKey != null) write(smallKey, thumbnail);
        try { write(key, encrypted); }
        catch (RuntimeException failure) {
            if (smallKey != null) {
                try { delete(smallKey); }
                catch (RuntimeException cleanupFailure) { failure.addSuppressed(cleanupFailure); }
            }
            throw failure;
        }
        return key;
    }

    private void write(String key, byte[] encrypted) {
        Path target = resolve(key);
        boolean created = false;
        try {
            Files.createDirectories(target.getParent());
            rejectLinks(target);
            try (var stream = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                created = true;
                stream.write(encrypted);
            }
        } catch (IOException exception) {
            // 실패한 새 파일만 보상 삭제한다. 기존 객체를 덮어쓰거나 폴더를 재귀 삭제하지 않는다.
            try { if (created && !Files.isSymbolicLink(target)) Files.deleteIfExists(target); }
            catch (IOException ignored) { /* 업로드 실패 파일은 생성된 UUID 경로에 격리한다. */ }
            throw FileException.uploadFailed();
        }
    }

    public byte[] read(String key, String prefix) {
        return read(key, prefix, LIMIT, null);
    }

    byte[] read(String key, String prefix, int limit, Supplier<byte[]> ifMissing) {
        if (!underPrefix(key, prefix)) throw FileException.invalid("올바른 로컬 피드 사진이 아니에요.");
        Path target = resolve(key);
        try (var stream = Files.newInputStream(target, LinkOption.NOFOLLOW_LINKS)) {
            byte[] bytes = stream.readNBytes(limit + 1);
            if (bytes.length < 28 || bytes.length > limit) throw FileException.invalid("사진 크기가 허용 범위를 벗어났어요.");
            return bytes;
        } catch (NoSuchFileException missing) {
            if (ifMissing != null) return ifMissing.get();
            throw new FileException("사진을 불러오지 못했어요.");
        } catch (IOException exception) { throw new FileException("사진을 불러오지 못했어요."); }
    }

    public void delete(String key) {
        Path target = resolve(key);
        try { Files.deleteIfExists(target); }
        catch (IOException exception) { throw new FileException("사진 삭제를 완료하지 못했어요."); }
    }

    private Path resolve(String key) {
        if (!owns(key)) throw FileException.invalid("로컬 피드 사진 저장 경로를 확인해주세요.");
        Path target = root.resolve(key.substring(NAMESPACE.length())).normalize();
        if (!target.startsWith(root)) throw FileException.invalid("올바른 로컬 피드 사진 경로가 아니에요.");
        try { rejectLinks(target); }
        catch (IOException exception) { throw new FileException("로컬 피드 사진 저장소를 사용할 수 없어요."); }
        return target;
    }

    private static void rejectLinks(Path target) throws IOException {
        for (Path path = target; path != null; path = path.getParent()) {
            if (Files.isSymbolicLink(path)) throw new IOException("Symbolic links are not allowed in local feed storage");
            if (Files.exists(path, LinkOption.NOFOLLOW_LINKS)
                    && !path.toRealPath().equals(path.toRealPath(LinkOption.NOFOLLOW_LINKS))) {
                throw new IOException("Redirected paths are not allowed in local feed storage");
            }
        }
    }
}
