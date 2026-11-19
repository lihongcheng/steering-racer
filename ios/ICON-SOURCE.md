# App 图标来源与安装

Build 4 使用真实 MOMO MOD.78 黑色绒面方向盘产品照片，裁切并缩放为不透明 sRGB iPhone 图标。图片来源：MOMO UK 产品页面 https://momo-uk.co.uk/MOMO-racing-GT-Touring-MOD.78-steering-wheel-black-suede 。品牌与产品摄影属于原权利人；未将其标注为原创或开放授权素材，当前用于用户本机开发 App。

Debug 与 Release 均使用 SteeringPhoto 图标集。

重新安装时，请使用 `Open iPhone Project.command` 打开随项目提供的 Xcode 工程。

验证结果：2026-10-31，Build 4 签名构建成功，CFBundleIcons 引用 SteeringPhoto，Assets.car 含 180×180 @3x iPhone 图标；Xcode 设备安装列表显示版本 4，用户确认手机桌面图标显示正常。
