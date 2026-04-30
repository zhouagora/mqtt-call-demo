# 快速配置指南

## 🚀 5分钟快速启动

### 步骤 1：获取必需配置

您需要准备以下 3 个配置项：

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| **APP_ID** | 声网 Agora App ID | [声网控制台](https://console.agora.io/) → 项目管理 → 复制 App ID |
| **BASIC_AUTH** | MQTT Token API 认证 | 详见下方 [如何获取 BASIC_AUTH](#如何获取-basic_auth) |
| **MQTT_WS_URL** | EMQX WebSocket 地址 | EMQX Cloud 控制台 → 部署详情 → WebSocket 地址 |

### 步骤 2：创建配置文件

```bash
# 复制配置模板
cp .env.example .env
```

### 步骤 3：编辑配置

打开 `.env` 文件，填写您的配置：

```env
APP_ID=你的声网AppID
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

1. 登录 [声网控制台](https://console.agora.io/)
2. 进入 **项目管理** → 选择您的项目
3. 找到 **客户 ID** (Customer ID) 和 **客户密钥** (Customer Secret)
4. 使用在线 Base64 编码工具生成凭证：
   - 访问 https://www.base64encode.org/
   - 在编码框中输入：`客户ID:客户密钥`（注意中间有冒号）
   - 点击编码，得到 Base64 字符串
   - 在结果前加上 `Basic `，即为完整的 BASIC_AUTH 值

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

## ❓ 遇到问题？

查看详细文档：[README.md](./README.md)

---

**配置完成，开始使用吧！** 🎉
