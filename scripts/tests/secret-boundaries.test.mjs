import { test } from "node:test";
import assert from "node:assert/strict";
import { scanText } from "../check-secret-boundaries.mjs";

test("reports provider credentials without returning values or original lines", () => {
  const key = ["AK", "IA", "A".repeat(16)].join("");
  const result = scanText("backend/config.yml", `credential=${key}`);
  assert.equal(result.length, 1);
  assert.equal(JSON.stringify(result).includes(key), false);
  assert.equal(result[0].rule, "aws-access-key");
});
test("permits environment placeholders and public channel identifiers", () => {
  assert.deepEqual(
    scanText(
      "backend/src/main/resources/application-secret.yml",
      "secret: ${JWT_SECRET_KEY}\nencryption-key: ${MFA_KEY:}\n",
    ),
    [],
  );
  assert.deepEqual(
    scanText(
      "frontend/.env.example",
      "VITE_PORTONE_CHANNEL_KEY=channel-example\nVITE_KAKAO_JS_KEY=public-key",
    ),
    [],
  );
});
test("rejects private browser variables and literal defaults in secret settings", () => {
  assert.equal(
    scanText("frontend/.env.example", "VITE_SERVER_SECRET=placeholder")[0].rule,
    "browser-private-variable",
  );
  assert.equal(
    scanText(
      "backend/src/main/resources/application-secret.yml",
      "secret: ${JWT_SECRET_KEY:unsafe-default}",
    )[0].rule,
    "literal-config-secret",
  );
  assert.equal(
    scanText("backend/local.properties", "password=unsafe-default")[0].rule,
    "literal-config-secret",
  );
});
test("recognizes private keys in fixtures while allowing ordinary synthetic passwords", () => {
  const pem = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  assert.equal(scanText("fixtures/key.txt", pem)[0].rule, "private-key");
  assert.deepEqual(
    scanText(
      "backend/src/test/fixtures/application.yml",
      "password=test-password",
    ),
    [],
  );
});
