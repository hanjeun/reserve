package kr.it.reserve.file.service;

import kr.it.reserve.file.util.ImageFileValidator;
import kr.it.reserve.global.error.FileException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;

/** 로컬 프로필의 피드 암호문만 저장한다. 공개 URL과 기존 S3 객체는 이 저장소로 옮기지 않는다. */
@Component
public class LocalFeedImageStore {
    private static final String NAMESPACE = "local-feed/";
    private static final String KEY_PATTERN = "local-feed/users/\\d+/feed/images/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.bin";
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
        return owns(key) && prefix != null && prefix.matches("users/\\d+/feed/images")
                && key.startsWith(NAMESPACE + prefix + "/");
    }

    public String store(byte[] encrypted, String prefix) {
        if (!enabled || prefix == null || !prefix.matches("users/\\d+/feed/images")
                || encrypted == null || encrypted.length < 28 || encrypted.length > LIMIT) {
            throw FileException.invalid("올바른 로컬 피드 사진이 아니에요.");
        }
        String key = NAMESPACE + prefix + "/" + UUID.randomUUID() + ".bin";
        Path target = resolve(key);
        boolean created = false;
        try {
            Files.createDirectories(target.getParent());
            rejectLinks(target);
            try (var stream = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                created = true;
                stream.write(encrypted);
            }
            return key;
        } catch (IOException exception) {
            // 실패한 새 파일만 보상 삭제한다. 기존 객체를 덮어쓰거나 폴더를 재귀 삭제하지 않는다.
            try { if (created && !Files.isSymbolicLink(target)) Files.deleteIfExists(target); }
            catch (IOException ignored) { /* 업로드 실패 파일은 생성된 UUID 경로에 격리한다. */ }
            throw FileException.uploadFailed();
        }
    }

    public byte[] read(String key, String prefix) {
        if (!underPrefix(key, prefix)) throw FileException.invalid("올바른 로컬 피드 사진이 아니에요.");
        Path target = resolve(key);
        try (var stream = Files.newInputStream(target, LinkOption.NOFOLLOW_LINKS)) {
            byte[] bytes = stream.readNBytes(LIMIT + 1);
            if (bytes.length < 28 || bytes.length > LIMIT) throw FileException.invalid("사진 크기가 허용 범위를 벗어났어요.");
            return bytes;
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
