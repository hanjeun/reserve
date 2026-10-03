package kr.it.reserve.tools;

import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.MappedSuperclass;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.jar.JarFile;

/** Validate a release's entity schema without starting Spring, schedulers, or business integrations. */
class VerifyDatabaseSchema {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Expected the release JAR path");
        String user = required("DB_USERNAME");
        if (!"reserve_app".equals(user)) throw new IllegalArgumentException("Use the restricted app account");
        Map<String, Object> settings = new HashMap<>();
        settings.put("hibernate.connection.url", required("SPRING_DATASOURCE_URL"));
        settings.put("hibernate.connection.username", user);
        settings.put("hibernate.connection.password", required("DB_PASSWORD"));
        settings.put("hibernate.connection.pool_size", "1");
        settings.put("hibernate.hbm2ddl.auto", "validate");
        settings.put("hibernate.implicit_naming_strategy", "org.springframework.boot.orm.jpa.hibernate.SpringImplicitNamingStrategy");
        settings.put("hibernate.physical_naming_strategy", "org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy");
        var registry = new StandardServiceRegistryBuilder().applySettings(settings).build();
        try {
            var sources = new MetadataSources(registry);
            int models = 0;
            try (var jar = new JarFile(Path.of(args[0]).toFile())) {
                var entries = jar.entries();
                while (entries.hasMoreElements()) {
                    String name = entries.nextElement().getName();
                    if (!name.startsWith("BOOT-INF/classes/kr/it/reserve/")
                            || !name.contains("/entity/") || !name.endsWith(".class") || name.contains("$")) continue;
                    String className = name.substring("BOOT-INF/classes/".length(), name.length() - 6).replace('/', '.');
                    Class<?> model = Class.forName(className, false, VerifyDatabaseSchema.class.getClassLoader());
                    if (model.isAnnotationPresent(Entity.class) || model.isAnnotationPresent(Embeddable.class)
                            || model.isAnnotationPresent(MappedSuperclass.class)) {
                        sources.addAnnotatedClass(model);
                        models++;
                    }
                }
            }
            if (models < 1) throw new IllegalStateException("Release contains no entity models");
            try (var factory = sources.buildMetadata().buildSessionFactory()) {
                System.out.println("PASS: release schema validates with restricted app account; models=" + models);
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + name);
        return value;
    }
}
