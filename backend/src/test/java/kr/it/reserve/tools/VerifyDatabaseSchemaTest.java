package kr.it.reserve.tools;

import kr.it.reserve.config.oauth2.events.OAuthSecurityEventRecord;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.outbox.OAuthUnlinkTask;
import kr.it.reserve.member.entity.Member;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

class VerifyDatabaseSchemaTest {
    @TempDir
    Path temporary;

    @Test
    void releaseScanIncludesOAuthEntitiesOutsideEntityDirectories() throws Exception {
        Path release = temporary.resolve("outside-entity.jar");
        try (var output = new JarOutputStream(Files.newOutputStream(release))) {
            for (Class<?> type : new Class<?>[]{OAuthSecurityEventRecord.class, OAuthSubjectSecurity.class, OAuthUnlinkTask.class, VerifyDatabaseSchema.class}) {
                String resource = type.getName().replace('.', '/') + ".class";
                output.putNextEntry(new JarEntry("BOOT-INF/classes/" + resource));
                try (var input = type.getClassLoader().getResourceAsStream(resource)) {
                    input.transferTo(output);
                }
                output.closeEntry();
            }
        }
        var registry = registry();
        try {
            var sources = new MetadataSources(registry);
            assertThat(VerifyDatabaseSchema.addReleaseModels(sources, release)).isEqualTo(3);
            var metadata = sources.buildMetadata();
            assertThat(metadata.getEntityBinding(OAuthSecurityEventRecord.class.getName())).isNotNull();
            assertThat(metadata.getEntityBinding(OAuthSubjectSecurity.class.getName())).isNotNull();
            assertThat(metadata.getEntityBinding(OAuthUnlinkTask.class.getName())).isNotNull();
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    @Test
    void currentMappingsAndTokenConverterCanBuildWithoutSpringOrDatabaseAccess() throws Exception {
        Path classes = Path.of(Member.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        Path release = temporary.resolve("current-mappings.jar");
        try (var output = new JarOutputStream(Files.newOutputStream(release)); var paths = Files.walk(classes)) {
            for (Path entry : paths.filter(path -> Files.isRegularFile(path) && path.toString().endsWith(".class")).toList()) {
                output.putNextEntry(new JarEntry("BOOT-INF/classes/" + classes.relativize(entry).toString().replace('\\', '/')));
                Files.copy(entry, output);
                output.closeEntry();
            }
            try (var mapping = Member.class.getClassLoader().getResourceAsStream("META-INF/orm.xml")) {
                if (mapping != null) {
                    output.putNextEntry(new JarEntry("META-INF/orm.xml"));
                    mapping.transferTo(output);
                    output.closeEntry();
                }
            }
        }
        var registry = registry();
        try {
            var sources = new MetadataSources(registry);
            assertThat(VerifyDatabaseSchema.addReleaseModels(sources, release)).isGreaterThan(2);
            try (var factory = sources.buildMetadata().buildSessionFactory()) {
                assertThat(factory.getMetamodel().entity(Member.class)).isNotNull();
                assertThat(factory.getMetamodel().entity(OAuthSecurityEventRecord.class)).isNotNull();
                assertThat(factory.getMetamodel().entity(OAuthSubjectSecurity.class)).isNotNull();
                assertThat(factory.getMetamodel().entity(OAuthUnlinkTask.class)).isNotNull();
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    private static org.hibernate.boot.registry.StandardServiceRegistry registry() {
        return new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", "org.hibernate.dialect.MySQLDialect")
                .applySetting("hibernate.boot.allow_jdbc_metadata_access", "false")
                .applySetting("hibernate.hbm2ddl.auto", "none")
                .applySetting("hibernate.physical_naming_strategy", "org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy")
                .build();
    }
}
