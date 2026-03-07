package com.reserve.store.service;

import com.reserve.global.error.FileException; // 새로 만드신 FileException 임포트
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Slf4j
@Service
public class FileStorageService {

    @Value("${file.upload-dir:uploads}")
    private String uploadDir;

    /**
     * 파일 저장 및 URL 반환
     */
    public String storeFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return null;
        }

        try {
            // 1. 업로드 디렉토리 생성 및 확인
            Path uploadPath = Paths.get(uploadDir).toAbsolutePath().normalize();
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }

            // 2. 파일명 생성 (UUID + 원본 확장자)
            String originalFilename = file.getOriginalFilename();
            String extension = "";
            if (originalFilename != null && originalFilename.contains(".")) {
                extension = originalFilename.substring(originalFilename.lastIndexOf("."));
            }
            String filename = UUID.randomUUID() + extension;

            // 3. 파일 저장 (보안을 위해 파일명 검증 추가 권장)
            Path targetLocation = uploadPath.resolve(filename);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            log.info("✅ 파일 저장 성공: {}", filename);

            // 웹에서 접근 가능한 URL 반환
            return "/uploads/" + filename;

        } catch (IOException e) {
            log.error("❌ 파일 저장 중 IO 에러 발생", e);
            throw new FileException("파일을 저장하는 중 서버에 오류가 발생했습니다.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * 파일 삭제
     * storeFile()과 동일한 기준 경로(uploadPath)를 사용해야 경로 불일치 버그를 막을 수 있음
     */
    public void deleteFile(String fileUrl) {
        if (fileUrl == null || fileUrl.isEmpty()) {
            return;
        }

        // 외부 URL(소셜 프로필 이미지 등)은 삭제 대상 아님
        if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
            return;
        }

        try {
            // URL에서 파일명 추출 (예: /uploads/abc.jpg → abc.jpg)
            String filename = fileUrl.substring(fileUrl.lastIndexOf("/") + 1);

            // storeFile()과 동일하게 절대경로로 정규화하여 경로 불일치 방지
            Path uploadPath = Paths.get(uploadDir).toAbsolutePath().normalize();
            Path filePath = uploadPath.resolve(filename).normalize();

            if (Files.exists(filePath)) {
                Files.delete(filePath);
                log.info("✅ 파일 삭제 성공: {}", filename);
            } else {
                log.warn("⚠️ 삭제할 파일이 존재하지 않습니다: {} (경로: {})", fileUrl, filePath);
            }
        } catch (IOException e) {
            log.error("❌ 파일 삭제 실패: {}", fileUrl, e);
        }
    }
}