package kr.it.reserve.config.oauth2;

import kr.it.reserve.member.entity.Member;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OAuthProviderTokenMetadataTest {
    @Test
    void metadataOnlyToolsCanInstantiateTheConverterWithoutSpringOrASecret() {
        StandardServiceRegistry registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", "org.hibernate.dialect.H2Dialect")
                .applySetting("hibernate.boot.allow_jdbc_metadata_access", false)
                .applySetting("hibernate.hbm2ddl.auto", "none").build();
        try (var sessionFactory = new MetadataSources(registry).addAnnotatedClass(Member.class)
                .buildMetadata().buildSessionFactory()) {
            assertThatThrownBy(() -> new OAuthProviderTokenConverter().convertToDatabaseColumn("token"))
                    .isInstanceOf(IllegalStateException.class).hasMessage("OAuth provider token converter is not configured");
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }
}
