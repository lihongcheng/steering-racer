import SwiftUI
import AVFoundation

struct QRScanner: UIViewControllerRepresentable {
    var onResult: (Result<String, Error>) -> Void
    func makeUIViewController(context: Context) -> CameraController {
        let controller = CameraController(); controller.onResult = onResult; return controller
    }
    func updateUIViewController(_ uiViewController: CameraController, context: Context) {}
}

final class CameraController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onResult: ((Result<String, Error>) -> Void)?
    private let session = AVCaptureSession()
    private let cameraQueue = DispatchQueue(label: "steering.camera")
    private var preview: AVCaptureVideoPreviewLayer?
    private var finished = false
    private var shouldRun = true // accessed only on cameraQueue

    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .black
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: configure()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
                DispatchQueue.main.async { allowed ? self?.configure() : self?.fail("未允许相机权限。可以使用粘贴连接串，或在设置中允许相机访问。") }
            }
        default: fail("相机权限不可用。可以使用粘贴连接串，或在设置中允许相机访问。")
        }
    }

    private func configure() {
        cameraQueue.async { [weak self] in
            guard let self, self.shouldRun else { return }
            guard let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
                DispatchQueue.main.async { self.fail("无法打开相机。请使用真机，或粘贴连接串。") }; return
            }
            self.session.beginConfiguration(); self.session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard self.session.canAddOutput(output) else {
                self.session.commitConfiguration(); DispatchQueue.main.async { self.fail("无法初始化二维码扫描。") }; return
            }
            self.session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]; self.session.commitConfiguration()
            DispatchQueue.main.async {
                guard !self.finished else { return }
                let layer = AVCaptureVideoPreviewLayer(session: self.session); layer.videoGravity = .resizeAspectFill
                self.preview = layer; self.view.layer.addSublayer(layer); self.view.setNeedsLayout()
            }
            if self.shouldRun { self.session.startRunning() }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews(); preview?.frame = view.bounds
        if let connection = preview?.connection, connection.isVideoOrientationSupported {
            switch view.window?.windowScene?.interfaceOrientation {
            case .landscapeLeft: connection.videoOrientation = .landscapeLeft
            case .landscapeRight: connection.videoOrientation = .landscapeRight
            case .portraitUpsideDown: connection.videoOrientation = .portraitUpsideDown
            default: connection.videoOrientation = .portrait
            }
        }
    }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated); finished = true
        cameraQueue.async { self.shouldRun = false; if self.session.isRunning { self.session.stopRunning() } }
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished, let url = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue,
              url.hasPrefix("steeringlab://") else { return }
        finished = true; cameraQueue.async { self.shouldRun = false; self.session.stopRunning() }
        onResult?(.success(url))
    }
    private func fail(_ text: String) {
        guard !finished else { return }; finished = true
        onResult?(.failure(NSError(domain: "SteeringLab.Camera", code: 1, userInfo: [NSLocalizedDescriptionKey: text])))
    }
}
