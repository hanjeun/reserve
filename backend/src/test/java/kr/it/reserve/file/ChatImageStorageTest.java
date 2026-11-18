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

    @Test void companionIsPrivateAndDeletedWithTheOriginal() {
        var storage = storage();
        String prefix = "users/1/chat/10";
        String key = storage.storeEncryptedChatImage(new byte[90], new byte[32], prefix);
        String previewKey = key.replace(".with-thumb.bin", ".thumb.bin");
        var order = inOrder(s3);
        order.verify(s3).putObject(argThat((PutObjectRequest request) -> request.key().equals(previewKey)
                && "no-store".equals(request.cacheControl())), any(RequestBody.class));
        order.verify(s3).putObject(argThat((PutObjectRequest request) -> request.key().equals(key)), any(RequestBody.class));

        when(s3.getObject(any(GetObjectRequest.class))).thenReturn(new ResponseInputStream<>(
                GetObjectResponse.builder().contentLength(32L).build(), new ByteArrayInputStream(new byte[32])));
        assertThat(storage.readEncryptedChatThumbnail(key, prefix, () -> { throw new AssertionError(); })).hasSize(32);
        verify(s3).getObject(argThat((GetObjectRequest request) -> request.key().equals(previewKey)));
        verify(s3, never()).getObject(argThat((GetObjectRequest request) -> request.key().equals(key)));

        storage.deleteFileRequired(key);
        order.verify(s3).deleteObject(argThat((DeleteObjectRequest request) -> request.key().equals(previewKey)));
        order.verify(s3).deleteObject(argThat((DeleteObjectRequest request) -> request.key().equals(key)));
    }

    @Test void restoredOriginalRemainsReadableWhenItsCompanionIsMissing() {
        var storage = storage();
        var key = "local/users/1/chat/10/29ae9dd3-f295-4d57-9c05-a95cf1f17db4.with-thumb.bin";
        when(s3.getObject(any(GetObjectRequest.class))).thenThrow(NoSuchKeyException.builder().statusCode(404).build());
        byte[] fallback = new byte[40];
        assertThat(storage.readEncryptedChatThumbnail(key, "users/1/chat/10", () -> fallback)).isEqualTo(fallback);
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
    @Test void reusesOnlyCiphertextAfterPrefixValidationAndInvalidatesDeletedObjects() {
        var storage = storage();
        String key = "local/users/1/chat/10/photo.bin";
        when(s3.getObject(any(GetObjectRequest.class))).thenAnswer(invocation -> new ResponseInputStream<>(
                GetObjectResponse.builder().contentLength(3L).build(), new ByteArrayInputStream(new byte[] {1, 2, 3})));
        byte[] original = storage.readEncryptedChatImage(key, "users/1/chat/10");
        original[0] = 99;
        assertThat(storage.readEncryptedChatImage(key, "users/1/chat/10")).containsExactly(1, 2, 3);
        verify(s3, times(1)).getObject(any(GetObjectRequest.class));
        assertThatThrownBy(() -> storage.readEncryptedChatImage(key, "users/2/chat/10")).isInstanceOf(FileException.class);
        storage.deleteFileRequired(key);
        storage.readEncryptedChatImage(key, "users/1/chat/10");
        verify(s3, times(2)).getObject(any(GetObjectRequest.class));
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
