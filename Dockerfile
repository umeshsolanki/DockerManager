FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Arguments for downloading the artifact
ARG MAVEN_USERNAME
ARG MAVEN_PASSWORD
ARG JAR_URL=https://r1.umeshsolanki.in/repository/maven-releases/com/umeshsolanki/dockermanager/server/1.0.0/server-1.0.0.jar

# Install curl
RUN apk add --no-cache curl

# Download the jar using credentials
RUN curl -u "$MAVEN_USERNAME:$MAVEN_PASSWORD" -f -o server.jar "$JAR_URL"

EXPOSE 8080

CMD ["java", "-jar", "server.jar"]
