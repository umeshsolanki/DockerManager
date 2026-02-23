#!/bin/bash
# Setup git hooks by symlinking them from scripts/git-hooks to .git/hooks

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_SRC="$REPO_ROOT/scripts/git-hooks"
HOOKS_DEST="$REPO_ROOT/.git/hooks"

echo "Setting up git hooks..."

# Ensure we are in the repo root
cd "$REPO_ROOT"

# List of hooks to sync
HOOKS=("pre-commit" "post-push")

for hook in "${HOOKS[@]}"; do
    if [ -f "$HOOKS_SRC/$hook" ]; then
        echo "Linking $hook..."
        chmod +x "$HOOKS_SRC/$hook"
        ln -sf "$HOOKS_SRC/$hook" "$HOOKS_DEST/$hook"
    fi
done

# Also ensure trigger script is executable
chmod +x "$REPO_ROOT/scripts/jenkins-trigger.sh"

echo "✅ Git hooks installed successfully!"
