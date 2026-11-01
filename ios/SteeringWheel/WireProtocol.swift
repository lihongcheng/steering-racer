import Foundation
import CryptoKit
import Security

enum PacketType: UInt8 { case hello = 1, welcome, input, ping, pong, status, command, ack, gameCommand, gameAck, gameState, gameLaps, gameFeedback }
enum InputFlag { static let calibrated: UInt8 = 1; static let active: UInt8 = 2; static let fresh: UInt8 = 4 }

struct Pairing: Equatable {
    let host: String
    let port: UInt16
    let session: Data
    let key: Data

    init(url: String) throws {
        guard let parts = URLComponents(string: url.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme == "steeringlab", parts.host == "pair" else { throw PairError.invalid }
        let items = parts.queryItems ?? []
        func value(_ name: String) -> String? {
            let matches = items.filter { $0.name == name }
            return matches.count == 1 ? matches.first?.value : nil
        }
        guard let host = value("host"), Self.isIPv4(host),
              let portString = value("port"), let port = UInt16(portString), port > 0,
              let sessionString = value("session"), let session = Data(hex: sessionString), session.count == 16,
              let keyString = value("key"), let key = Data(hex: keyString), key.count == 32 else { throw PairError.invalid }
        self.host = host; self.port = port; self.session = session; self.key = key
    }
    static func isIPv4(_ host: String) -> Bool {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 4 && parts.allSatisfy { part in
            !part.isEmpty && part.allSatisfy { $0.isASCII && $0.isNumber } && UInt8(part) != nil
        }
    }
    enum PairError: LocalizedError {
        case invalid
        var errorDescription: String? { "连接串无效。请扫描电脑页面上的二维码，或粘贴完整连接串。" }
    }
}

struct WirePacket {
    var type: PacketType
    var flags: UInt8 = 0
    var sequence: UInt32 = 0
    var sampleSequence: UInt32 = 0
    var timestamp: Double = 0
    var values: [Float] = []

    func encode(pairing: Pairing) -> Data {
        var body = Data("SWL1".utf8)
        body.append(type.rawValue); body.append(flags); body.append(contentsOf: [0, 0])
        body.append(pairing.session)
        body.appendLE(sequence); body.appendLE(sampleSequence); body.appendLE(timestamp.bitPattern)
        for index in 0..<6 { body.appendLE((index < values.count ? values[index] : 0).bitPattern) }
        let code = HMAC<SHA256>.authenticationCode(for: body, using: SymmetricKey(data: pairing.key))
        body.append(contentsOf: code)
        return body
    }

    static func decode(_ data: Data, pairing: Pairing) -> WirePacket? {
        guard data.count == 96, data.prefix(4) == Data("SWL1".utf8),
              let type = PacketType(rawValue: data[4]), data[5] <= 7, data[6] == 0, data[7] == 0,
              data.subdata(in: 8..<24) == pairing.session,
              HMAC<SHA256>.isValidAuthenticationCode(data.suffix(32), authenticating: data.prefix(64), using: SymmetricKey(data: pairing.key)) else { return nil }
        let time = Double(bitPattern: data.readLE(at: 32, as: UInt64.self))
        let values = (0..<6).map { Float(bitPattern: data.readLE(at: 40 + $0 * 4, as: UInt32.self)) }
        guard time.isFinite, time >= 0, values.allSatisfy(\.isFinite) else { return nil }
        return WirePacket(type: type, flags: data[5], sequence: data.readLE(at: 24, as: UInt32.self), sampleSequence: data.readLE(at: 28, as: UInt32.self), timestamp: time, values: values)
    }
}

extension Data {
    init?(hex: String) {
        guard hex.count.isMultiple(of: 2), hex.allSatisfy({ $0.isASCII && $0.isHexDigit }) else { return nil }
        var result = Data(); var position = hex.startIndex
        while position < hex.endIndex {
            let end = hex.index(position, offsetBy: 2)
            guard let byte = UInt8(hex[position..<end], radix: 16) else { return nil }
            result.append(byte); position = end
        }
        self = result
    }
    mutating func appendLE<T: FixedWidthInteger & UnsignedInteger>(_ value: T) {
        for byte in 0..<MemoryLayout<T>.size { append(UInt8(truncatingIfNeeded: value >> (byte * 8))) }
    }
    func readLE<T: FixedWidthInteger & UnsignedInteger>(at offset: Int, as: T.Type) -> T {
        var result: T = 0
        for byte in 0..<MemoryLayout<T>.size { result |= T(self[offset + byte]) << (byte * 8) }
        return result
    }
}

// Pairing contains an authentication key, so store it in the device Keychain.
enum PairingStore {
    private static let service = "dev.steeringlab.saved-pairing"
    static func load() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "last-computer", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    @discardableResult static func save(_ value: String) -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "last-computer"]
        let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let result = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if result == errSecItemNotFound { return SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess }
        return result == errSecSuccess
    }
    static func clear() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "last-computer"] as CFDictionary)
    }
}
