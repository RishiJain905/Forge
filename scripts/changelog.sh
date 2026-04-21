#!/usr/bin/env bash
# Generate changelog entry from git commits
# Usage: ./scripts/changelog.sh [since_ref]

SINCE=${1:-""}

if [ -n "$SINCE" ]; then
  echo "## Changes"
  git log --oneline "$SINCE..HEAD" | while read -r commit msg; do
    echo "- $msg ($commit)"
  done
else
  echo "# Changelog"
  echo ""
  git log --oneline --reverse | while read -r commit msg; do
    echo "- $msg ($commit)"
  done
fi
