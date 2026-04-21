package com.reserve.store.service;

import com.reserve.global.error.FileException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
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

    @Value("${cloud.aws.s3.bucket}")
    private String bucket;

    @Value("${cloud.aws.cloudfront.domain}")
    private String cloudfrontDomain;

    @Value("${cloud.aws.region.static}")
    private String region;

    @Value("${cloud.aws.credentials.access-key}")
    private String accessKey;

    @Value("${cloud.aws.credentials.secret-key}")
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
     */
    public String storeFile(MultipartFile file) {
        if (file == null || file.isEmpty()) return null;

        try {
            String ext = "";
            String original = file.getOriginalFilename();
            if (original != null && original.contains(".")) {
                ext = original.substring(original.lastIndexOf("."));
            }
            String key = "uploads/" + UUID.randomUUID() + ext;

            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(file.getContentType())
                    .contentLength(file.getSize())
                    .build();

            s3Client.putObject(request, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
            log.info("S3 업로드 성공: {}", key);

            // CloudFront URL 반환
            return "https://" + cloudfrontDomain + "/" + key;

        } catch (IOException e) {
            log.error("S3 업로드 실패", e);
            throw new FileException("파일을 저장하는 중 서버에 오류가 발생했습니다.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * S3에서 파일 삭제
     */
    public void deleteFile(String fileUrl) {
        if (fileUrl == null || fileUrl.isEmpty()) return;

        // 소셜 로그인 이미지 등 외부 URL은 삭제하지 않음
        if (!fileUrl.contains(cloudfrontDomain) && !fileUrl.startsWith("/uploads/")) return;

        try {
            // CloudFront URL → S3 key 추출
            // ex) https://cdn.reserve.it.kr/uploads/xxx.jpg → uploads/xxx.jpg
            String key;
            if (fileUrl.startsWith("https://")) {
                key = fileUrl.substring(fileUrl.indexOf("/", 8) + 1);
            } else {
                // 레거시 로컬 경로 (/uploads/xxx.jpg) 대응
                key = "uploads/" + fileUrl.substring(fileUrl.lastIndexOf("/") + 1);
            }

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