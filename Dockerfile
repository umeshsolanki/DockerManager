FROM eclipse-temurin:21-jre

WORKDIR /app

# Install Docker CLI, iptables, ipset, util-linux, and tzdata
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    docker.io \
    util-linux \
    tzdata && \
    rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Kolkata

# Copy the locally built FatJar
# Expects the jar to be in the build context (root of workspace)
COPY server-all.jar server.jar

EXPOSE 8080

CMD ["java", "-jar", "server.jar"]
