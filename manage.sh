#!/bin/bash

# Configuration
NODE_VERSION="25"
export DATA_DIR="$HOME/dockerm/data"

# Logging Configuration
SERVER_LOG="server.log"
UI_LOG="ui.log"

# PID Files
SERVER_PID=".server.pid"
UI_PID=".ui.pid"

# Function to build server
build_server() {
    echo "----------------------------------------"
    echo "Building Server (ShadowJar)..."
    echo "----------------------------------------"
    ./gradlew :server:shadowJar
    ./gradlew :server:test
}

# Function to build UI
build_ui() {
    echo "----------------------------------------"
    echo "Building UI..."
    echo "----------------------------------------"
    cd web-app && bash -c "source ~/.nvm/nvm.sh && nvm use $NODE_VERSION && npm run build" && cd ..
}

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
    
    # Run in background, redirect to log, and save TRUE pid
    java -jar server/build/libs/server-all.jar > "$SERVER_LOG" 2>&1 &
    SERVER_PID_VAL=$!
    echo $SERVER_PID_VAL > "$SERVER_PID"
    echo "Server started with PID $SERVER_PID_VAL (Logging to $SERVER_LOG)"
    
    # Optional: tail the log if run in foreground
    tail -f "$SERVER_LOG" &
    TAIL_PID=$!
    
    # Wait for server to die
    wait $SERVER_PID_VAL
    kill $TAIL_PID 2>/dev/null
}

# Function to run UI
run_ui() {
    echo "----------------------------------------"
    echo "Starting UI (Dev Mode, Logging to $UI_LOG)..."
    echo "----------------------------------------"
    # Truncate and run
    : > "$UI_LOG"
    cd web-app && bash -c "source ~/.nvm/nvm.sh && nvm use $NODE_VERSION && npm run dev" > "../$UI_LOG" 2>&1 &
    UI_PID_VAL=$!
    echo $UI_PID_VAL > "../$UI_PID"
    echo "UI started with PID $UI_PID_VAL"
    cd ..
    
    # Tail log
    tail -f "$UI_LOG" &
    TAIL_PID=$!
    
    wait $UI_PID_VAL
    kill $TAIL_PID 2>/dev/null
}

# Cleanup on exit
cleanup() {
    echo "Stopping background processes..."
    stop_all
}

# Function to stop all
stop_all() {
    echo "----------------------------------------"
    echo "Stopping Server and UI..."
    echo "----------------------------------------"
    
    # 1. Try stopping by PID
    if [ -f "$SERVER_PID" ]; then
        PID=$(cat "$SERVER_PID")
        if ps -p $PID > /dev/null; then
            echo "Stopping Server (PID: $PID)..."
            kill $PID 2>/dev/null
            sleep 2
            kill -9 $PID 2>/dev/null
        fi
        rm "$SERVER_PID"
    fi

    if [ -f "$UI_PID" ]; then
        PID=$(cat "$UI_PID")
        if ps -p $PID > /dev/null; then
            echo "Stopping UI (PID: $PID)..."
            kill $PID 2>/dev/null
            sleep 2
            kill -9 $PID 2>/dev/null
        fi
        rm "$UI_PID"
    fi

    # 2. Port-based cleanup (Critical for restart reliability)
    echo "Cleaning up ports 9091 (Server) and 3000 (UI)..."
    
    # Server port
    SERVER_PORT_PID=$(lsof -t -i:9091 2>/dev/null)
    if [ ! -z "$SERVER_PORT_PID" ]; then
        echo "Killing remains on port 9091 (PID: $SERVER_PORT_PID)..."
        kill -9 $SERVER_PORT_PID 2>/dev/null
    fi

    # UI port (Next.js)
    UI_PORT_PID=$(lsof -t -i:3000 2>/dev/null)
    if [ ! -z "$UI_PORT_PID" ]; then
        echo "Killing remains on port 3000 (PID: $UI_PORT_PID)..."
        kill -9 $UI_PORT_PID 2>/dev/null
    fi

    # Fallback cleanup for processes
    pkill -f "server-all.jar" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "tail -f server.log" 2>/dev/null || true
    pkill -f "tail -f ui.log" 2>/dev/null || true
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
                java -jar server/build/libs/server-all.jar > "$SERVER_LOG" 2>&1 &
                echo $! > "$SERVER_PID"
                
                sleep 5 # Give server some time to start
                
                echo "Launching UI..."
                cd web-app && bash -c "source ~/.nvm/nvm.sh && nvm use $NODE_VERSION && npm run dev" 2>&1 | tee "../$UI_LOG" &
                echo $! > "../$UI_PID"
                cd ..

                echo "Server (PID: $(cat $SERVER_PID)) and UI (PID: $(cat $UI_PID)) are running."
                echo "Press Ctrl+C to stop both."
                
                # Wait for both background processes
                wait $(cat $SERVER_PID) $(cat $UI_PID)
                ;;
        esac
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        # Call this script again to start
        $0 run $TARGET
        ;;
    *)
        echo "Usage: $0 {build|run|stop|restart} [ui|server]"
        echo "Examples:"
        echo "  $0 build         - Build both server and UI"
        echo "  $0 build server  - Build only server"
        echo "  $0 run           - Run both server and UI"
        echo "  $0 run ui        - Run only UI dev server"
        echo "  $0 stop          - Stop all running components"
        echo "  $0 restart       - Stop and then start everything"
        exit 1
        ;;
esac
