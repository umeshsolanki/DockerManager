FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy the locally built FatJar
# Expects the jar to be in the build context (root of workspace)
COPY server-all.jar server.jar

EXPOSE 8080

CMD ["java", "-jar", "server.jar"]
