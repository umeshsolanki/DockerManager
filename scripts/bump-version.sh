#!/bin/bash

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Check if an argument is provided (major, minor, or patch)
BUMP_TYPE=$1
if [ -z "$BUMP_TYPE" ]; then
  BUMP_TYPE="patch"
fi

echo "Bumping version ($BUMP_TYPE)..."

# 1. Bump version in web-app/package.json
cd web-app
npm version $BUMP_TYPE --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
cd ..

echo "New version: $NEW_VERSION"

# 2. Update version in server/build.gradle.kts
# Use regex to find `version = "x.y.z"` and replace it
# Using sed for cross-platform compatibility (mac/linux) is tricky, using perl or a temp file approach
# Mac sed requires -i ""
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i "" "s/version = \".*\"/version = \"$NEW_VERSION\"/" server/build.gradle.kts
else
  sed -i "s/version = \".*\"/version = \"$NEW_VERSION\"/" server/build.gradle.kts
fi

echo "Creating git commit and tag..."
git add web-app/package.json server/build.gradle.kts
#git commit -m "chore: bump version to $NEW_VERSION"
#git tag "v$NEW_VERSION"

echo "Done! Version bumped to $NEW_VERSION. You can now push:"
echo "git push && git push --tags"
