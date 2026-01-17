#!/bin/bash

# Move systemd service and path files from /opt/docker-manager to systemd directory
cd web-app && bash -c "source ~/.nvm/nvm.sh && nvm use 25 && npm run dev"