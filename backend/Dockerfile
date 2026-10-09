FROM amazoncorretto:21-alpine-jdk

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /var/log/reserve && chown -R appuser:appgroup /var/log/reserve

USER appuser

ARG JAR_FILE=build/libs/*.jar
COPY ${JAR_FILE} app.jar
# A compatibility label is only useful when the packaged JAR contains the new boundary.
RUN for REQUIRED_CLASS in \
    BOOT-INF/classes/kr/it/reserve/chat/entity/ChatMessageHidden.class \
    BOOT-INF/classes/kr/it/reserve/chat/repository/ChatMessageHiddenRepository.class \
    BOOT-INF/classes/kr/it/reserve/chat/service/ChatMessageVisibilityService.class; \
    do jar tf app.jar | grep -F -x "$REQUIRED_CLASS" > /dev/null || exit 1; done
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
