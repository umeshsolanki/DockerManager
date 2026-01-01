---
description: Deploy Docker Manager as an Ubuntu Systemd Service
---

This workflow guides you through setting up the Docker Manager application (JAR) as a systemd service on Ubuntu. This ensures the application starts automatically on boot and restarts if it crashes.

### Prerequisites
- Java 17 or higher installed (`java -version`)
- Root access to the Ubuntu server
- The `server-all.jar` file copied to the server (e.g., to `/opt/docker-manager/server-all.jar`)

### 1. Create the Service File

Create a new file at `/etc/systemd/system/docker-manager.service`.

```bash
sudo nano /etc/systemd/system/docker-manager.service
```

Paste the following content. **Make sure to update the `ExecStart` path** to point to your actual JAR file location.

```ini
[Unit]
Description=Docker Manager Service
After=network.target docker.service
Requires=docker.service

[Service]
# Run as root to allow managing Docker, Firewall (iptables), and System Logs
User=root
Group=root

# Path to Java and your JAR file
# REPLACE /opt/docker-manager/server-all.jar with your actual path
ExecStart=/usr/bin/java -jar /opt/docker-manager/server-all.jar

# Optional: Set custom data directory
# Environment="DATA_DIR=/opt/docker-manager/data"

# Restart configuration
Restart=always
RestartSec=10
SuccessExitStatus=143

# Logging
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 2. Reload Systemd Daemon

Notify systemd that a new service file exists.

```bash
sudo systemctl daemon-reload
```

### 3. Start and Enable the Service

Start the service immediately and enable it to start on boot.

```bash
sudo systemctl enable --now docker-manager
```

### 4. Check Status

Verify that the service is running correctly.

```bash
sudo systemctl status docker-manager
```

### 5. View Logs

To view the application logs:

```bash
sudo journalctl -u docker-manager -f
```
