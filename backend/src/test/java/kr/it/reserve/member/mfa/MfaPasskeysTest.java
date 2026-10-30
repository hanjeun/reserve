package kr.it.reserve.member.mfa;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.LocalDateTime;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class MfaPasskeysTest {
    private final ObjectMapper json = new ObjectMapper();
    private final MfaAccountRepository accounts = mock(MfaAccountRepository.class);
    private final MfaCredentialRepository credentials = mock(MfaCredentialRepository.class);
    private final Map<String,MfaCredential> saved = new HashMap<>();
    private final MfaAccount account = new MfaAccount(1L, LocalDateTime.now());
    private final byte[] id = new byte[32];
    private MfaPasskeys passkeys;
    private KeyPair keys;
    @BeforeEach void fixture() throws Exception {
        new SecureRandom().nextBytes(id);
        var generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1")); keys = generator.generateKeyPair();
        var properties = new MfaProperties();
        passkeys = new MfaPasskeys(properties, new PasskeyCredentials(accounts, credentials));
        when(accounts.findById(1L)).thenReturn(Optional.of(account));
        when(accounts.findByUserHandle(account.getUserHandle())).thenReturn(Optional.of(account));
        when(credentials.findByMemberIdOrderByCreatedAtAsc(1L)).thenAnswer(ignored -> new ArrayList<>(saved.values()));
        when(credentials.findBySlotKey(anyString())).thenAnswer(call -> Optional.ofNullable(saved.get(call.getArgument(0))));
    }
    @Test void verifiesRealEcRegistrationAndAssertion() throws Exception {
        register();
        var challenge = challenge();
        String options = passkeys.beginAssertion(account, challenge);
        var result = passkeys.finishAssertion(account, challenge, assertion(options, "https://app.reserve.it.kr", true, false));
        assertThat(result.isSuccess()).isTrue();
        assertThat(result.isUserVerified()).isTrue();
        assertThat(result.getSignatureCount()).isEqualTo(1);
    }
    @Test void rejectsWrongOriginMissingUvAndDamagedSignature() throws Exception {
        register();
        var challenge = challenge();
        String options = passkeys.beginAssertion(account, challenge);
        assertThatThrownBy(() -> passkeys.finishAssertion(account, challenge, assertion(options, "https://other.invalid", true, false))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> passkeys.finishAssertion(account, challenge, assertion(options, "https://app.reserve.it.kr", false, false))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> passkeys.finishAssertion(account, challenge, assertion(options, "https://app.reserve.it.kr", true, true))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void rejectsOtherAccountAndStaleCeremony() throws Exception {
        register();
        var first = challenge();
        String old = passkeys.beginAssertion(account, first);
        var current = challenge();
        passkeys.beginAssertion(account, current);
        assertThatThrownBy(() -> passkeys.finishAssertion(account, current, assertion(old, "https://app.reserve.it.kr", true, false))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> passkeys.finishAssertion(new MfaAccount(2L, LocalDateTime.now()), first,
                assertion(old, "https://app.reserve.it.kr", true, false))).isInstanceOf(IllegalArgumentException.class);
    }
    private MfaChallenge challenge() { return new MfaChallenge(UUID.randomUUID().toString(), 1L, MfaChallenge.Purpose.LOGIN, "PASSWORD", 0, null, LocalDateTime.now().plusMinutes(5)); }
    @Test void acceptsRegistrationWhenOptionalCredentialPropertiesAreAbsent() throws Exception {
        register(null);
        var challenge = challenge();
        String options = passkeys.beginAssertion(null, challenge);
        assertThat(passkeys.finishAssertion(account, challenge,
                assertion(options, "https://app.reserve.it.kr", true, false)).isSuccess()).isTrue();
    }
    @Test void missingCredentialPropertiesStillRequiresVerifiedUserAndAllowedOrigin() {
        assertThatThrownBy(() -> register(null, false, "https://app.reserve.it.kr")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> register(null, true, "https://other.invalid")).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void rejectsRegistrationThatExplicitlyReportsANonDiscoverableCredential() {
        assertThatThrownBy(() -> register(false)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void leavesNativeCredentialProviderSelectionToTheBrowser() throws Exception {
        var registration = json.readTree(passkeys.beginRegistration(account, challenge())).path("publicKey");
        var selection = registration.path("authenticatorSelection");
        assertThat(selection.path("residentKey").asText()).isEqualTo("required");
        assertThat(selection.path("requireResidentKey").asBoolean()).isTrue();
        assertThat(selection.path("userVerification").asText()).isEqualTo("required");
        assertThat(selection.has("authenticatorAttachment")).isFalse();
        assertThat(registration.path("attestation").asText()).isEqualTo("none");
        var assertion = json.readTree(passkeys.beginAssertion(null, challenge())).path("publicKey");
        assertThat(assertion.path("allowCredentials").size()).isZero();
        assertThat(assertion.path("userVerification").asText()).isEqualTo("required");
    }
    private void register() throws Exception { register(true); }
    private void register(Boolean discoverable) throws Exception { register(discoverable, true, "https://app.reserve.it.kr"); }
    private void register(Boolean discoverable, boolean verified, String origin) throws Exception {
        var challenge = challenge();
        String options = passkeys.beginRegistration(account, challenge);
        var key = (ECPublicKey) keys.getPublic();
        Map<Integer,Object> cose = new LinkedHashMap<>();
        cose.put(1,2); cose.put(3,-7); cose.put(-1,1); cose.put(-2,coordinate(key.getW().getAffineX().toByteArray())); cose.put(-3,coordinate(key.getW().getAffineY().toByteArray()));
        ByteArrayOutputStream auth = new ByteArrayOutputStream();
        auth.write(hash("app.reserve.it.kr".getBytes(StandardCharsets.UTF_8)));
        auth.write(verified ? 0x45 : 0x41); auth.write(new byte[4]); auth.write(new byte[16]); auth.write(ByteBuffer.allocate(2).putShort((short)id.length).array()); auth.write(id); auth.write(cbor(cose));
        var attestation = Map.of("fmt", "none", "attStmt", Map.of(), "authData", auth.toByteArray());
        String response = json.writeValueAsString(Map.of("id", enc(id), "rawId", enc(id), "type", "public-key",
                "response", Map.of("clientDataJSON", enc(client(options, "webauthn.create", origin)), "attestationObject", enc(cbor(attestation))),
                "clientExtensionResults", discoverable == null ? Map.of() : Map.of("credProps", Map.of("rk", discoverable))));
        var result = passkeys.finishRegistration(challenge, response);
        var credential = MfaCredential.passkey(1L, "검사", enc(id), MfaCrypto.digest(enc(id)), result.getPublicKeyCose().getBase64Url(), 0, null, false, false, LocalDateTime.now());
        saved.put(credential.getSlotKey(), credential);
    }
    private String assertion(String options, String origin, boolean verified, boolean damaged) throws Exception {
        byte[] client = client(options, "webauthn.get", origin);
        byte[] auth = ByteBuffer.allocate(37).put(hash("app.reserve.it.kr".getBytes(StandardCharsets.UTF_8))).put((byte)(verified ? 5 : 1)).putInt(1).array();
        var signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(keys.getPrivate()); signer.update(auth); signer.update(hash(client)); byte[] signature = signer.sign();
        if (damaged) signature[signature.length-1] ^= 1;
        return json.writeValueAsString(Map.of("id", enc(id), "rawId", enc(id), "type", "public-key", "clientExtensionResults", Map.of(),
                "response", Map.of("clientDataJSON", enc(client), "authenticatorData", enc(auth), "signature", enc(signature),
                        "userHandle", enc(account.getUserHandle().getBytes(StandardCharsets.UTF_8)))));
    }
    private byte[] client(String options, String type, String origin) throws Exception {
        return json.writeValueAsBytes(Map.of("type", type, "challenge", json.readTree(options).path("publicKey").path("challenge").asText(), "origin", origin, "crossOrigin", false));
    }
    private static byte[] coordinate(byte[] value) { byte[] out = new byte[32]; int length=Math.min(32,value.length); System.arraycopy(value,value.length-length,out,32-length,length); return out; }
    private static byte[] hash(byte[] value) throws Exception { return MessageDigest.getInstance("SHA-256").digest(value); }
    private static String enc(byte[] value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value); }
    private static byte[] cbor(Object value) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); encodeCbor(out,value); return out.toByteArray();
    }
    private static void head(ByteArrayOutputStream out, int major, int size) {
        if(size<24) out.write(major*32+size);
        else if(size<256) { out.write(major*32+24); out.write(size); }
        else { out.write(major*32+25); out.write(size>>>8); out.write(size&255); }
    }
    private static void encodeCbor(ByteArrayOutputStream out, Object value) {
        if(value instanceof Map<?,?> map) { head(out,5,map.size()); map.forEach((k,v)->{ encodeCbor(out,k); encodeCbor(out,v); }); }
        else if(value instanceof Integer n) head(out,n>=0?0:1,n>=0?n:-1-n);
        else {
            byte[] bytes=value instanceof byte[] b?b:value.toString().getBytes(StandardCharsets.UTF_8);
            head(out,value instanceof byte[]?2:3,bytes.length); out.writeBytes(bytes);
        }
    }
}
