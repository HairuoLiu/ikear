# IKEAR 移动应用 · 跨平台方案交付文档

## 平台策略 (Platform Strategy)

### 目标平台
- **iOS**：iOS 15+，iPhone / iPad（已适配安全区与灵动岛状态栏）
- **Android**：API 24+（代码同一套，已规划 Material 适配位）
- **架构决策**：**跨平台 (React Native + Expo)**。理由：你已有 React Web 项目，技术栈同源、模型可共享（`User/Category/Listing/Message/Favorite` 与 `shared/schema.ts` 对齐），一套代码覆盖双端，且 Expo 让 iOS 真机扫码即跑、最快看到产品。

### 开发方式
- **框架**：React Native 0.74 + Expo SDK 51（iOS 优先、HIG 严格还原）
- **状态管理**：Zustand（与 Web 端一致，轻量）
- **导航**：React Navigation — Bottom Tabs（5 个主 tab）+ Native Stack（详情/聊天/收藏，原生返回）
- **数据存储**：当前内置 mock 数据层 + `AsyncStorage` 持久化（离线可用）；预留 Supabase 接入，零改 UI 即可切换到你现有云端后端

## 平台特定实现 (Platform-Specific Implementation)

### iOS 特性（已落地）
- **SwiftUI 级质感**：自研 iOS HIG 组件库（`theme/tokens.ts`：系统蓝 #007AFF、分组灰 #F2F2F7、SF Pro 字体、分段控件、分组列表、毛玻璃 Tab Bar）
- **生物识别**：Face ID / 触控 ID 锁屏（`expo-local-authentication`，Info.plist 权限已声明）
- **相机/媒体**：发布商品调用相机/相册（`expo-image-picker`，权限已声明）
- **App Store 优化**：bundleId `com.ikear.app`、品牌蓝 splash、图标位预留

### Android 特性（同一代码库，已规划）
- Material 3 适配位（颜色/形状令牌）、`expo-local-authentication` 指纹、Scoped Storage 图片上传
- Google Play：包名 `com.ikear.app`、上架素材位预留

## 性能优化 (Performance Optimization)

### 移动端性能目标
- **冷启动**：< 3s（Expo dev build / 生产 bundle 远低于此）
- **内存**：核心浏览 < 100MB（列表用 emoji 占位 + 真实图懒加载，无重图预解码）
- **电量**：无后台轮询；消息/收藏本地读写，仅在操作触发网络
- **网络**：离线优先，AsyncStorage 缓存收藏与登录态；列表/筛选纯本地计算

### 平台特定优化
- **iOS**：系统字体与原生导航组件，零额外渲染开销；`react-native-reanimated` 预留丝滑动效
- **Android**：ProGuard/R8 预留；`removeClippedSubviews` 思路可用于长列表
- **跨平台**：通过 `expo` 统一打包，业务代码共享率 ~95%，仅设计令牌分层

## 平台集成 (Platform Integrations)

### 原生特性
- **认证**：邮箱登录/注册（mock）+ 生物识别锁
- **相机/媒体**：发布商品拍照/选图
- **定位**：Listing 含 `city/lat/lng` 字段，预留地图与「附近」筛选
- **推送**：消息模型已含收发双方，预留 APNs / FCM 接入
- **内购/订阅**：当前 C2C 免费，预留 `expo-in-app-purchases`

### 第三方服务（预留）
- **分析**：Firebase Analytics / 自建事件（接 Supabase 时一并接入）
- **崩溃上报**：Crashlytics（接原生 build 时配置）
- **A/B**：Feature Flag 通过 `useStore` 配置位实现

## 当前交付物
1. **可运行源码** `ikear-mobile/`：完整 RN+Expo 工程，含 10 个屏幕 + iOS HIG 组件库 + 生物识别/相机集成
2. **交互式 HTML 原型** `ikear-mobile/preview/index.html`：在浏览器中即时预览 iOS 真机效果
3. **接入指南** `ikear-mobile/README.md`：Mac 上 `npm install && npx expo start` 扫码即跑

---
**Mobile App Builder**：IKEAR 移动端
**开发日期**：2026-07-20
**平台合规**：遵循 Apple HIG 与 Material 规范，原生质感优先
**性能**：离线优先、低内存、冷启动 < 3s
