package kr.it.reserve.config;

import kr.it.reserve.schema.entity.SchemaToolFixture;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

class DatabaseSchemaToolTest {
    @TempDir Path temporary;

    @Test
    void validatesWithSelectOnlyAndLeavesExistingDataAndColumnsUnchanged() throws Exception {
        String url = fixture(true);
        var result = validate(url, "reserve_app");
        assertThat(result.exitCode()).withFailMessage(result.output()).isZero();
        assertThat(result.output()).contains("PASS:", "models=1");
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var rows = connection.createStatement().executeQuery("SELECT label FROM schema_fixture WHERE id=1")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("kept");
        }
    }

    @Test
    void refusesAMissingColumnWithoutCreatingIt() throws Exception {
        String url = fixture(false);
        var result = validate(url, "reserve_app");
        assertThat(result.exitCode()).isNotZero();
        assertThat(result.output()).contains("missing column [label]");
        try (var connection = DriverManager.getConnection(url, "sa", "");
             var columns = connection.getMetaData().getColumns(null, null, "SCHEMA_FIXTURE", "LABEL")) {
            assertThat(columns.next()).isFalse();
        }
    }

    @Test
    void rejectsAnAdministratorAccountBeforeOpeningTheDatabase() throws Exception {
        var result = validate("jdbc:h2:file:" + temporary.resolve("not-created"), "root");
        assertThat(result.exitCode()).isNotZero();
        assertThat(result.output()).contains("Use the restricted app account");
        assertThat(Files.exists(temporary.resolve("not-created.mv.db"))).isFalse();
    }

    private String fixture(boolean withLabel) throws Exception {
        String url = "jdbc:h2:file:" + temporary.resolve("schema").toAbsolutePath() + ";MODE=MySQL";
        try (var connection = DriverManager.getConnection(url, "sa", ""); var sql = connection.createStatement()) {
            sql.execute("CREATE TABLE schema_fixture(id BIGINT PRIMARY KEY" + (withLabel ? ", label VARCHAR(32)" : "") + ")");
            sql.execute("INSERT INTO schema_fixture VALUES(1" + (withLabel ? ", 'kept'" : "") + ")");
            sql.execute("CREATE USER reserve_app PASSWORD 'fixture'");
            sql.execute("GRANT SELECT ON schema_fixture TO reserve_app");
        }
        return url;
    }

    private Result validate(String url, String username) throws Exception {
        Path jar = temporary.resolve("fixture.jar");
        try (var output = new JarOutputStream(Files.newOutputStream(jar));
             var model = SchemaToolFixture.class.getResourceAsStream("SchemaToolFixture.class")) {
            output.putNextEntry(new JarEntry("BOOT-INF/classes/kr/it/reserve/schema/entity/SchemaToolFixture.class"));
            model.transferTo(output);
            output.closeEntry();
        }
        var command = new ArrayList<String>();
        command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        String agent = System.getProperty("reserve.schemaToolAgent");
        if (agent != null) {
            command.add("-javaagent:" + agent + "=includes=kr.it.reserve.tools.VerifyDatabaseSchema*,destfile="
                    + System.getProperty("reserve.schemaToolExecutionData"));
        }
        command.add("--class-path");
        command.add(System.getProperty("reserve.toolTestClasspath", System.getProperty("java.class.path")));
        command.add("kr.it.reserve.tools.VerifyDatabaseSchema");
        command.add(jar.toAbsolutePath().toString());
        var builder = new ProcessBuilder(command).redirectErrorStream(true);
        builder.environment().put("DB_USERNAME", username);
        builder.environment().put("DB_PASSWORD", "fixture");
        builder.environment().put("SPRING_DATASOURCE_URL", url);
        Path log = temporary.resolve("result.log");
        var process = builder.redirectOutput(log.toFile()).start();
        assertThat(process.waitFor(60, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        return new Result(process.exitValue(), Files.readString(log));
    }

    private record Result(int exitCode, String output) {}
}
