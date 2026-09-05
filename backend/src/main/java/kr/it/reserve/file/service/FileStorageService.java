package kr.it.reserve.file.service;

import kr.it.reserve.global.error.FileException;
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
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.time.Duration;
import java.util.UUID;

@Slf4j
@Service
public class FileStorageService {

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

    // ─── 허용 파일 타입 화이트리스트 ────────────────────────────────────────────
    private static final java.util.Set<String> ALLOWED_TYPES = java.util.Set.of(
            "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"
    );
    private static final java.util.Set<String> ALLOWED_EXTS = java.util.Set.of(
            ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"
    );
    private static final long MAX_FILE_BYTES = 10L * 1024 * 1024; // 10 MB

    private void validateFile(MultipartFile file) {
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new FileException("파일 크기는 10MB를 초과할 수 없습니다.",
                    org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE);
        }
        String ct = file.getContentType();
        if (ct == null || !ALLOWED_TYPES.contains(ct.toLowerCase())) {
            throw new FileException("허용되지 않는 파일 형식입니다. (jpg/png/webp/gif/avif 만 허용)",
                    org.springframework.http.HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
        String original = file.getOriginalFilename();
        if (original != null && original.contains(".")) {
            String ext = original.substring(original.lastIndexOf(".")).toLowerCase();
            if (!ALLOWED_EXTS.contains(ext)) {
                throw new FileException("허용되지 않는 파일 확장자입니다.",
                        org.springframework.http.HttpStatus.UNSUPPORTED_MEDIA_TYPE);
            }
        }
    }

    /**
     * S3에 파일 업로드 후 S3 key 반환 (URL이 아닌 key)
     * - Public 파일: getPublicUrl(key) 로 CloudFront URL 생성
     * - Private 파일: getPresignedUrl(key, minutes) 로 임시 URL 생성
     */
    public String storeFile(MultipartFile file, String prefixPath) {
        if (file == null || file.isEmpty()) return null;
        validateFile(file); // 파일 타입 · 확장자 · 크기 검증
        try {
            String ext = "";
            String original = file.getOriginalFilename();
            if (original != null && original.contains(".")) {
                ext = original.substring(original.lastIndexOf("."));
            }
            String fullPrefix = (envPrefix == null || envPrefix.isEmpty())
                    ? prefixPath
                    : envPrefix + "/" + prefixPath;
            String key = fullPrefix + "/" + UUID.randomUUID() + ext;
            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucket).key(key).contentType(file.getContentType()).contentLength(file.getSize()).build();
            s3Client.putObject(request, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
            registerRollbackCleanup(key);
            log.info("S3 upload success: {}", key);
            return key;
        } catch (IOException e) {
            log.error("S3 upload failed", e);
            throw FileException.uploadFailed();
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
     * 업로드된 이미지의 원본 너비/높이를 전체 디코딩 없이 헤더만 파싱해서 읽어온다.
     * 스토어/상세 이미지 업로드 시 원본 비율을 미리 저장해두면 프론트 스켈레톤이 그 비율대로 미리 그려져 CLS를 줄일 수 있다.
     * 측정에 실패해도(지원하지 않는 포맷 등) 업로드 자체는 막지 않고 null 반환해서 호출부가 그냥 생략하게 함.
     */
    public int[] readImageDimensions(MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        try (javax.imageio.stream.ImageInputStream iis = javax.imageio.ImageIO.createImageInputStream(file.getInputStream())) {
            java.util.Iterator<javax.imageio.ImageReader> readers = javax.imageio.ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                log.warn("No ImageReader available for uploaded file");
                return null;
            }
            javax.imageio.ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true); // seekForwardOnly=true — 전체 디코딩 없이 헤더만 읽음
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                return new int[]{width, height};
            } finally {
                reader.dispose();
            }
        } catch (Exception e) {
            log.warn("Failed to read image dimensions: errorType={}", e.getClass().getSimpleName());
            return null;
        }
    }

    /** Public 파일용 CloudFront URL 생성 (프로필, 가게 이미지 등) */
    public String getPublicUrl(String key) {
        if (key == null) return null;
        return "https://" + cloudfrontDomain + "/" + key;
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

        String key;
        if (fileUrlOrKey.startsWith("http")) {
            if (!fileUrlOrKey.contains(cloudfrontDomain)) {
                return;
            }
            key = fileUrlOrKey.substring(
                    fileUrlOrKey.indexOf(cloudfrontDomain) + cloudfrontDomain.length() + 1);
        } else {
            key = fileUrlOrKey;
        }

        s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        log.info("S3 delete success");
    }
}
