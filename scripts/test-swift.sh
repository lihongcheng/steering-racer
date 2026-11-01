#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p work/swift-tests
xcrun swiftc -swift-version 5 ios/SteeringWheel/WireProtocol.swift ios/SteeringWheel/SteeringMath.swift tests/swift/main.swift -o work/swift-tests/core
work/swift-tests/core
