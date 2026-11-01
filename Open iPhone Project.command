#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
open -a Xcode "$PWD/ios/SteeringWheel.xcodeproj"
