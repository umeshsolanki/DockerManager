#!/bin/bash
# Trigger Jenkins build after push

# --- Configuration ---
# Update these with your actual Jenkins details
JENKINS_URL="http://jenkins.local:8080"
JOB_NAME="DockerManager"
BUILD_TOKEN="YOUR_BUILD_TOKEN"
# ---------------------

echo "🚀 Triggering Jenkins build for $JOB_NAME..."

# Trigger build with parameters if needed, or simple build
# Use -u username:apitoken if authentication is required
curl -X POST "$JENKINS_URL/job/$JOB_NAME/build?token=$BUILD_TOKEN" \
     --silent --show-error --fail

if [ $? -eq 0 ]; then
    echo "✅ Jenkins build triggered successfully!"
else
    echo "❌ Failed to trigger Jenkins build. Please check your configuration in $0"
fi
