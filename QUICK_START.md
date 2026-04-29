# 快速配置指南

## 🚀 5分钟快速启动

### 步骤 1：获取必需配置

您需要准备以下 3 个配置项：

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| **APP_ID** | 声网 Agora App ID | [声网控制台](https://console.agora.io/) → 项目管理 → 复制 App ID |
| **BASIC_AUTH** | MQTT Token API 认证 | 联系后端管理员获取（格式：`Basic xxxxxx`） |
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
