import SwiftUI

@main
struct SteeringWheelApp: App {
    @StateObject private var controller = ControllerModel()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            ContentView(model: controller)
                .preferredColorScheme(.dark)
                .onOpenURL { controller.connect(url: $0.absoluteString) }
                .onChange(of: scenePhase) { phase in controller.setForeground(phase == .active) }
        }
    }
}
