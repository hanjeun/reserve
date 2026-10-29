package kr.it.reserve.member.mfa;

import com.yubico.webauthn.*;
import com.yubico.webauthn.data.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MfaPasskeys {
    private final MfaProperties properties;
    private final PasskeyCredentials credentials;

    private RelyingParty relyingParty() {
        if (properties.getOrigins().isEmpty() || properties.getRpId().isBlank()) throw new IllegalStateException("Passkey origin is not configured");
        return RelyingParty.builder().identity(RelyingPartyIdentity.builder().id(properties.getRpId()).name("RESERVE").build())
                .credentialRepository(credentials).origins(new java.util.HashSet<>(properties.getOrigins()))
                .attestationConveyancePreference(AttestationConveyancePreference.NONE)
                .validateSignatureCounter(false).build();
    }
    public String beginRegistration(MfaAccount account, MfaChallenge challenge) {
        try {
            var options = relyingParty().startRegistration(StartRegistrationOptions.builder()
                    .user(UserIdentity.builder().name(account.getUserHandle()).displayName("RESERVE")
                            .id(PasskeyCredentials.handle(account.getUserHandle())).build())
                    .authenticatorSelection(AuthenticatorSelectionCriteria.builder().residentKey(ResidentKeyRequirement.REQUIRED)
                            .userVerification(UserVerificationRequirement.REQUIRED).build()).timeout(120_000).build());
            challenge.ceremony("REGISTER", options.toJson());
            return options.toCredentialsCreateJson();
        } catch (java.io.IOException e) { throw new IllegalStateException("Passkey options unavailable"); }
    }
    public RegistrationResult finishRegistration(MfaChallenge challenge, String response) {
        try {
            if (!"REGISTER".equals(challenge.getCeremonyType())) throw new IllegalArgumentException();
            var result = relyingParty().finishRegistration(FinishRegistrationOptions.builder()
                    .request(PublicKeyCredentialCreationOptions.fromJson(challenge.getCeremonyJson()))
                    .response(PublicKeyCredential.parseRegistrationResponseJson(response)).build());
            // credProps는 선택 확장이므로 생략 시 residentKey=required 요청을 기준으로 처리한다.
            if (!result.isUserVerified() || result.isDiscoverable().filter(value -> !value).isPresent()) throw new IllegalArgumentException();
            return result;
        } catch (Exception e) { throw new IllegalArgumentException("Passkey verification failed"); }
    }
    public String beginAssertion(MfaAccount account, MfaChallenge challenge) {
        try {
            var builder = StartAssertionOptions.builder().userVerification(UserVerificationRequirement.REQUIRED).timeout(120_000);
            if (account != null) builder.username(account.getUserHandle());
            var options = relyingParty().startAssertion(builder.build());
            challenge.ceremony("ASSERT", options.toJson());
            return options.toCredentialsGetJson();
        } catch (java.io.IOException e) { throw new IllegalStateException("Passkey options unavailable"); }
    }
    public MfaCredential locate(String response) {
        try { return credentials.row(PublicKeyCredential.parseAssertionResponseJson(response).getId()).orElseThrow(); }
        catch (Exception e) { throw new IllegalArgumentException("Passkey verification failed"); }
    }
    public AssertionResult finishAssertion(MfaAccount account, MfaChallenge challenge, String response) {
        try {
            if (!"ASSERT".equals(challenge.getCeremonyType())) throw new IllegalArgumentException();
            var result = relyingParty().finishAssertion(FinishAssertionOptions.builder()
                    .request(AssertionRequest.fromJson(challenge.getCeremonyJson()))
                    .response(PublicKeyCredential.parseAssertionResponseJson(response)).build());
            if (!result.isSuccess() || !result.isUserVerified() || !account.getUserHandle().equals(result.getUsername())
                    || !result.isBackupEligible() && !result.isSignatureCounterValid()) throw new IllegalArgumentException();
            return result;
        } catch (Exception e) { throw new IllegalArgumentException("Passkey verification failed"); }
    }
}
