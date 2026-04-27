package com.reserve.file.service;

import com.reserve.global.error.FileException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
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

    /**
     * S3에 파일 업로드 후 S3 key 반환 (URL이 아닌 key)
     * - Public 파일: getPublicUrl(key) 로 CloudFront URL 생성
     * - Private 파일: getPresignedUrl(key, minutes) 로 임시 URL 생성
     */
    public String storeFile(MultipartFile file, String prefixPath) {
        if (file == null || file.isEmpty()) return null;
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
            log.info("S3 upload success: {}", key);
            return key;
        } catch (IOException e) {
            log.error("S3 upload failed", e);
            throw FileException.uploadFailed();
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
            String key;
            if (fileUrlOrKey.startsWith("http")) {
                if (!fileUrlOrKey.contains(cloudfrontDomain)) {
                    log.debug("Skipping external URL: {}", fileUrlOrKey);
                    return;
                }
                key = fileUrlOrKey.substring(
                        fileUrlOrKey.indexOf(cloudfrontDomain) + cloudfrontDomain.length() + 1);
            } else {
                key = fileUrlOrKey;
            }
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
            log.info("S3 delete success: {}", key);
        } catch (Exception e) {
            log.error("S3 delete failed: {}", fileUrlOrKey, e);
        }
    }
}
