import Foundation
import simd

/// Measures screen-normal twist relative to a calibrated Core Motion attitude.
/// Any comfortable initial tilt is supported, including a nearly flat phone.
struct SteeringEstimator {
    private(set) var calibrated = false
    private(set) var calibrating = false
    private(set) var angle = 0.0
    private(set) var steer = 0.0
    private(set) var validPose = false
    private(set) var message = "舒适横握手机，然后校准中位"
    private var neutral = simd_quatd(angle: 0, axis: SIMD3<Double>(0, 0, 1))
    private var calibrationStart = 0.0
    private var calibrationAttitudes: [simd_quatd] = []
    private var lastTime: Double?
    var inverted = false
    let deadZone = 2.0
    let fullLock = 35.0

    mutating func calibrate(at time: Double) {
        calibrated = false; calibrating = true; calibrationStart = time
        calibrationAttitudes.removeAll(); angle = 0; steer = 0
        message = "保持不动，正在校准…"
    }
    mutating func invalidate() {
        calibrated = false; calibrating = false; angle = 0; steer = 0; lastTime = nil
        message = "请重新校准"
    }
    static func wrap(_ angle: Double) -> Double { atan2(sin(angle), cos(angle)) }
    static func map(_ angle: Double, deadZone: Double = 2, fullLock: Double = 35) -> Double {
        guard angle.isFinite else { return 0 }
        let magnitude = max(0, min(1, (abs(angle) - deadZone) / (fullLock - deadZone)))
        return angle < 0 ? -magnitude : magnitude
    }
    mutating func update(x: Double, y: Double, z: Double, w: Double, time: Double) {
        guard [x, y, z, w, time].allSatisfy(\.isFinite), x*x + y*y + z*z + w*w > 0.5 else {
            validPose = false; invalidate(); return
        }
        let current = simd_quatd(ix: x, iy: y, iz: z, r: w).normalized
        validPose = true
        let dt = lastTime.map { max(0, min(0.1, time - $0)) } ?? 0.01
        lastTime = time
        if calibrating {
            calibrationAttitudes.append(current)
            if time - calibrationStart >= 0.65 {
                let reference = calibrationAttitudes[0].vector
                // q and -q encode the same rotation. Align signs before averaging.
                let sum = calibrationAttitudes.reduce(SIMD4<Double>(repeating: 0)) {
                    $0 + (simd_dot($1.vector, reference) < 0 ? -$1.vector : $1.vector)
                }
                let mean = simd_quatd(vector: simd_normalize(sum))
                let count = Double(calibrationAttitudes.count)
                let deviation = sqrt(calibrationAttitudes.reduce(0.0) {
                    let distance = 2 * acos(min(1, abs(simd_dot($1.vector, mean.vector))))
                    return $0 + distance * distance
                } / count)
                calibrating = false
                if count >= 15 && deviation < 2 * .pi / 180 {
                    neutral = mean; calibrated = true; angle = 0; steer = 0
                    message = "校准完成，可以开始控制"
                } else { calibrated = false; message = "校准时有移动，请保持不动后重试" }
                calibrationAttitudes.removeAll()
            }
            return
        }
        guard calibrated else { return }
        let relative = neutral.inverse * current
        // Swing-twist decomposition about device Z (the normal to the phone screen).
        guard relative.real * relative.real + relative.imag.z * relative.imag.z > 0.0001 else {
            invalidate(); message = "手机已翻转，请重新校准"; return
        }
        let target = -Self.wrap(2 * atan2(relative.imag.z, relative.real)) * 180 / .pi * (inverted ? -1 : 1)
        guard abs(target) < 170 else { invalidate(); message = "手机已翻转，请重新校准"; return }
        angle += (target - angle) * (1 - exp(-dt / 0.035))
        steer = Self.map(angle, deadZone: deadZone, fullLock: fullLock)
    }
}
