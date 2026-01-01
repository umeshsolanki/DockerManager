#!/bin/bash

# Move systemd service and path files from /opt/docker-manager to systemd directory
echo "Moving service and path files to /etc/systemd/system/..."
sudo mv /opt/docker-manager/*.service /etc/systemd/system/
sudo mv /opt/docker-manager/*.path /etc/systemd/system/

# Reload systemd to recognize new changes
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "Done."
