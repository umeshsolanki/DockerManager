#!/bin/bash

# Configuration
NODE_VERSION="25"
export DATA_DIR=".dockerm/data"

# Logging Configuration
SERVER_LOG="server.log"
UI_LOG="ui.log"

# Function to build server
build_server() {
    echo "----------------------------------------"
    echo "Building Server (ShadowJar)..."
    echo "----------------------------------------"
    ./gradlew :server:shadowJar
}

# Function to build UI
build_ui() {
    echo "----------------------------------------"
    echo "Building UI..."
    echo "----------------------------------------"
    cd web-app && bash -c "source ~/.nvm/nvm.sh && nvm use $NODE_VERSION && npm run build" && cd ..
}

# Function to run server
run_server() {
    echo "----------------------------------------"
    echo "Starting Server (Logging to $SERVER_LOG)..."
    echo "----------------------------------------"
    if [ ! -f server/build/libs/server-all.jar ]; then
        echo "Server binary not found. Building first..."
        build_server
    fi
    # Truncate and run
    : > "$SERVER_LOG"
    java -jar server/build/libs/server-all.jar 2>&1 | tee "$SERVER_LOG"
}

# Function to run UI
run_ui() {
    echo "----------------------------------------"
    echo "Starting UI (Dev Mode, Logging to $UI_LOG)..."
    echo "----------------------------------------"
    # Truncate and run
    : > "$UI_LOG"
    cd web-app && bash -c "source ~/.nvm/nvm.sh && nvm use $NODE_VERSION && npm run dev" 2>&1 | tee "../$UI_LOG"
}

# Cleanup on exit
cleanup() {
    echo "Stopping background processes..."
    kill $(jobs -p) 2>/dev/null
}

COMMAND=$1
TARGET=$2

case "$COMMAND" in
    build)
        case "$TARGET" in
            ui) build_ui ;;
            server) build_server ;;
            *)
                build_server
                build_ui
                ;;
        esac
        ;;
    run)
        case "$TARGET" in
            ui) run_ui ;;
            server) run_server ;;
            *) 
                trap cleanup EXIT
                echo "Starting both Server and UI..."
                
                # Truncate both logs first
                : > "$SERVER_LOG"
                : > "$UI_LOG"
                
                echo "Launching Server in background..."
                # Run server in background, redirecting to log
                java -jar server/build/libs/server-all.jar > "$SERVER_LOG" 2>&1 &
                
                sleep 5 # Give server some time to start
                
                echo "Launching UI..."
                # Run UI in foreground (so it keeps terminal open), but also log it
                cd web-app && bash -c "source ~/.nvm/nvm.sh && nvm use $NODE_VERSION && npm run dev" 2>&1 | tee "../$UI_LOG"
                ;;
        esac
        ;;
    *)
        echo "Usage: $0 {build|run} [ui|server]"
        echo "Examples:"
        echo "  $0 build         - Build both server and UI"
        echo "  $0 build server  - Build only server"
        echo "  $0 run           - Run both server and UI"
        echo "  $0 run ui        - Run only UI dev server"
        exit 1
        ;;
esac
