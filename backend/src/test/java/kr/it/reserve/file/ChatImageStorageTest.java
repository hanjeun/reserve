package kr.it.reserve.file;

import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.FileException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import java.io.ByteArrayInputStream;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatImageStorageTest {
    private final S3Client s3 = mock(S3Client.class);
    private FileStorageService storage() {
        var storage = new FileStorageService();
        ReflectionTestUtils.setField(storage, "s3Client", s3);
        ReflectionTestUtils.setField(storage, "bucket", "test-bucket");
        ReflectionTestUtils.setField(storage, "envPrefix", "local");
        return storage;
    }
    @Test void encryptedObjectsUseScopedKeysAndNeverPublicCacheMetadata() {
        var storage = storage();
        String key = storage.storeEncryptedChatImage(new byte[32], "users/1/chat/10");
        assertThat(key).startsWith("local/users/1/chat/10/").endsWith(".bin");
        verify(s3).putObject(argThat((PutObjectRequest request) -> "no-store".equals(request.cacheControl())
                && "application/octet-stream".equals(request.contentType())), any(RequestBody.class));
        clearInvocations(s3);
        assertThatThrownBy(() -> storage.readEncryptedChatImage(key, "users/2/chat/10")).isInstanceOf(FileException.class);
        assertThatThrownBy(() -> storage.readEncryptedChatImage("users/1/chat/10/file.bin", "users/1/chat/10"))
                .isInstanceOf(FileException.class);
        verifyNoInteractions(s3);
    }
    @Test void oversizedStreamIsAbortedWithoutReadingItsBody() throws Exception {
        var input = spy(new ByteArrayInputStream(new byte[1]));
        var stream = spy(new ResponseInputStream<>(GetObjectResponse.builder().contentLength(9L * 1024 * 1024).build(), input));
        when(s3.getObject(any(GetObjectRequest.class))).thenReturn(stream);
        var storage = storage();
        assertThatThrownBy(() -> storage.readEncryptedChatImage("local/users/1/chat/10/photo.bin", "users/1/chat/10"))
                .isInstanceOf(FileException.class);
        verify(stream).abort();
        verify(input, never()).readNBytes(anyInt());
    }
    @Test void boundedStreamStillRejectsActualOversizeIfMetadataIsMissing() {
        var stream = spy(new ResponseInputStream<>(GetObjectResponse.builder().build(),
                new ByteArrayInputStream(new byte[8 * 1024 * 1024 + 29])));
        when(s3.getObject(any(GetObjectRequest.class))).thenReturn(stream);
        var storage = storage();
        assertThatThrownBy(() -> storage.readEncryptedChatImage("local/users/1/chat/10/photo.bin", "users/1/chat/10"))
                .isInstanceOf(FileException.class);
        verify(stream).abort();
    }
}
