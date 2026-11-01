import SwiftUI
import CoreMotion

final class ControllerModel: ObservableObject {
    @Published var angle = 0.0
    @Published var steer = 0.0
    @Published var sensorHz = 0.0
    @Published var rtt = -1.0
    @Published var gap = 0.0
    @Published var connected = false
    @Published var active = false
    @Published var calibrated = false
    @Published var calibrating = false
    @Published var hostLabel = "尚未连接电脑"
    @Published var message = "请扫描电脑游戏页面的二维码"
    @Published var motionMessage = "舒适横握手机，然后校准中位"
    @Published var throttle: Float = 0
    @Published var brake: Float = 0
    @Published var gameOnline = false
    @Published var racePhase = 0
    @Published var lapNumber = 1
    @Published var speed = 0.0
    @Published var totalTime = 0.0
    @Published var bestTime = 0.0
    @Published var lastLap = 0.0
    @Published var lapTimes: [Double] = [0, 0, 0]
    @Published var invalidLaps = 0
    @Published var feedback = ""
    @Published var sensitivity = 1.65
    @Published var preset = 2
    @Published var busy = false
    @Published var hasSavedComputer = false
    @Published var inverted = false { didSet { estimator.inverted = inverted; calibrate() } }

    private let motion = CMMotionManager()
    private let transport = UDPTransport()
    private var estimator = SteeringEstimator()
    private var pairing: Pairing?
    private var pairingURL: String?
    private var timer: Timer?
    private var inputSequence: UInt32 = 0
    private var commandSequence: UInt32 = 100
    private let clientId = UInt32.random(in: 1...UInt32.max)
    private var sampleSequence: UInt32 = 0
    private var sampleTime = 0.0
    private var sampleValid = false
    private var lastReceive = 0.0
    private var lastHello = 0.0
    private var helloId: UInt32?
    private var lastPing = 0.0
    private var lastPublish = 0.0
    private var lastGameReceive = 0.0
    private var reconnectAt = 0.0
    private var retryDelay = 3.0
    private var sampleWindow: [Double] = []
    private var pendingCommand: (packet: WirePacket, lastSent: Double, retries: Int)?
    private var pendingGame: (packet: WirePacket, lastSent: Double, retries: Int)?
    private var nextGameAction: Float?
    private var pendingPings: [UInt32: Double] = [:]
    private var wantsActive = false
    private var startedAt = 0.0
    private var armGraceUntil = 0.0
    private var networkReady = false
    private var foreground = true
    private var lastStatusSequence: UInt32?
    private var gameSequences: [UInt8: UInt32] = [:]
    private var lastHitCount = 0
    private var lastHaptic = 0.0
    private var clock: Double { ProcessInfo.processInfo.systemUptime }

    var mainTitle: String {
        if busy { return "正在确认…" }
        if !connected { return "等待连接" }
        if !gameOnline { return "请打开电脑游戏" }
        if racePhase == 3 || racePhase == 2 { return "暂停比赛" }
        if !calibrated { return "先校准中位" }
        if racePhase == 4 { return "继续比赛" }
        if racePhase == 5 { return "再来一局" }
        return "开始比赛"
    }
    var mainEnabled: Bool { connected && gameOnline && !busy && (calibrated || racePhase == 3 || racePhase == 2) }
    var canDrive: Bool { active && gameOnline && racePhase == 3 && !busy }
    static func timeText(_ time: Double) -> String {
        guard time > 0 else { return "—" }
        return String(format: "%02d:%06.3f", Int(time / 60), time.truncatingRemainder(dividingBy: 60))
    }

    init() {
        transport.onState = { [weak self] text, ready in
            guard let self else { return }
            self.networkReady = ready
            if !ready { self.connected = false; self.pause(sendCommand: false); self.gameOnline = false }
            if !self.connected { self.message = text }
        }
        transport.onPacket = { [weak self] packet in self?.receive(packet) }
        let timer = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(timer, forMode: .common); self.timer = timer
        if let saved = PairingStore.load() {
            hasSavedComputer = true
            DispatchQueue.main.async { [weak self] in self?.connect(url: saved) }
        }
    }

