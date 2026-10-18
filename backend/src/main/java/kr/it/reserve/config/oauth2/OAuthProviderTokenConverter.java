package kr.it.reserve.config.oauth2;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Hibernate의 SpringBeanContainer를 통해 전용 키를 주입받는다. 기존 평문은 읽기 호환한다. */
@Component
@Converter
public class OAuthProviderTokenConverter implements AttributeConverter<String, String> {
    private final OAuthProviderTokenCipher cipher;

    /** Spring 없이 스키마 메타데이터만 검사하는 운영 도구용. 실제 토큰 변환은 허용하지 않는다. */
    public OAuthProviderTokenConverter() { cipher = null; }

    @Autowired
    public OAuthProviderTokenConverter(OAuthProviderTokenCipher cipher) { this.cipher = cipher; }

    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null) return null;
        requireCipher();
        return cipher.encryptForStorage(attribute);
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;
        requireCipher();
        return cipher.decryptFromStorage(dbData);
    }

    private void requireCipher() {
        if (cipher == null) throw new IllegalStateException("OAuth provider token converter is not configured");
    }
}
