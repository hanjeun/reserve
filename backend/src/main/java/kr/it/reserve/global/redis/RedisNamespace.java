package kr.it.reserve.global.redis;

/** 키와 Pub/Sub 채널 모두 환경별 접두사로 구분한다. Redis DB 번호만으로 채널은 격리되지 않는다. */
public enum RedisNamespace {
    LOCAL("reserve:local:"), PRODUCTION("reserve:prod:");

    private final String prefix;

    RedisNamespace(String prefix) { this.prefix = prefix; }

    public String prefix() { return prefix; }
}