    func connect(url: String) {
        do {
            let next = try Pairing(url: url)
            pause(sendCommand: true)
            pairing = next; pairingURL = url
            hostLabel = "\(next.host):\(next.port)"
            startConnection()
        } catch { message = error.localizedDescription }
    }
    private func startConnection() {
        guard let pairing else { return }
        connected = false; networkReady = false; gameOnline = false
        lastStatusSequence = nil; gameSequences.removeAll()
        lastReceive = 0; lastHello = 0; lastPing = 0; rtt = -1; gap = 0
        pendingCommand = nil; pendingGame = nil; nextGameAction = nil; busy = false; pendingPings.removeAll()
        estimator.invalidate(); publishMotion()
        startedAt = clock; reconnectAt = clock + retryDelay; retryDelay = min(10, retryDelay * 1.5)
        transport.connect(pairing); startMotion()
        message = "正在连接上次的电脑…"
    }
    func reconnect() { pause(); retryDelay = 3; startConnection() }
    func forgetComputer() {
        pause(); transport.disconnect(); pairing = nil; pairingURL = nil
        PairingStore.clear(); hasSavedComputer = false; connected = false; gameOnline = false
        hostLabel = "尚未连接电脑"; message = "已忘记电脑，请重新扫码"
        motion.stopDeviceMotionUpdates(); estimator.invalidate(); publishMotion()
    }

