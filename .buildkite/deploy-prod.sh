#!/bin/bash
set -e

buildkite-agent pipeline upload .buildkite/deploy-prod.yml
