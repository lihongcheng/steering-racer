# App 图标来源与安装

Build 4 使用真实 MOMO MOD.78 黑色绒面方向盘产品照片，裁切并缩放为不透明 sRGB iPhone 图标。图片来源：MOMO UK 产品页面 https://momo-uk.co.uk/MOMO-racing-GT-Touring-MOD.78-steering-wheel-black-suede 。品牌与产品摄影属于原权利人；未将其标注为原创或开放授权素材，当前用于用户本机开发 App。

资产目录为 SteeringWheel/Assets.xcassets/SteeringPhoto.appiconset，Debug 与 Release 的 ASSETCATALOG_COMPILER_APPICON_NAME 均为 SteeringPhoto。

请只打开 /Users/bytedance/Documents/games/steering-racer/ios/SteeringWheel.xcodeproj。旧 Documents/Codex/.../outputs/steering-lab 工程没有新图标，也不包含最新手机功能。不要用旧工程重新安装。

验证结果：2026-10-31，Build 4 签名构建成功，CFBundleIcons 引用 SteeringPhoto，Assets.car 含 180×180 @3x iPhone 图标；Xcode 设备安装列表显示版本 4，用户确认手机桌面图标显示正常。
