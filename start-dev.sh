#!/bin/bash

# Move systemd service and path files from /opt/docker-manager to systemd directory
export DATA_DIR=.dockerm/data
java -jar server/build/libs/server-all.jar >> ./server.log