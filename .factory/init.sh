#!/bin/bash
# Step 6 Batch 1 init script — minimal setup, TypeScript project

# Verify npm is available
if ! command -v npm &> /dev/null; then
  echo "npm not found"
  exit 1
fi

# Verify node is available  
if ! command -v node &> /dev/null; then
  echo "node not found"
  exit 1
fi

# Verify TypeScript is available
if ! command -v npx &> /dev/null; then
  echo "npx not found"
  exit 1
fi

echo "Environment check passed"
