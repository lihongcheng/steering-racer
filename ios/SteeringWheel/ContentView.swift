import SwiftUI

private let lime = Color(red: 0.82, green: 0.97, blue: 0.40)
private let ink = Color(red: 0.05, green: 0.075, blue: 0.095)

struct ContentView: View {
    @ObservedObject var model: ControllerModel
    @State private var showScanner = false
    @State private var showPaste = false
    @State private var connectionText = ""

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 10) {
                HStack(spacing: 12) {
                    Text("S/L").font(.system(size: 20, weight: .black, design: .monospaced)).foregroundColor(lime)
                    Text("STEERING LAB").font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(1)
                    Spacer()
                    Circle().fill(model.connected ? lime : .gray).frame(width: 5, height: 5)
                    Text(model.connected ? model.hostLabel : "等待连接").font(.system(size: 10, design: .monospaced)).foregroundColor(.gray)
                    settingsMenu.fixedSize()
                }.frame(height: 30)
                HStack(spacing: 10) {
                    Spacer(minLength: 0)
                    Button(model.calibrating ? "校准中…" : "校准中位", action: model.calibrate)
                        .buttonStyle(ControlButton()).frame(width: 100).disabled(!model.connected || model.calibrating || model.busy)
                    Button("重置车辆", action: model.resetCar)
                        .buttonStyle(ControlButton()).frame(width: 100).disabled(!model.active || !model.gameOnline || model.busy || ![3,4].contains(model.racePhase))
                    Button(model.mainTitle, action: model.mainAction)
                        .font(.system(size: 13, weight: .semibold)).frame(width: 156, height: 40)
                        .background(model.racePhase == 3 ? Color(red: 0.9, green: 0.62, blue: 0.4) : lime).foregroundColor(ink).cornerRadius(7)
                        .disabled(!model.mainEnabled).opacity(model.mainEnabled ? 1 : 0.4)
                    Spacer(minLength: 0)
                }.frame(height: 40)
                HStack(spacing: 18) {
                    PedalButton(title: "刹车", subtitle: "BRAKE", value: $model.brake,
                                color: Color(red: 1, green: 0.60, blue: 0.37), enabled: model.canDrive)
                        .frame(width: min(190, max(138, geo.size.width * 0.22)))
                        .accessibilityIdentifier("brake-pedal")
                    VStack(spacing: 9) {
                        Text(model.gameOnline ? "GREYPORT · 第 \(model.lapNumber) / 3 圈" : "等待电脑游戏")
                            .font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundColor(lime)
                        if model.racePhase == 5 {
                            Text("三圈完成").font(.system(size: 24, weight: .semibold)).padding(.vertical, 4)
                            ForEach(0..<3) { i in
                                HStack {
                                    Text("LAP \(i + 1)")
                                    Spacer()
                                    Text(ControllerModel.timeText(model.lapTimes[i]))
                                    if model.invalidLaps & (1 << i) != 0 { Text("*") }
                                }.font(.system(size: 11, design: .monospaced))
                            }
                        } else {
                            HStack(spacing: 13) {
                                WheelShape().stroke(Color(white: 0.34), style: StrokeStyle(lineWidth: 9, lineCap: .round)).overlay {
                                    VStack { RoundedRectangle(cornerRadius: 2).fill(lime).frame(width: 7, height: 13); Spacer() }.padding(.top, 3)
                                }.overlay { Text("S/L").font(.system(size: 15, weight: .black, design: .monospaced)).foregroundColor(lime) }
                                .rotationEffect(.degrees(model.angle))
                                .frame(width: min(118, geo.size.height * 0.29), height: min(118, geo.size.height * 0.29))
                                .accessibilityLabel("方向盘转角 \(Int(model.angle)) 度")
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(String(format: "%03.0f", model.speed)).font(.system(size: 37, weight: .medium, design: .monospaced)).minimumScaleFactor(0.7)
                                    Text("km/h").font(.system(size: 10)).foregroundColor(.gray)
                                    Text(String(format: "%+.1f°", model.angle)).font(.system(size: 12, design: .monospaced)).foregroundColor(lime).padding(.top, 5)
                                }
                            }
                        }
                        HStack { metric("总用时", ControllerModel.timeText(model.totalTime)); Spacer(); metric("最佳圈", ControllerModel.timeText(model.bestTime)) }
                        Text(model.feedback.isEmpty ? model.motionMessage : model.feedback)
                            .font(.system(size: 10)).foregroundColor(model.calibrated ? lime : .gray).multilineTextAlignment(.center).lineLimit(2).frame(height: 27)
                        Text(model.message).font(.system(size: 9)).foregroundColor(.gray).multilineTextAlignment(.center).lineLimit(2)
                    }.frame(maxWidth: .infinity)
                    PedalButton(title: "油门", subtitle: "THROTTLE", value: $model.throttle, color: lime, enabled: model.canDrive)
                        .frame(width: min(190, max(138, geo.size.width * 0.22)))
                        .accessibilityIdentifier("throttle-pedal")
                }.frame(maxHeight: .infinity).padding(.top, 7)
                HStack {
                    Text(model.hasSavedComputer ? "已记住电脑 · 自动重连" : "首次使用请扫码").foregroundColor(model.active ? lime : .gray)
                    Spacer()
                    Text(String(format: "%.0f Hz  /  RTT %.0f ms  /  %.2f×", model.sensorHz, max(0, model.rtt), model.sensitivity)).foregroundColor(.gray)
                }.font(.system(size: 9, design: .monospaced)).frame(height: 14)
            }.padding(.horizontal, 18).padding(.vertical, 10).background(ink)
        }
        .sheet(isPresented: $showScanner) {
            ZStack(alignment: .topTrailing) {
                QRScanner { result in
                    showScanner = false
                    switch result { case .success(let url): model.connect(url: url); case .failure(let error): model.message = error.localizedDescription }
                }.ignoresSafeArea()
                Button("关闭") { showScanner = false }.buttonStyle(ControlButton()).padding()
                VStack { Spacer(); Text("扫描电脑 Steering Lab 页面上的二维码").padding().background(.ultraThinMaterial).cornerRadius(8).padding() }
            }
        }
        .sheet(isPresented: $showPaste) {
            VStack(alignment: .leading, spacing: 15) {
                HStack { Text("粘贴连接串").font(.headline); Spacer(); Button("取消") { showPaste = false } }
                Text("电脑点击“复制连接串”，将完整 steeringlab:// 地址粘贴到这里。").font(.footnote).foregroundColor(.secondary)
                TextEditor(text: $connectionText).font(.system(size: 12, design: .monospaced)).autocorrectionDisabled().textInputAutocapitalization(.never).frame(minHeight: 70)
                Button("忘记上次电脑") { model.forgetComputer(); showPaste = false }.foregroundColor(.orange).font(.footnote)
                Button("连接电脑") { showPaste = false; model.connect(url: connectionText); connectionText = "" }.buttonStyle(.borderedProminent).tint(lime).foregroundColor(ink)
            }.padding(24)
        }
    }

    private func metric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) { Text(title).font(.system(size: 9)).foregroundColor(.gray); Text(value).font(.system(size: 13, design: .monospaced)) }
    }
    private var settingsMenu: some View {
        Menu {
            Button("扫描电脑二维码") { model.pause(); showScanner = true }
            Button("粘贴连接串") { model.pause(); showPaste = true }
            Button("重新连接", action: model.reconnect)
            Divider()
            Button("舒适手感") { model.choosePreset(1) }
                .disabled(!model.gameOnline || model.busy || [2,3].contains(model.racePhase))
            Button("灵敏手感") { model.choosePreset(2) }
                .disabled(!model.gameOnline || model.busy || [2,3].contains(model.racePhase))
            Toggle("反转方向", isOn: $model.inverted).disabled(model.calibrating || model.racePhase == 3)
            Divider()
            Button("返回出发区", action: model.returnHome)
                .disabled(!model.gameOnline || model.busy || [2,3].contains(model.racePhase))
        } label: {
            Label("连接与设置", systemImage: "slider.horizontal.3")
                .font(.system(size: 10, weight: .medium)).padding(.horizontal, 10).padding(.vertical, 8)
                .background(Color.white.opacity(0.07)).cornerRadius(5)
        }.foregroundColor(lime).accessibilityIdentifier("controller-settings")
    }

}

