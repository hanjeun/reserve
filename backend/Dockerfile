FROM amazoncorretto:21-alpine-jdk

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /var/log/reserve && chown -R appuser:appgroup /var/log/reserve

USER appuser

ARG JAR_FILE=build/libs/*.jar
COPY ${JAR_FILE} app.jar
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
