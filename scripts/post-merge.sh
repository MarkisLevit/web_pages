#!/bin/bash
set -e

# Post-merge setup for the Bäckerei Panitz project.
#
# This is a static HTML site (see backerei/) served via:
#   python3 -m http.server 5000
# There are no dependencies to install, no build step, and no database
# migrations, so there is nothing to do after a task merge.
#
# If a backend with dependencies is added later (e.g. the pre-order email
# feature), add the install / build / migration steps below. Keep this
# script idempotent, non-interactive (stdin is closed), and fast.

echo "Post-merge setup: static site — no build, dependencies, or migrations required."
