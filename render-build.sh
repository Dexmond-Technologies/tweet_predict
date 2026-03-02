#!/usr/bin/env bash
# ============================================================
# Override Render's default build detection
# ============================================================
set -e

# Change to the API directory and build
cd app/api
npm install
