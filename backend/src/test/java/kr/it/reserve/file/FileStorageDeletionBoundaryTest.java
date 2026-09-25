package kr.it.reserve.file;

import kr.it.reserve.file.service.FileStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class FileStorageDeletionBoundaryTest {

    private FileStorageService fileStorageService;
    private S3Client s3Client;

    @BeforeEach
    void setUp() {
        fileStorageService = new FileStorageService();
        s3Client = mock(S3Client.class);
        ReflectionTestUtils.setField(fileStorageService, "bucket", "test-bucket");
        ReflectionTestUtils.setField(fileStorageService, "cloudfrontDomain", "cdn.example.test");
        ReflectionTestUtils.setField(fileStorageService, "envPrefix", "local");
        ReflectionTestUtils.setField(fileStorageService, "s3Client", s3Client);
    }

    @Test
    @DisplayName("현재 환경의 정확한 CloudFront URL만 canonical key로 삭제한다")
    void deletesOnlyExactCloudfrontHostInCurrentEnvironment() {
        fileStorageService.deleteFileRequired(
                "https://cdn.example.test/local/users/1/stores/7/images/image.png");

        org.mockito.ArgumentCaptor<DeleteObjectRequest> request =
                org.mockito.ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3Client).deleteObject(request.capture());
        assertThat(request.getValue().key())
                .isEqualTo("local/users/1/stores/7/images/image.png");
    }

    @Test
    @DisplayName("호스트 경로에 CloudFront 도메인을 끼운 외부 URL은 삭제하지 않는다")
    void rejectsLookalikeCloudfrontUrl() {
        fileStorageService.deleteFileRequired(
                "https://attacker.example/cdn.example.test/local/users/1/stores/7/images/image.png");

        verify(s3Client, never()).deleteObject(org.mockito.ArgumentMatchers.any(DeleteObjectRequest.class));
    }

    @Test
    @DisplayName("로컬 환경 자격 증명으로 prefix 없는 운영 key를 삭제하지 않는다")
    void rejectsProductionKeyFromPrefixedEnvironment() {
        fileStorageService.deleteFileRequired("users/1/stores/7/images/image.png");

        verify(s3Client, never()).deleteObject(org.mockito.ArgumentMatchers.any(DeleteObjectRequest.class));
    }

    @Test
    @DisplayName("상위 경로 이동과 URL 인코딩이 들어간 key를 삭제하지 않는다")
    void rejectsAmbiguousObjectKeys() {
        fileStorageService.deleteFileRequired(
                "local/users/1/stores/7/images/../8/images/image.png");
        fileStorageService.deleteFileRequired(
                "https://cdn.example.test/local/users/1/stores/7/images/%2e%2e/secret.png");

        verify(s3Client, never()).deleteObject(org.mockito.ArgumentMatchers.any(DeleteObjectRequest.class));
    }

    @Test
    @DisplayName("같은 환경이어도 소유자와 가게 prefix가 다르면 관리 파일로 인정하지 않는다")
    void checksResourceSpecificPrefix() {
        String ownImage = "https://cdn.example.test/local/users/1/stores/7/images/image.png";

        assertThat(fileStorageService.isManagedFileUnderPrefix(
                ownImage, "users/1/stores/7/images")).isTrue();
        assertThat(fileStorageService.isManagedFileUnderPrefix(
                ownImage, "users/1/stores/8/images")).isFalse();
        assertThat(fileStorageService.isManagedFileUnderPrefix(
                ownImage, "users/1/stores/7/thumbnails")).isFalse();
    }
}
