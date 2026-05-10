FROM amazoncorretto:21-alpine-jdk

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create log directory with proper permissions before switching user
RUN mkdir -p /var/log/reserve && chown -R appuser:appgroup /var/log/reserve

USER appuser

ARG JAR_FILE=build/libs/*.jar
COPY ${JAR_FILE} app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]