#!/bin/bash

# Move systemd service and path files from /opt/docker-manager to systemd directory
./gradlew :server:shadowJar
export DATA_DIR=.dockerm/data
java -jar server/build/libs/server-all.jar