    private func startMotion() {
        guard foreground, !motion.isDeviceMotionActive else { return }
        guard motion.isDeviceMotionAvailable else { motionMessage = "设备没有体感传感器，请在真机运行"; return }
        motion.deviceMotionUpdateInterval = 1.0 / 100
        motion.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] data, error in
            guard let self, self.foreground else { return }
            if let error { self.sampleValid = false; self.pause(); self.motionMessage = "体感不可用：\(error.localizedDescription)"; return }
            guard let data, data.timestamp > self.sampleTime else { return }
            guard self.clock - data.timestamp < 0.15 else { self.sampleValid = false; return }
            self.sampleTime = data.timestamp; self.sampleSequence &+= 1
            let q = data.attitude.quaternion
            self.estimator.update(x: q.x, y: q.y, z: q.z, w: q.w, time: data.timestamp)
            self.sampleValid = self.estimator.validPose
            self.sampleWindow.append(data.timestamp)
            while let first = self.sampleWindow.first, first < data.timestamp - 1 { self.sampleWindow.removeFirst() }
            if !self.estimator.calibrated && self.wantsActive { self.pause() }
            if self.clock - self.lastPublish > 1.0 / 30 { self.publishMotion(); self.lastPublish = self.clock }
        }
    }
    private func publishMotion() {
        angle = estimator.angle; steer = estimator.steer
        calibrated = estimator.calibrated; calibrating = estimator.calibrating; motionMessage = estimator.message
        if sampleWindow.count > 1, let first = sampleWindow.first, let last = sampleWindow.last, last > first { sensorHz = Double(sampleWindow.count - 1) / (last - first) }
    }
    func calibrate() { pause(); estimator.calibrate(at: clock); publishMotion(); startMotion() }

    func mainAction() {
        guard mainEnabled else { return }
        if racePhase == 3 || racePhase == 2 { requestGame(2); return }
        let action: Float = racePhase == 4 ? 3 : racePhase == 5 ? 5 : 1
        if active { requestGame(action) } else { arm(then: action) }
    }
    func resetCar() { if canDrive || (racePhase == 4 && active) { requestGame(4) } }
    func returnHome() { requestGame(6) }
    func choosePreset(_ value: Int) { requestGame(value == 1 ? 7 : 8) }

    private func arm(then action: Float) {
        guard connected, estimator.calibrated, sampleValid, clock - sampleTime < 0.15 else { message = "请先完成体感校准"; return }
        nextGameAction = action; busy = true; wantsActive = true; armGraceUntil = clock + 0.75
        throttle = 0; brake = 0; sendInput(); sendCommand(1)
        message = "正在准备方向盘…"
    }
    func pause(sendCommand shouldSend: Bool = true) {
        wantsActive = false; active = false; throttle = 0; brake = 0
        pendingCommand = nil; pendingGame = nil; nextGameAction = nil; busy = false
        if shouldSend && connected { sendCommand(0); sendInput() }
        UIApplication.shared.isIdleTimerDisabled = false
    }
    func setForeground(_ value: Bool) {
        guard foreground != value else { return }; foreground = value
        if !value {
            pause(); motion.stopDeviceMotionUpdates(); sampleValid = false; estimator.invalidate(); publishMotion()
        } else {
            sampleWindow.removeAll()
            if pairing != nil { retryDelay = 3; startConnection() }
        }
    }
    private func send(_ packet: WirePacket) { if let pairing { transport.send(packet, pairing: pairing) } }
    private func sendInput() {
        guard connected else { return }
        var flags: UInt8 = 0
        if estimator.calibrated { flags |= InputFlag.calibrated }
        if wantsActive { flags |= InputFlag.active }
        if foreground && sampleValid && clock - sampleTime < 0.15 { flags |= InputFlag.fresh }
        inputSequence &+= 1
        send(WirePacket(type: .input, flags: flags, sequence: inputSequence, sampleSequence: sampleSequence, timestamp: max(0, sampleTime * 1000), values: [Float(estimator.steer), Float(estimator.angle), canDrive ? throttle : 0, canDrive ? brake : 0, Float(sensorHz), Float(rtt)]))
    }
    private func sendCommand(_ value: Float) {
        commandSequence &+= 1
        let packet = WirePacket(type: .command, sequence: commandSequence, timestamp: clock * 1000, values: [value])
        pendingCommand = (packet, clock, 0); send(packet)
    }
    private func requestGame(_ action: Float) {
        guard connected, gameOnline, pendingGame == nil else { message = "请先打开电脑游戏并连接"; return }
        commandSequence &+= 1
        let packet = WirePacket(type: .gameCommand, sequence: commandSequence, sampleSequence: clientId, timestamp: clock * 1000, values: [action])
        pendingGame = (packet, clock, 0); busy = true; throttle = 0; brake = 0; send(packet)
        message = "等待游戏确认…"
    }
    private func tick() {
        guard foreground, pairing != nil else { return }
        let t = clock
        if !connected {
            if networkReady && t - lastHello > 0.5 {
                commandSequence &+= 1; helloId = commandSequence
                send(WirePacket(type: .hello, sequence: commandSequence, sampleSequence: clientId, timestamp: t * 1000)); lastHello = t
            }
            if t >= reconnectAt { startConnection() }
            if t - startedAt > 2 { message = "正在重连…请确认电脑游戏已启动；地址改变需重新扫码" }
            return
        }
        if t - lastReceive > 2 {
            connected = false; pause(sendCommand: false); estimator.invalidate(); publishMotion(); gameOnline = false
            message = "连接中断，正在重连…"; retryDelay = 3; startConnection(); return
        }
        if gameOnline && t - lastGameReceive > 1.2 { gameOnline = false; throttle = 0; brake = 0 }
        if wantsActive && (!sampleValid || t - sampleTime >= 0.15) { pause(); estimator.invalidate(); publishMotion(); message = "体感中断，请重新校准" }
        sendInput()
        if t - lastPing > 0.5 {
            commandSequence &+= 1; pendingPings[commandSequence] = t
            pendingPings = pendingPings.filter { t - $0.value < 2 }
            send(WirePacket(type: .ping, sequence: commandSequence, timestamp: t * 1000)); lastPing = t
        }
        if var pending = pendingCommand, t - pending.lastSent > 0.25 {
            if pending.retries >= 5 { pendingCommand = nil; pause(sendCommand: false); message = "方向盘确认超时，请重试" }
            else { pending.retries += 1; pending.lastSent = t; pendingCommand = pending; send(pending.packet) }
        }
        if var pending = pendingGame, t - pending.lastSent > 0.25 {
            if pending.retries >= 5 { pendingGame = nil; busy = false; pause(); message = "操作未确认，已暂停；请确认游戏状态后重试" }
            else { pending.retries += 1; pending.lastSent = t; pendingGame = pending; send(pending.packet) }
        }
    }
    private func acceptGameSequence(_ packet: WirePacket) -> Bool {
        if let last = gameSequences[packet.type.rawValue] {
            let distance = packet.sequence &- last
            if distance == 0 || distance >= 0x80000000 { return false }
        }
        gameSequences[packet.type.rawValue] = packet.sequence; return true
    }
    private func receive(_ packet: WirePacket) {
        guard foreground else { return }
        let t = clock
        switch packet.type {
        case .welcome:
            guard packet.sequence == helloId else { return }
            lastReceive = t; connected = true; retryDelay = 3
            if let url = pairingURL { hasSavedComputer = PairingStore.save(url) }
            message = estimator.calibrated ? "已连接，可以开始比赛" : "电脑已连接，请校准中位"
        case .pong:
            guard let sent = pendingPings.removeValue(forKey: packet.sequence) else { return }; lastReceive = t; rtt = (t - sent) * 1000
        case .ack:
            guard let pending = pendingCommand, pending.packet.sequence == packet.sequence else { return }
            lastReceive = t; pendingCommand = nil
            if packet.values[0] == 1 && wantsActive {
                active = true; UIApplication.shared.isIdleTimerDisabled = true
                if let action = nextGameAction { nextGameAction = nil; requestGame(action) } else { busy = false; message = "方向盘已就绪" }
            } else if packet.values[0] == -1 { pause(sendCommand: false); message = "电脑尚未收到校准数据，请稍后再点开始" }
            else { active = false; wantsActive = false; if !busy { message = "已暂停" } }
        case .status:
            if let last = lastStatusSequence { let distance = packet.sequence &- last; guard distance > 0 && distance < 0x80000000 else { return } }
            lastStatusSequence = packet.sequence; lastReceive = t; gap = Double(packet.values[1])
            if packet.values[0] == 0 && active && pendingCommand == nil && t > armGraceUntil { pause(sendCommand: false); message = "电脑已暂停，请确认后继续" }
        case .gameAck:
            guard let pending = pendingGame, packet.sequence == pending.packet.sequence else { return }
            pendingGame = nil; busy = false; lastReceive = t
            switch packet.values[0] {
            case 1: message = "操作已完成"
            case -2: gameOnline = false; message = "请打开电脑游戏页面"
            case -3: pause(); message = "操作超时，已暂停，请确认后重试"
            case -5: message = "上一操作处理中，请稍后重试"
            default: message = "当前状态不能执行，请检查校准或比赛状态"
            }
        case .gameState:
            guard acceptGameSequence(packet) else { return }
            lastReceive = t; lastGameReceive = t; racePhase = Int(packet.values[0]); gameOnline = racePhase != 0
            lapNumber = Int(packet.values[1]); speed = Double(packet.values[2]); totalTime = Double(packet.values[3]); bestTime = Double(packet.values[4]); lastLap = Double(packet.values[5])
            if racePhase != 3 { throttle = 0; brake = 0 }
            UIApplication.shared.isIdleTimerDisabled = active && gameOnline
        case .gameLaps:
            guard acceptGameSequence(packet) else { return }
            lapTimes = packet.values.prefix(3).map(Double.init); invalidLaps = Int(packet.values[3]); sensitivity = Double(packet.values[4]); preset = Int(packet.values[5])
        case .gameFeedback:
            guard acceptGameSequence(packet) else { return }
            switch Int(packet.values[0]) {
            case 1: feedback = "前方左弯 · \(Int(packet.values[1])) m"
            case 2: feedback = "前方右弯 · \(Int(packet.values[1])) m"
            case 3: feedback = "入弯减速 · 建议 \(Int(packet.values[2])) km/h"
            case 4: feedback = "逆向行驶，请掉头或重置"
            case 5: feedback = "碰撞护栏，速度降低"
            default: feedback = ""
            }
            let hits = Int(packet.values[4])
            if hits > lastHitCount && t - lastHaptic > 0.7 { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); lastHaptic = t }
            lastHitCount = hits
        default: break
        }
    }
    deinit { timer?.invalidate(); motion.stopDeviceMotionUpdates(); transport.disconnect() }
}
