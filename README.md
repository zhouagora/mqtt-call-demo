# MQTT 语音呼叫演示系统

基于 MQTT 信令和声网 Agora RTC 的 Web 端语音通话演示系统，包含主叫端和被叫端两个 Web 应用。

## 📋 功能特性

- ✅ MQTT 信令交互（呼叫/接听/挂断）
- ✅ 声网 Agora RTC 语音通话（G722 编码）
- ✅ **RTC Token 鉴权**（安全加入频道）
- ✅ 实时状态上报与订阅
- ✅ 消息去重机制
- ✅ 完整的呼叫状态机
- ✅ 呼叫超时自动取消
- ✅ 对方离线兜底处理

## 🛠️ 技术栈

**后端服务**：
- Node.js + Express（v5.2.1）
- dotenv（环境变量管理）

**前端技术**：
- 原生 JavaScript（ES6 Modules）
- MQTT.js（v5.15.1）- 浏览器端 MQTT 客户端
- Agora Web SDK（v4.24.3）- RTC 音视频

**消息代理**：
- EMQX Cloud（托管服务）

## 📦 安装与配置

### 1. 环境要求

- Node.js >= 18.0.0
- 现代浏览器（Chrome/Firefox/Safari 最新版本）

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制配置模板并填写您的配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Agora App ID（从声网控制台获取）
APP_ID=your_app_id_here

# 声网 App Certificate（推荐，用于生成 RTC Token）
# 获取方式：声网控制台 → 项目信息 → 主要证书
# 如果不配置，系统会降级为静态 App ID 模式（不推荐用于生产环境）
APP_CERTIFICATE=your_app_certificate_here

# Basic Auth 认证信息（格式：Basic Base64(username:password)）
BASIC_AUTH=Basic your_base64_encoded_auth_here

# MQTT WebSocket 连接地址
MQTT_WS_URL=wss://your-emqx-domain:8084/mqtt

# 服务器端口（可选，默认 3000）
PORT=3000
```

**配置说明**：

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `APP_ID` | 声网 Agora App ID | [声网控制台](https://console.agora.io/) |
| `APP_CERTIFICATE` | 声网 App 证书（**RTC Token 鉴权必需**） | [声网控制台](https://console.agora.io/) → 项目信息 → 主要证书 |
| `BASIC_AUTH` | MQTT Token API 的 Basic 认证 | 详见 [docs/QUICK_START.md](./docs/QUICK_START.md#如何获取-basic_auth) |
| `MQTT_WS_URL` | EMQX WebSocket 连接地址 | EMQX Cloud 控制台 |

### 4. 启动服务

```bash
npm run dev
```

服务将在 `http://127.0.0.1:3000` 启动。

## 🚀 使用说明

### 访问地址

- **首页**：`http://127.0.0.1:3000/`
- **主叫端**：`http://127.0.0.1:3000/caller`
- **被叫端**：`http://127.0.0.1:3000/callee`

### 呼叫流程

#### 1️⃣ 启动被叫端

1. 访问被叫端页面
2. 输入 **Device ID**（例如：`acp-sp2617xxxxx1`）
   - ⚠️ **注意**：确保 Device ID 在系统中唯一，重复的 Device ID 会导致互相踢下线
3. 点击 **连接 MQTT**
4. 等待连接成功

#### 2️⃣ 启动主叫端

1. 访问主叫端页面
2. 填写以下信息：
   - **被叫手机号码**：例如 `13800138000`
   - **被叫 Device ID**：与被叫端相同
   - **主叫 UID**：整数，例如 `666`
3. 点击 **连接 MQTT**
4. 等待连接成功

#### 3️⃣ 发起呼叫

1. 在主叫端点击 **呼叫** 按钮
2. 被叫端会显示振铃面板

#### 4️⃣ 接听电话

1. 被叫端点击 **接听** 按钮
2. 双方自动加入语音频道
3. 显示绿色脉冲动画表示通话中

#### 5️⃣ 挂断电话

任意一方点击 **挂断** 按钮，双方离开语音频道。

## 📡 MQTT 通信协议

### 连接参数

| 参数 | 值 |
|------|-----|
| Client ID | `{appid}-{device_id}` |
| Username | `{device_id}` |
| Password | JWT Token（通过 API 获取） |
| QoS | 1 |

### 主题约定

| 主题 | 方向 | 说明 |
|------|------|------|
| `d/{appid}/{device_id}/call` | 下行 | 接收呼叫指令 |
| `d/{appid}/{device_id}/stop` | 下行 | 接收挂断指令 |
| `d/{appid}/{device_id}/evt/call` | 上行 | 上报通话状态 |
| `d/{appid}/{device_id}/evt/device` | 上行 | 上报设备事件 |
| `d/{appid}/{device_id}/evt/presence` | **系统** | **设备在线/离线状态（由 MQTT Broker 自动发布）** |

### 消息格式

详细的消息格式和状态机请参考：[docs/MQTT通信协议-完整版.md](./docs/MQTT通信协议-完整版.md)

### 设备在线/离线事件（Presence）

**重要说明**：设备在线/离线状态由 **MQTT Broker 自动发布**，而非客户端手动发布。

**工作原理**：
1. 被叫端连接 MQTT → Broker 自动发布 `device_online` 事件
2. 被叫端断开连接（包括突然断网） → Broker 自动发布 `device_offline` 事件
3. 主叫端订阅 `evt/presence` 主题 → 接收并处理这些事件

