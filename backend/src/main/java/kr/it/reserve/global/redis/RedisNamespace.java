package kr.it.reserve.global.redis;

/** Environment isolation applies to both keys and Pub/Sub; Redis database numbers do not isolate channels. */
public enum RedisNamespace {
    LOCAL("reserve:local:"), PRODUCTION("reserve:prod:");

    private final String prefix;

    RedisNamespace(String prefix) { this.prefix = prefix; }

    public String prefix() { return prefix; }
}