private struct PedalButton: View {
    let title: String
    let subtitle: String
    @Binding var value: Float
    let color: Color
    let enabled: Bool
    @GestureState private var pressed = false
    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 13) {
                Spacer(minLength: 8)
                Text(subtitle).font(.system(size: 10, weight: .medium, design: .monospaced)).tracking(2).opacity(0.72)
                Text(title).font(.system(size: 27, weight: .semibold))
                HStack(spacing: 5) {
                    ForEach(0..<5) { _ in RoundedRectangle(cornerRadius: 1).fill(color.opacity(value > 0 ? 0.55 : 0.25)).frame(width: 5, height: 20) }
                }
                Spacer(minLength: 8)
                Text(!enabled ? "比赛开始后可用" : value > 0 ? "按住中" : "按住生效 · 松开释放")
                    .font(.system(size: 9)).opacity(0.72).padding(.bottom, 16)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(value > 0 ? color : color.opacity(enabled ? 0.08 : 0.035))
                .foregroundColor(value > 0 ? ink : color.opacity(enabled ? 1 : 0.55)).cornerRadius(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(color.opacity(value > 0 ? 1 : enabled ? 0.42 : 0.16), lineWidth: 1.5))
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).updating($pressed) { gesture, state, _ in
                    state = CGRect(origin: .zero, size: geometry.size).contains(gesture.location)
                })
                .onChange(of: pressed) { value = $0 && enabled ? 1 : 0 }
                .onChange(of: enabled) { if !$0 { value = 0 } }
                .onDisappear { value = 0 }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("按住\(title)")
                .accessibilityValue(!enabled ? "不可用" : value > 0 ? "按住中" : "已释放")
        }
    }
}

private struct ControlButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 11, weight: .medium)).padding(.horizontal, 13).padding(.vertical, 10)
            .frame(maxWidth: .infinity).background(Color.white.opacity(configuration.isPressed ? 0.15 : 0.07)).cornerRadius(6)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.white.opacity(0.12)))
    }
}
private struct WheelShape: Shape {
    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: 8, dy: 8), center = CGPoint(x: rect.midX, y: rect.midY)
        var path = Path(ellipseIn: r)
        path.addEllipse(in: CGRect(x: center.x - 26, y: center.y - 26, width: 52, height: 52))
        path.move(to: CGPoint(x: r.minX, y: center.y)); path.addLine(to: CGPoint(x: center.x - 26, y: center.y))
        path.move(to: CGPoint(x: r.maxX, y: center.y)); path.addLine(to: CGPoint(x: center.x + 26, y: center.y))
        path.move(to: CGPoint(x: center.x, y: r.maxY)); path.addLine(to: CGPoint(x: center.x, y: center.y + 26))
        return path
    }
}
