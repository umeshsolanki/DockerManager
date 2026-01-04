# Stage 1: Build UI
FROM node:20-alpine AS ui-builder
WORKDIR /app/ui
COPY web-app/package*.json ./
RUN npm install
COPY web-app/ ./
RUN npm run build

# Stage 2: Final Image
FROM eclipse-temurin:21-jre

WORKDIR /app

# Install Docker CLI, iptables, ipset, util-linux, and tzdata
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    docker.io \
    iptables \
    ipset \
    util-linux \
    tzdata && \
    rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Kolkata

# Copy the locally built FatJar
COPY server-all.jar server.jar

# Copy static UI assets
COPY --from=ui-builder /app/ui/out /app/ui

EXPOSE 9091

CMD ["java", "-jar", "server.jar"]
