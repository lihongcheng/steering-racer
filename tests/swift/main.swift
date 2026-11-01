import Foundation
import simd

func expect(_ condition: @autoclosure () -> Bool, _ label: String) {
    guard condition() else { fatalError("FAIL: \(label)") }
    print("PASS: \(label)")
}
let url = "steeringlab://pair?host=127.0.0.1&port=41234&session=" + String(repeating: "01", count: 16) + "&key=" + String(repeating: "02", count: 32)
let pairing = try Pairing(url: url)
let packet = WirePacket(type: .input, flags: 7, sequence: .max, sampleSequence: 901, timestamp: 123456.25, values: [-0.5, -18.5, 1, 0, 99.5, 3.5])
let expected = Data(hex: "53574c310307000001010101010101010101010101010101ffffffff85030000000000000424fe40000000bf000094c10000803f000000000000c74200006040a91b5cf89892f774ac131ca469c5b76d491ec96007a1d59ab733bb594f3b892d")!
expect(packet.encode(pairing: pairing) == expected, "Swift encoder matches Node.js protocol vector byte-for-byte")
let decoded = WirePacket.decode(expected, pairing: pairing)!
expect(decoded.sequence == .max && decoded.sampleSequence == 901 && decoded.timestamp == 123456.25 && decoded.values[1] == -18.5, "Swift decodes Node.js little-endian data")
var damaged = expected; damaged[40] ^= 1
expect(WirePacket.decode(damaged, pairing: pairing) == nil, "tampered HMAC rejected")
expect(WirePacket.decode(expected.prefix(64), pairing: pairing) == nil, "truncated packet rejected")
expect((try? Pairing(url: url + "&port=41235")) == nil, "ambiguous QR fields rejected")
expect(!Pairing.isIPv4("256.1.1.1") && !Pairing.isIPv4("example.com"), "unicast IPv4 address validation")

func update(_ estimator: inout SteeringEstimator, _ q: simd_quatd, _ index: Int) {
    estimator.update(x: q.imag.x, y: q.imag.y, z: q.imag.z, w: q.real, time: Double(index) / 100)
}
let identity = simd_quatd(angle: 0, axis: SIMD3<Double>(0, 0, 1))
func turn(_ degrees: Double) -> simd_quatd { simd_quatd(angle: -degrees * .pi / 180, axis: SIMD3<Double>(0, 0, 1)) }
var estimator = SteeringEstimator(); estimator.calibrate(at: 0)
for index in 0...70 { update(&estimator, identity, index) }
expect(estimator.calibrated, "flat initial posture calibrates")
for index in 71...160 { update(&estimator, turn(35), index) }
expect(abs(estimator.angle - 35) < 0.01 && estimator.steer > 0.999, "clockwise turn maps to full right steering")
for index in 161...1000 { update(&estimator, turn(35), index) }
expect(abs(estimator.angle - 35) < 0.01, "held turn does not decay toward center")
for index in 1001...1100 { update(&estimator, identity, index) }
expect(estimator.steer == 0, "return to calibrated neutral settles in dead zone")
for index in 1101...1200 { update(&estimator, turn(-35), index) }
expect(estimator.steer < -0.999, "left rotation maps to left steering")
let tilt = simd_quatd(angle: .pi / 3, axis: SIMD3<Double>(1, 0, 0))
for index in 1201...1300 { update(&estimator, tilt, index) }
expect(estimator.calibrated && abs(estimator.angle) < 0.01, "lowering the phone preserves calibration without steering")
for (label, neutral) in [("upright", tilt), ("oblique", tilt * simd_quatd(angle: 0.8, axis: SIMD3<Double>(0, 1, 0))), ("opposite landscape", turn(180))] {
    var e = SteeringEstimator(); e.calibrate(at: 0)
    for index in 0...70 { update(&e, neutral, index) }
    for index in 71...160 { update(&e, neutral * turn(25), index) }
    expect(e.calibrated && abs(e.angle - 25) < 0.01, "correct relative turn from \(label) posture")
}
var noisy = SteeringEstimator(); noisy.calibrate(at: 0)
for index in 0...70 { update(&noisy, turn(index % 2 == 0 ? 10 : -10), index) }
expect(!noisy.calibrated, "moving phone cannot calibrate")
var signFlip = SteeringEstimator(); signFlip.calibrate(at: 0)
for index in 0...70 { update(&signFlip, simd_quatd(vector: index % 2 == 0 ? tilt.vector : -tilt.vector), index) }
expect(signFlip.calibrated, "equivalent quaternion signs do not break calibration")
estimator.update(x: .nan, y: 0, z: 0, w: 1, time: 14)
expect(!estimator.calibrated && !estimator.validPose, "invalid orientation stops control")
expect(SteeringEstimator.map(1.9) == 0 && SteeringEstimator.map(-35) == -1, "dead zone and saturation")
print("Swift protocol and steering math checks passed. These are synthetic unit fixtures, not iPhone measurements.")
for type in [PacketType.gameCommand, .gameAck, .gameState, .gameLaps, .gameFeedback] {
    let p = WirePacket(type: type, sequence: 42, sampleSequence: 123, timestamp: 123.5, values: [1,2,3,4,5,6])
    let data = p.encode(pairing: pairing)
    expect(data.count == 96 && WirePacket.decode(data, pairing: pairing)?.type == type, "game packet \(type.rawValue) round-trip")
}