**在线事件格式**：
```json
{
  "event_type": "device_online",
  "appid": "your_app_id",
  "device_id": "acp-sp2617xxxxx1",
  "timestamp": 1234567890,
  "connected_at": 1234567890
}
```

**离线事件格式**：
```json
{
  "event_type": "device_offline",
  "appid": "your_app_id",
  "cause": "tcp_closed",
  "device_id": "acp-sp2617xxxxx1",
  "timestamp": 1234567900,
  "disconnected_at": 1234567900,
  "connected_at": 1234567890
}
```

**cause 常见值**：
- `tcp_closed` - TCP 连接关闭（正常断开）
- `keepalive_timeout` - 心跳超时（突然断网）
- `server_shutdown` - 服务器关闭

**主叫端处理逻辑**：
- ✅ **振铃期间离线**：自动取消呼叫，清理状态
- ✅ **通话中离线**：离开 RTC 频道，结束通话
- ✅ **空闲时离线**：仅记录日志，不影响状态

**优势**：
- 🔒 **可靠性**：即使被叫突然断网（拔网线/关WiFi），也能及时检测
- ⚡ **实时性**：连接断开后立即发布，延迟低
- 🎯 **准确性**：包含断开原因（cause），便于诊断

## 🔐 安全说明

### RTC Token 鉴权

本项目支持声网 RTC Token 鉴权，确保只有授权用户才能加入频道。

**工作原理**：
1. 主叫发起呼叫时，服务端为被叫生成 RTC Token
2. Token 随 CALL 指令传递给被叫
3. 被叫接听后，使用 Token 加入 RTC 频道
4. 主叫收到 ANSWERED 后，服务端为主叫生成 Token
5. 主叫使用 Token 加入 RTC 频道

**Token 特性**：
- ⏱️ **有效期**：1 小时（3600 秒）
- 🔒 **安全性**：每个用户独立 Token，绑定 App ID、频道名、UID
- ✅ **自动降级**：未配置 `APP_CERTIFICATE` 时，自动使用静态 App ID 模式

**配置步骤**：
1. 登录 [声网控制台](https://console.agora.io/)
2. 进入项目 → 项目信息
3. 找到 **主要证书**（App Certificate）
4. 复制到 `server/.env` 文件：
   ```env
   APP_CERTIFICATE=your_app_certificate_here
   ```
5. 重启服务即可生效

### 敏感信息管理

本项目使用 `.env` 文件管理敏感配置：

- ✅ `.env` 文件已添加到 `.gitignore`，不会被提交
- ✅ 提供 `.env.example` 作为配置模板
- ⚠️ **请勿**将 `.env` 文件上传到代码仓库

### 获取 MQTT Token

参考文档：[docs/Web端获取MQTT Token的命令请求.md](./docs/Web端获取MQTT Token的命令请求.md)

## 📁 项目结构

```
BT_WIFI_COM/
├── server/                  # 🖥️ 服务端代码
│   ├── server.js           #    Express 服务器
│   └── .env                #    环境配置（敏感信息）
├── web/                     # 🌐 Web 客户端代码
│   └── public/             #    静态资源
│       ├── caller.html     #    主叫端页面
│       ├── caller.js       #    主叫端逻辑
│       ├── callee.html     #    被叫端页面
│       ├── callee.js       #    被叫端逻辑
│       ├── common.js       #    公共函数库
│       ├── index.html      #    首页
│       └── styles.css      #    样式表
├── sdk/                     # 📦 第三方 SDK
│   └── Agora_Web_SDK/      #    声网 Web SDK
├── docs/                    # 📚 文档
│   ├── MQTT通信协议-完整版.md
│   ├── QUICK_START.md      #    快速开始
│   ├── Web端获取MQTT Token的命令请求.md
│   └── emqxxcloud环境连接地址信息.md
├── .env.example            # 📝 环境配置模板
├── .gitignore              # 🔒 Git 忽略规则
├── package.json            # 📋 项目依赖
└── package-lock.json       # 📋 依赖锁定
```

## 🔧 开发指南

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器（支持热重载）
npm run dev
```

### 生产部署

```bash
# 启动生产服务
npm start
```

建议使用 PM2 等进程管理器：

```bash
pm2 start server/server.js --name mqtt-call-demo
```

## ❓ 常见问题

### 1. 连接 MQTT 失败

**可能原因**：
- `.env` 配置不正确
- 网络无法访问 EMQX Cloud
- Device ID 已被其他客户端占用

**解决方案**：
- 检查 `.env` 文件配置
- 查看浏览器控制台和运行日志
- 确认 Device ID 唯一，没有被其他设备使用

### 2. 无法获取麦克风权限

**解决方案**：
- 浏览器会弹出权限请求，点击"允许"
- 如果使用 HTTP 而非 localhost，部分浏览器会限制媒体设备访问
- 尝试使用 Chrome 浏览器

### 3. 语音通话有回音/啸叫

**解决方案**：
- 使用耳机/耳麦测试
- 主叫和被叫设备保持距离
- 降低扬声器音量

### 4. clientId 冲突导致互相踢下线

**原因**：多个客户端使用了相同的 clientId

**解决方案**：
- 主叫端使用 `{appid}-caller-{uid}`
- 被叫端使用 `{appid}-{device_id}`

## 📄 许可证

本项目仅供学习和演示使用。

## 🤝 支持

如有问题，请查看：

1. 浏览器控制台日志
2. 运行日志面板
3. [docs/MQTT通信协议-完整版.md](./docs/MQTT通信协议-完整版.md)

---

**祝您使用愉快！** 🎉
