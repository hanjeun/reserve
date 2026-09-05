package kr.it.reserve.file;

import kr.it.reserve.file.service.FileStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FileStorageTransactionCompensationTest {

    private FileStorageService fileStorageService;
    private S3Client s3Client;

    @BeforeEach
    void setUp() {
        fileStorageService = new FileStorageService();
        s3Client = mock(S3Client.class);
        ReflectionTestUtils.setField(fileStorageService, "bucket", "test-bucket");
        ReflectionTestUtils.setField(fileStorageService, "cloudfrontDomain", "cdn.example.test");
        ReflectionTestUtils.setField(fileStorageService, "envPrefix", "test");
        ReflectionTestUtils.setField(fileStorageService, "s3Client", s3Client);
        when(s3Client.putObject(
                any(software.amazon.awssdk.services.s3.model.PutObjectRequest.class),
                any(software.amazon.awssdk.core.sync.RequestBody.class)))
                .thenReturn(PutObjectResponse.builder().build());
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("DB 트랜잭션이 롤백되면 방금 업로드한 S3 객체를 보상 삭제한다")
    void deletesNewObjectAfterRollback() {
        String key = fileStorageService.storeFile(image(), "users/1/profiles");

        complete(TransactionSynchronization.STATUS_ROLLED_BACK);

        assertThat(key).startsWith("test/users/1/profiles/").endsWith(".png");
        verify(s3Client).deleteObject(any(DeleteObjectRequest.class));
    }

    @Test
    @DisplayName("DB 트랜잭션이 커밋되면 새 S3 객체를 유지한다")
    void keepsNewObjectAfterCommit() {
        fileStorageService.storeFile(image(), "users/1/profiles");

        complete(TransactionSynchronization.STATUS_COMMITTED);

        verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
    }

    private MockMultipartFile image() {
        return new MockMultipartFile(
                "image", "profile.png", "image/png", new byte[]{1, 2, 3});
    }

    private void complete(int status) {
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(synchronization -> synchronization.afterCompletion(status));
    }
}
