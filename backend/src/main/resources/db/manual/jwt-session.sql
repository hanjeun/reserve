-- 준비용 SQL이며 앱 기동 시 실행하지 않는다. 승인된 DDL 계정으로 대응 JAR의 validate 기동 전에 추가한다.
-- 호환 계약 v10: sid 없는 이전 쿠키는 재로그인이 필요하며, 복구 이미지도 login_session·sid/rgen/aud·해시 리프레시를 지원해야 한다.
-- 회원·사업·거래 데이터는 보존한다. UTC DATETIME은 세션 시간대와 독립이다.
-- 기존 JWT 키는 별도 승인 없이 바꾸지 않는다. 키 교체 중에는 유효한 모든 리프레시 세대의 키를 유지한다.
-- 기본 절대 수명은 30일이며 갱신은 그 안에서 최대 14일의 유휴 수명만 연장한다.

CREATE TABLE login_session (
    id BIGINT NOT NULL AUTO_INCREMENT,
    member_id BIGINT NOT NULL,
    session_id VARCHAR(36) NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL,
    previous_token_hash VARCHAR(64) NULL,
    rotation_version BIGINT NOT NULL,
    refresh_jti VARCHAR(36) NOT NULL,
    signing_key_id VARCHAR(48) NULL,
    created_at DATETIME(6) NOT NULL,
    issued_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    absolute_expires_at DATETIME(6) NOT NULL,
    rotated_at DATETIME(6) NULL,
    auth_version INT NOT NULL,
    oauth_authenticated_at DATETIME(6) NULL,
    login_method VARCHAR(16) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_login_session_sid UNIQUE (session_id),
    CONSTRAINT uk_login_session_hash UNIQUE (refresh_token_hash),
    INDEX idx_login_session_member (member_id),
    INDEX idx_login_session_expiry (expires_at)
);

-- 기존 refresh_token 테이블은 조회·갱신하지 않으며 테이블과 행을 보존한다.
-- 원문 토큰을 login_session에 복사하지 않는다. 이후 폐기는 별도 백업·복구 검토와 승인이 필요하다.
