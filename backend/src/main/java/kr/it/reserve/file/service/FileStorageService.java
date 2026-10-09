package kr.it.reserve.file.service;

import kr.it.reserve.global.error.FileException;
import kr.it.reserve.file.util.ImageFileValidator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.io.IOException;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
public class FileStorageService {

    private static final Set<String> MANAGED_ROOTS = Set.of("users", "notices", "system");
    private static final String HTTPS_PREFIX = "https://";

    @Value("${s3.bucket}")
    private String bucket;

    @Value("${s3.cloudfront}")
    private String cloudfrontDomain;

    @Value("${s3.region}")
    private String region;

    @Value("${s3.access-key}")
    private String accessKey;

    @Value("${s3.secret-key}")
    private String secretKey;

    /**
     * 환경별 S3 경로 prefix
     * - 운영: "" (env-prefix 없음) → users/1/profiles/xxx.jpg
     * - 로컬: "local"             → local/users/1/profiles/xxx.jpg
     */
    @Value("${s3.env-prefix:}")
    private String envPrefix;

    private S3Client s3Client;
    private S3Presigner s3Presigner;

    @PostConstruct
    public void init() {
        StaticCredentialsProvider credentials = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(accessKey, secretKey));
        Region awsRegion = Region.of(region);
        this.s3Client = S3Client.builder().region(awsRegion).credentialsProvider(credentials).build();
        this.s3Presigner = S3Presigner.builder().region(awsRegion).credentialsProvider(credentials).build();
    }

    /**
     * S3에 파일 업로드 후 S3 key 반환 (URL이 아닌 key)
     * - Public 파일: getPublicUrl(key) 로 CloudFront URL 생성
     * - Private 파일: getPresignedUrl(key, minutes) 로 임시 URL 생성
     */
    public String storeFile(MultipartFile file, String prefixPath) {
        if (file == null || file.isEmpty()) return null;
        ImageFileValidator.ValidatedImage image = ImageFileValidator.inspect(file);
        try {
            String fullPrefix = (envPrefix == null || envPrefix.isEmpty())
                    ? prefixPath
                    : envPrefix + "/" + prefixPath;
            String key = fullPrefix + "/" + UUID.randomUUID() + image.extension();
            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucket).key(key).contentType(image.contentType()).contentLength((long) image.bytes().length)
                    .cacheControl(prefixPath.matches("users/\\d+/businesses") ? "no-store" : "public, max-age=86400, must-revalidate")
                    .build();
            s3Client.putObject(request, RequestBody.fromBytes(image.bytes()));
            registerRollbackCleanup(key);
            log.info("S3 upload success: {}", key);
            return key;
        } catch (RuntimeException exception) {
            log.error("S3 upload failed: errorType={}", exception.getClass().getSimpleName());
            throw FileException.uploadFailed();
        }
    }

    /** 대화 사진 암호문 전용. 일반 이미지 업로드/공개 URL 경로와 섞지 않는다. */
    public String storeEncryptedChatImage(byte[] encrypted, String prefixPath) {
        if (encrypted == null || encrypted.length == 0
                || encrypted.length > ImageFileValidator.MAX_FILE_BYTES + 28
                || prefixPath == null || !prefixPath.matches("users/\\d+/chat/\\d+")) {
            throw FileException.invalid("올바른 대화 사진이 아니에요.");
        }
        String key = withEnvironmentPrefix(prefixPath) + "/" + UUID.randomUUID() + ".bin";
        try {
            s3Client.putObject(PutObjectRequest.builder().bucket(bucket).key(key)
                    .contentType("application/octet-stream").cacheControl("no-store")
                    .contentLength((long) encrypted.length).build(), RequestBody.fromBytes(encrypted));
            registerRollbackCleanup(key);
            return key;
        } catch (RuntimeException exception) {
            log.error("Chat image upload failed: errorType={}", exception.getClass().getSimpleName());
            throw FileException.uploadFailed();
        }
    }

    /** 객체를 읽기 전에 현재 환경·발신자·방 경계를 검증하고, 8 MiB + GCM overhead에서 중단한다. */
    public byte[] readEncryptedChatImage(String key, String prefixPath) {
        if (prefixPath == null || !prefixPath.matches("users/\\d+/chat/\\d+") || !isManagedFileUnderPrefix(key, prefixPath)) {
            throw FileException.invalid("올바른 대화 사진이 아니에요.");
        }
        int limit = (int) ImageFileValidator.MAX_FILE_BYTES + 28;
        try (var stream = s3Client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())) {
            if (stream.response().contentLength() != null && stream.response().contentLength() > limit) {
                stream.abort();
                throw FileException.invalid("사진 크기가 허용 범위를 초과했어요.");
            }
            byte[] bytes = stream.readNBytes(limit + 1);
            if (bytes.length > limit) {
                stream.abort(); // close만 호출하면 HTTP 클라이언트가 남은 대용량 본문을 drain할 수 있다.
                throw FileException.invalid("사진 크기가 허용 범위를 초과했어요.");
            }
            return bytes;
        } catch (IOException | software.amazon.awssdk.core.exception.SdkException exception) {
            log.error("Chat image read failed: errorType={}", exception.getClass().getSimpleName());
            throw new FileException("사진을 불러오지 못했어요.");
        }
    }

    /**
     * S3 업로드는 DB 트랜잭션에 참여하지 않으므로, 현재 트랜잭션이 롤백되면 방금 만든 객체를 보상 삭제한다.
     *
     * <p>상세 이미지 병렬 업로드처럼 다른 스레드에서 업로드한 경우에는 그 스레드에 트랜잭션 문맥이 없다.
     * 호출측이 결과를 join한 뒤 이 메서드를 다시 호출하면 바깥 트랜잭션에 cleanup을 등록할 수 있다.
     */
    public void registerRollbackCleanup(String fileUrlOrKey) {
        if (fileUrlOrKey == null || fileUrlOrKey.isBlank()
                || !TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == TransactionSynchronization.STATUS_COMMITTED) return;
                try {
                    deleteFileRequired(fileUrlOrKey);
                } catch (RuntimeException e) {
                    log.error("S3 rollback cleanup failed: errorType={}", e.getClass().getSimpleName());
                }
            }
        });
    }

    /**
     * 업로드 전에 검증된 이미지의 원본 너비/높이를 읽는다.
     * 스토어/상세 이미지 업로드 시 원본 비율을 미리 저장해두면 프론트 스켈레톤이 그 비율대로 미리 그려져 CLS를 줄일 수 있다.
     * 비어 있는 선택 입력은 null이고, 변조·손상·과대 이미지는 ImageFileValidator가 업로드 전에 거부한다.
     */
    public int[] readImageDimensions(MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        return ImageFileValidator.readDimensions(file);
    }

    /** Public 파일용 CloudFront URL 생성 (프로필, 가게 이미지 등) */
    public String getPublicUrl(String key) {
        if (key == null) return null;
        return HTTPS_PREFIX + cloudfrontDomain + "/" + key;
    }

    /**
     * Private 파일용 Pre-signed URL 생성 (사업자 등록증 등)
     * expirationMinutes 이후 자동 만료
     */
    public String getPresignedUrl(String key, int expirationMinutes) {
        if (key == null || key.isEmpty()) return null;
        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(expirationMinutes))
                .getObjectRequest(r -> r.bucket(bucket).key(key))
                .build();
        String url = s3Presigner.presignGetObject(presignRequest).url().toString();
        log.info("Pre-signed URL generated: key={}, expires={}min", key, expirationMinutes);
        return url;
    }

    /**
     * S3에서 파일 삭제
     * - CloudFront URL: key 추출 후 삭제 (기존 데이터 호환)
     * - S3 key: 바로 삭제
     * - 외부 URL (소셜 로그인 이미지 등): 자동 스킵
     */
    public void deleteFile(String fileUrlOrKey) {
        if (fileUrlOrKey == null || fileUrlOrKey.isEmpty()) return;
        try {
            deleteFileRequired(fileUrlOrKey);
        } catch (Exception e) {
            log.error("S3 delete failed: errorType={}", e.getClass().getSimpleName());
        }
    }

    /**
     * 재시도 가능한 삭제함 전용 경로. 실패를 삼키지 않아 호출측이 FAILED 상태로 남길 수 있게 한다.
     * 외부 소셜 프로필 URL은 관리 대상이 아니므로 성공적인 no-op으로 취급한다.
     */
    public void deleteFileRequired(String fileUrlOrKey) {
        if (fileUrlOrKey == null || fileUrlOrKey.isEmpty()) return;

        String key = resolveManagedKey(fileUrlOrKey);
        if (key == null) {
            log.warn("S3 delete skipped: target is outside the managed environment boundary");
            return;
        }

        s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        log.info("S3 delete success");
    }

    /**
     * URL 또는 key가 현재 환경의 특정 저장 경로 아래에 있는지 확인한다.
     *
     * <p>가게 수정처럼 클라이언트가 기존 이미지 URL을 다시 보내는 경로는 단순히
     * "우리 CloudFront URL인가"만 확인하면 안 된다. 호출측이 소유자·가게 ID로 만든
     * {@link kr.it.reserve.file.util.FileStoragePaths} prefix를 넘겨 같은 리소스 경계까지 확인한다.
     */
    public boolean isManagedFileUnderPrefix(String fileUrlOrKey, String expectedPrefix) {
        String key = resolveManagedKey(fileUrlOrKey);
        String scopedPrefix = withEnvironmentPrefix(expectedPrefix);
        return key != null
                && scopedPrefix != null
                && key.startsWith(scopedPrefix + "/");
    }

    /** 현재 환경에서 이 서비스가 만든 URL/key만 canonical S3 key로 바꾼다. */
    private String resolveManagedKey(String fileUrlOrKey) {
        if (fileUrlOrKey == null || fileUrlOrKey.isBlank()) return null;

        String value = fileUrlOrKey.trim();
        String key;
        if (value.regionMatches(true, 0, "http://", 0, 7)
                || value.regionMatches(true, 0, HTTPS_PREFIX, 0, 8)) {
            key = keyFromCloudfrontUrl(value);
        } else {
            if (value.contains("://")) return null;
            key = value;
        }

        if (!isSafeObjectKey(key)) return null;

        String environment = normalizedEnvironmentPrefix();
        String withoutEnvironment = key;
        if (!environment.isEmpty()) {
            String requiredPrefix = environment + "/";
            if (!key.startsWith(requiredPrefix)) return null;
            withoutEnvironment = key.substring(requiredPrefix.length());
        }

        int firstSlash = withoutEnvironment.indexOf('/');
        if (firstSlash <= 0 || !MANAGED_ROOTS.contains(withoutEnvironment.substring(0, firstSlash))) {
            return null;
        }
        return key;
    }

    private String keyFromCloudfrontUrl(String value) {
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getUserInfo() != null
                    || uri.getPort() != -1
                    || uri.getQuery() != null
                    || uri.getFragment() != null
                    || uri.getHost() == null
                    || !uri.getHost().equalsIgnoreCase(configuredCloudfrontHost())) {
                return null;
            }
            String rawPath = uri.getRawPath();
            if (rawPath == null || rawPath.length() <= 1 || rawPath.charAt(0) != '/') return null;
            return rawPath.substring(1);
        } catch (Exception exception) {
            return null;
        }
    }

    private String configuredCloudfrontHost() {
        if (cloudfrontDomain == null || cloudfrontDomain.isBlank()) return "";
        try {
            String value = cloudfrontDomain.trim();
            URI uri = new URI(value.contains("://") ? value : HTTPS_PREFIX + value);
            return uri.getHost() != null ? uri.getHost() : "";
        } catch (Exception exception) {
            return "";
        }
    }

    private String withEnvironmentPrefix(String prefix) {
        if (!isSafeObjectKey(prefix)) return null;
        String environment = normalizedEnvironmentPrefix();
        return environment.isEmpty() ? prefix : environment + "/" + prefix;
    }

    private String normalizedEnvironmentPrefix() {
        if (envPrefix == null) return "";
        String value = envPrefix.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private boolean isSafeObjectKey(String key) {
        if (key == null || key.isBlank()
                || key.startsWith("/")
                || key.endsWith("/")
                || key.contains("\\")
                || key.contains("//")
                || key.contains("%")
                || key.contains("?")
                || key.contains("#")) {
            return false;
        }
        for (String segment : key.split("/", -1)) {
            if (segment.isBlank() || ".".equals(segment) || "..".equals(segment)) return false;
        }
        return true;
    }
}
