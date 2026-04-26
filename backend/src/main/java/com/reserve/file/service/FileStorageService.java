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

import jakarta.annotation.PostConstruct;
import java.io.IOException;
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

    private S3Client s3Client;

    @PostConstruct
    public void init() {
        this.s3Client = S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKey, secretKey)))
                .build();
    }

    /**
     * S3에 파일 업로드 후 CloudFront URL 반환
     *
     * @param file       업로드할 파일
     * @param prefixPath S3 저장 경로 prefix — FileStoragePaths 유틸로 조합해서 전달
     *                   예: "users/1/profiles", "users/1/stores/5/thumbnails", "notices/3/images"
     * @return CloudFront URL, 파일이 없으면 null
     */
    public String storeFile(MultipartFile file, String prefixPath) {
        if (file == null || file.isEmpty()) return null;

        try {
            String ext = "";
            String original = file.getOriginalFilename();
            if (original != null && original.contains(".")) {
                ext = original.substring(original.lastIndexOf("."));
            }
            String key = prefixPath + "/" + UUID.randomUUID() + ext;

            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(file.getContentType())
                    .contentLength(file.getSize())
                    .build();

            s3Client.putObject(request, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
            log.info("S3 업로드 성공: {}", key);

            return "https://" + cloudfrontDomain + "/" + key;

        } catch (IOException e) {
            log.error("S3 업로드 실패", e);
            throw FileException.uploadFailed();
        }
    }

    /**
     * S3에서 파일 삭제
     * CloudFront URL이 아닌 외부 URL(소셜 로그인 이미지 등)은 자동으로 스킵
     */
    public void deleteFile(String fileUrl) {
        if (fileUrl == null || fileUrl.isEmpty()) return;
        if (!fileUrl.contains(cloudfrontDomain)) return;

        try {
            // https://cdn.reserve.it.kr/users/1/profiles/xxx.jpg → users/1/profiles/xxx.jpg
            String key = fileUrl.substring(fileUrl.indexOf("/", 8) + 1);

            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .build());
            log.info("S3 삭제 성공: {}", key);

        } catch (Exception e) {
            log.error("S3 삭제 실패: {}", fileUrl, e);
        }
    }
}
