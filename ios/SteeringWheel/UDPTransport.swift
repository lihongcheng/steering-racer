import Foundation
import Network

final class UDPTransport {
    private let queue = DispatchQueue(label: "steering.udp", qos: .userInteractive)
    private var connection: NWConnection?
    private var pendingInput = false
    private var ready = false
    private let requireWiFi: Bool
    var onPacket: ((WirePacket) -> Void)?
    var onState: ((String, Bool) -> Void)?

    init(requireWiFi: Bool = true) { self.requireWiFi = requireWiFi }

    func connect(_ pairing: Pairing) {
        queue.async {
            self.connection?.cancel(); self.pendingInput = false; self.ready = false
            let parameters = NWParameters.udp
            if self.requireWiFi { parameters.requiredInterfaceType = .wifi }
            parameters.allowLocalEndpointReuse = true
            let connection = NWConnection(host: NWEndpoint.Host(pairing.host), port: NWEndpoint.Port(rawValue: pairing.port)!, using: parameters)
            self.connection = connection
            connection.stateUpdateHandler = { [weak self, weak connection] state in
                guard let self, let connection, self.connection === connection else { return }
                switch state {
                case .ready:
                    self.ready = true
                    DispatchQueue.main.async { self.onState?("网络已就绪，等待电脑确认", true) }
                    self.receive(connection, pairing: pairing)
                case .waiting(let error):
                    self.ready = false
                    DispatchQueue.main.async { self.onState?("等待 Wi-Fi / 本地网络权限：\(error.localizedDescription)", false) }
                case .failed(let error):
                    self.ready = false
                    DispatchQueue.main.async { self.onState?("连接失败：\(error.localizedDescription)", false) }
                case .cancelled: self.ready = false
                default: break
                }
            }
            connection.start(queue: self.queue)
        }
    }

    private func receive(_ connection: NWConnection, pairing: Pairing) {
        connection.receiveMessage { [weak self, weak connection] data, _, _, error in
            guard let self, let connection, self.connection === connection else { return }
            if let data, let packet = WirePacket.decode(data, pairing: pairing) {
                DispatchQueue.main.async { self.onPacket?(packet) }
            }
            if let error {
                self.ready = false
                DispatchQueue.main.async { self.onState?("接收中断：\(error.localizedDescription)", false) }
            } else { self.receive(connection, pairing: pairing) }
        }
    }

    func send(_ packet: WirePacket, pairing: Pairing) {
        queue.async {
            guard let connection = self.connection, self.ready else { return }
            if packet.type == .input && self.pendingInput { return }
            if packet.type == .input { self.pendingInput = true }
            connection.send(content: packet.encode(pairing: pairing), contentContext: .defaultMessage, isComplete: true, completion: .contentProcessed { [weak self, weak connection] error in
                guard let self, let connection, self.connection === connection else { return }
                if packet.type == .input { self.pendingInput = false }
                if let error { DispatchQueue.main.async { self.onState?("发送失败：\(error.localizedDescription)", false) } }
            })
        }
    }

    func disconnect() {
        queue.async { self.connection?.cancel(); self.connection = nil; self.ready = false; self.pendingInput = false }
    }
}
