package kr.it.reserve.member.mfa;

import com.yubico.webauthn.CredentialRepository;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.data.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class PasskeyCredentials implements CredentialRepository {
    private final MfaAccountRepository accounts;
    private final MfaCredentialRepository credentials;

    static ByteArray handle(String value) { return new ByteArray(value.getBytes(StandardCharsets.UTF_8)); }
    static String username(ByteArray value) { return new String(value.getBytes(), StandardCharsets.UTF_8); }
    static ByteArray bytes(String value) {
        try { return ByteArray.fromBase64Url(value); }
        catch (Exception e) { throw new IllegalArgumentException("Invalid passkey encoding"); }
    }
    @Override public Set<PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
        return accounts.findByUserHandle(username).map(account -> credentials.findByMemberIdOrderByCreatedAtAsc(account.getMemberId())
                .stream().filter(value -> value.getKind() == MfaCredential.Kind.PASSKEY)
                .map(value -> PublicKeyCredentialDescriptor.builder().id(bytes(value.getCredentialId())).build())
                .collect(Collectors.toSet())).orElse(Set.of());
    }
    @Override public Optional<ByteArray> getUserHandleForUsername(String username) {
        return accounts.findByUserHandle(username).map(value -> handle(value.getUserHandle()));
    }
    @Override public Optional<String> getUsernameForUserHandle(ByteArray userHandle) {
        return accounts.findByUserHandle(username(userHandle)).map(MfaAccount::getUserHandle);
    }
    @Override public Optional<RegisteredCredential> lookup(ByteArray credentialId, ByteArray userHandle) {
        return accounts.findByUserHandle(username(userHandle)).flatMap(account -> row(credentialId)
                .filter(value -> value.getMemberId().equals(account.getMemberId())).map(value -> registered(value, account)));
    }
    @Override public Set<RegisteredCredential> lookupAll(ByteArray credentialId) {
        return row(credentialId).flatMap(value -> accounts.findById(value.getMemberId())
                .map(account -> Set.of(registered(value, account)))).orElse(Set.of());
    }
    Optional<MfaCredential> row(ByteArray id) {
        return credentials.findBySlotKey("PASSKEY:" + MfaCrypto.digest(id.getBase64Url()));
    }
    private RegisteredCredential registered(MfaCredential value, MfaAccount account) {
        return RegisteredCredential.builder().credentialId(bytes(value.getCredentialId())).userHandle(handle(account.getUserHandle()))
                .publicKeyCose(bytes(value.getPublicKeyCose())).signatureCount(value.getSignatureCount())
                .backupEligible(value.isBackupEligible()).backupState(value.isBackedUp()).build();
    }
}
