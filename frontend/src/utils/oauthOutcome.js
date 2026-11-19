const MESSAGES = {
    access_denied: '소셜 로그인을 취소했어요.',
    authorization_request_not_found: '이 인증 요청은 이미 사용했거나 만료됐어요. 원래 화면에서 다시 시작해주세요.',
    invalid_state: '인증 요청을 확인할 수 없어요. 원래 화면에서 다시 시작해주세요.',
    email_conflict: '이미 가입된 이메일이에요. 기존 가입 방식으로 로그인한 뒤 마이페이지의 로그인 및 보안에서 소셜 계정을 연결해주세요.',
    login_method_expired: '본인 확인·연결 요청이 만료됐어요. 설정 화면에서 다시 시작해주세요.',
    login_method_conflict: '이미 연결된 소셜 계정이에요. 기존 연결을 확인해주세요.',
    login_method_email_mismatch: '현재 RESERVE 계정과 같은 이메일의 인증된 소셜 계정을 사용해주세요.',
    login_method_identity_mismatch: '처음 연결한 소셜 계정으로 본인 확인해주세요.',
    oauth_reauthentication_required: '계정 보호를 위해 소셜 로그인을 다시 진행해주세요.',
    ip_verification_unavailable: '접속 환경을 확인할 수 없어요. 잠시 후 다시 로그인해주세요.',
    account_protected: '계정 보호 중이에요. 확인한 이메일의 계정 복구 링크를 열어주세요.',
    login_failed: '소셜 로그인에 실패했어요. 다시 시도해주세요.',
};

export function oauthOutcomeMessage(code) {
    return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : '소셜 로그인 결과를 확인하지 못했어요. 다시 시도해주세요.';
}
