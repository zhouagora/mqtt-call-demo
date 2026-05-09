# 快速配置指南

## 🚀 5分钟快速启动

### 步骤 1：获取必需配置

您需要准备以下配置项：

| 配置项 | 说明 | 是否必需 | 获取方式 |
|--------|------|----------|----------|
| **APP_ID** | 声网 Agora App ID | ✅ 必需 | [声网控制台](https://console.shengwang.cn) → 项目管理 → 复制 App ID |
| **APP_CERTIFICATE** | 声网 App 证书 | ⭐ **推荐** | [声网控制台](https://console.shengwang.cn) → 项目信息 → 主要证书 |
| **BASIC_AUTH** | MQTT Token API 认证 | ✅ 必需 | 详见下方 [如何获取 BASIC_AUTH](#如何获取-basic_auth) |
| **MQTT_WS_URL** | EMQX WebSocket 地址 | ✅ 必需 | EMQX Cloud 控制台 → 部署详情 → WebSocket 地址 |

**💡 提示**：
- `APP_CERTIFICATE` 用于 **RTC Token 鉴权**，增强安全性
- 如果不配置，系统会自动降级为静态 App ID 模式（仍可使用，但不推荐用于生产环境）

### 步骤 2：创建配置文件

```bash
# 复制配置模板到 server 目录
cp .env.example server/.env
```

### 步骤 3：编辑配置

打开 `server/.env` 文件，填写您的配置：

```env
APP_ID=你的声网AppID
APP_CERTIFICATE=你的声网App证书  # 推荐配置，用于 RTC Token 鉴权
BASIC_AUTH=Basic 你的认证信息
MQTT_WS_URL=wss://你的EMQX地址:8084/mqtt
PORT=3000
```

### 步骤 4：启动服务

```bash
# 安装依赖
npm install

# 启动服务
npm run dev
```

### 步骤 5：访问应用

- **主叫端**：http://127.0.0.1:3000/caller
- **被叫端**：http://127.0.0.1:3000/callee

## 📝 配置示例

```env
# 声网 App ID（从控制台获取）
APP_ID=2852620ffb034e7ba73a06ce34b78afd

# 声网 App 证书（用于 RTC Token 鉴权，强烈推荐配置）
APP_CERTIFICATE=6ae2770ee33a4eb28bb507070a8edf91

# Basic Auth（联系后端获取）
BASIC_AUTH=Basic YTg0YzIwZmQ3MmJlNDliZmEwMWM0MTA0YTk3ZTI1ZjY6...

# EMQX WebSocket 地址
MQTT_WS_URL=wss://i6f357a6.ala.dedicated.aliyun.emqxcloud.cn:8084/mqtt

# 服务端口（可选）
PORT=3000
```

## 如何获取 BASIC_AUTH

`BASIC_AUTH` 是声网 HTTP 基本认证的凭证，用于获取 MQTT Token。您可以通过以下步骤获取：

### 方法一：使用声网控制台（推荐）

1. 登录 [声网控制台](https://console.shengwang.cn)
2. 进入 **项目管理** → 选择您的项目
3. 点击“设置”->"RESTful API"->"添加密钥"（可选），找到 **客户 ID** (Customer ID) 和 **客户密钥** (Customer Secret)（https://console.shengwang.cn/settings/restfulApi）
4. 使用三方在线 Base64 编码工具生成凭证：
   - 访问 https://www.debugbear.com/basic-auth-header-generator
   - 将客户 ID 和客户密钥分别填入 Username 和 Password 框，得到形如 Authorization: Basic NDI1OTQ3N2I4MzYy...YwZjA= 的结果。冒号后的内容即是 Authorization 值。

**示例**：
```
客户 ID: abc123
客户密钥: secret456
输入: abc123:secret456
Base64 编码: YWJjMTIzOnNlY3JldDQ1Ng==
BASIC_AUTH: Basic YWJjMTIzOnNlY3JldDQ1Ng==
```

### 方法二：使用代码生成

#### Node.js
```javascript
const customerKey = 'YOUR_CUSTOMER_KEY';
const customerSecret = 'YOUR_CUSTOMER_SECRET';
const plainCredential = customerKey + ':' + customerSecret;
const encodedCredential = Buffer.from(plainCredential).toString('base64');
const authorizationHeader = 'Basic ' + encodedCredential;
console.log(authorizationHeader);
```

#### Python
```python
import base64

customer_key = 'YOUR_CUSTOMER_KEY'
customer_secret = 'YOUR_CUSTOMER_SECRET'
credentials = customer_key + ':' + customer_secret
base64_credentials = base64.b64encode(credentials.encode('utf-8')).decode('utf-8')
authorization_header = 'Basic ' + base64_credentials
print(authorization_header)
```

#### 命令行（Linux/Mac）
```bash
echo -n 'YOUR_CUSTOMER_KEY:YOUR_CUSTOMER_SECRET' | base64
# 输出结果后，在前面加上 "Basic " 即可
```

### ⚠️ 安全提示

- **客户密钥**仅在创建时显示一次，请妥善保管
- 建议将 BASIC_AUTH 存储在环境变量或 `.env` 文件中
- **不要**将 BASIC_AUTH 提交到代码仓库
- 如果密钥泄露，请立即在声网控制台重置

## 🔍 验证配置

启动服务后，访问：http://127.0.0.1:3000/api/config

如果看到类似以下 JSON，说明配置正确：

```json
{
  "appId": "2852620ffb034e7ba73a06ce34b78afd",
  "mqttWsUrl": "wss://your-domain:8084/mqtt",
  "tokenEndpoint": "/api/mqtt/token"
}
```

## 🔐 RTC Token 鉴权验证

配置 `APP_CERTIFICATE` 后，可以通过以下方式验证 Token 鉴权是否生效：

### 1. 检查服务端日志

**未配置 APP_CERTIFICATE 时**：
```
[警告] APP_CERTIFICATE 未配置，返回空 Token（使用静态 App ID 模式）
```

**已配置 APP_CERTIFICATE 时**：
```
（无警告信息，正常生成 Token）
```

### 2. 测试 Token 生成接口

```bash
curl -X POST http://127.0.0.1:3000/api/rtc/token \
  -H "Content-Type: application/json" \
  -d '{"channel":"test-channel","uid":666}'
```

**成功响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "007eJxTYCjIMF...",  // 长字符串，以 007eJxT 开头
    "appId": "{YOUR_APP_ID}",
    "channel": "test-channel",
    "uid": 666,
    "expiresAt": 1778312997
  }
}
```

### 3. 完整呼叫流程测试

1. 启动主叫端和被叫端
2. 发起呼叫
3. 查看浏览器控制台日志：
   - 应该看到 "RTC Token 请求成功"
   - 不应该看到 "no certificate" 警告
4. 被叫接听后，双方应该能正常通话

### 4. 设备在线/离线事件测试

**测试目标**：验证 MQTT Broker 自动发布的 presence 事件处理

**测试场景 A - 正常连接**：
1. 启动被叫端并连接 MQTT
2. 观察主叫端日志：
   ```
   ✅ 收到被叫在线事件（MQTT Broker 自动发布）
   ```

**测试场景 B - 振铃期间断网**：
1. 主叫发起呼叫，被叫振铃中
2. **被叫关闭网络**（关闭 WiFi 或拔网线）
3. 观察主叫端日志：
   ```
   ❌ 收到被叫离线事件（MQTT Broker 自动发布）
   ⚠️ 被叫在通话/振铃过程中离线，执行兜底处理
   ✅ 被叫离线兜底处理完成
   ```
4. 验证 UI 显示："被叫设备已离线，通话已结束"

**测试场景 C - 通话中断网**：
1. 正常建立通话
2. **被叫关闭网络**
3. 观察主叫端：
   - 应该自动离开 RTC 频道
   - 应该清理会话状态
   - UI 应该更新为离线状态

**预期行为**：
- ✅ 被叫正常连接时，主叫收到 `device_online` 事件
- ✅ 被叫断网时，主叫收到 `device_offline` 事件
- ✅ 振铃期间离线，自动取消呼叫
- ✅ 通话中离线，自动结束通话

## ❓ 遇到问题？

查看详细文档：[../README.md](../README.md)

---

**配置完成，开始使用吧！** 🎉
