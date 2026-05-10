FROM amazoncorretto:21-alpine-jdk

# Security: 비 root 유저로 실행 (컴테이너 권한 최소화)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ARG JAR_FILE=build/libs/*.jar
COPY ${JAR_FILE} app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]