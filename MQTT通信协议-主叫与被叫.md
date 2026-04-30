# MQTT 通信协议文档

本文档详细说明主叫端（Caller）和被叫端（Callee）之间的 MQTT 信令交互协议。

## 📋 目录

- [1. 连接参数](#1-连接参数)
- [2. 主题约定](#2-主题约定)
- [3. 主叫端协议](#3-主叫端协议)
- [4. 被叫端协议](#4-被叫端协议)
- [5. 消息格式](#5-消息格式)
- [6. 呼叫流程](#6-呼叫流程)
- [7. 状态机](#7-状态机)
- [8. 错误处理](#8-错误处理)

---

## 1. 连接参数

### 1.1 主叫端连接参数

| 参数 | 值 | 说明 |
|------|-----|------|
| **Client ID** | `{appid}-caller-{uid}` | 主叫唯一标识，使用主叫 UID |
| **Username** | `{uid}` | 主叫 UID |
| **Password** | JWT Token | 通过 API 获取 |
| **QoS** | 1 | 至少一次交付 |

**示例**：
```
Client ID: {YOUR_APP_ID}-caller-666
Username: 666
Password: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 1.2 被叫端连接参数

| 参数 | 值 | 说明 |
|------|-----|------|
| **Client ID** | `{appid}-{device_id}` | 被叫唯一标识，使用设备 ID |
| **Username** | `{device_id}` | 设备 ID（小写） |
| **Password** | JWT Token | 通过 API 获取 |
| **QoS** | 1 | 至少一次交付 |

**示例**：
```
Client ID: {YOUR_APP_ID}-acp-sp2617xxxxx1
Username: acp-sp2617xxxxx1
Password: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **注意**：
- Device ID 在订阅和发布时**直接透传**，不做任何转换
- 确保 Device ID 在系统中**唯一**，多个客户端使用相同 Device ID 会导致互相踢下线
- MQTT Broker 根据 Client ID 判断连接唯一性，相同 Client ID 的新连接会使旧连接断开

---

## 2. 主题约定

### 2.1 主题模式

所有主题遵循以下模式：
```
d/{appid}/{device_id}/{suffix}
```

其中：
- `d` - 固定前缀，表示 device
- `{appid}` - 声网 App ID
- `{device_id}` - 被叫设备 ID
- `{suffix}` - 主题后缀（call、evt/call、evt/presence 等）

### 2.2 主叫端主题

| 方向 | Topic 模式 | 作用 | QoS |
|------|------------|------|-----|
| **SUBSCRIBE** | `d/{appid}/{device_id}/evt/call` | 接收被叫的通话状态上报 | 1 |
| **SUBSCRIBE** | `d/{appid}/evt/presence` | 接收设备在线/离线状态 | 1 |
| **PUBLISH** | `d/{appid}/{device_id}/call` | 向被叫发起呼叫请求 | 1 |

**示例**：
```
订阅: d/{YOUR_APP_ID}/acp-sp2617xxxxx1/evt/call
订阅: d/{YOUR_APP_ID}/evt/presence
发布: d/{YOUR_APP_ID}/acp-sp2617xxxxx1/call
```

### 2.3 被叫端主题

| 方向 | Topic 模式 | 作用 | QoS |
|------|------------|------|-----|
| **SUBSCRIBE** | `d/{appid}/{device_id}/call` | 接收主叫的呼叫请求 | 1 |
| **PUBLISH** | `d/{appid}/{device_id}/evt/call` | 上报通话状态 | 1 |
| **PUBLISH** | `d/{appid}/{device_id}/evt/presence` | 上报设备在线/离线状态 | 1 |
| **PUBLISH** | `d/{appid}/{device_id}/evt/device` | 上报设备事件（启动时） | 1 |

**示例**：
```
订阅: d/{YOUR_APP_ID}/acp-sp2617xxxxx1/call
发布: d/{YOUR_APP_ID}/acp-sp2617xxxxx1/evt/call
发布: d/{YOUR_APP_ID}/acp-sp2617xxxxx1/evt/presence
发布: d/{YOUR_APP_ID}/acp-sp2617xxxxx1/evt/device
```

---

## 3. 主叫端协议

### 3.1 连接流程

```
1. 申请 JWT Token
   └── 使用 uid 和 deviceId 调用 Token API

2. 连接 MQTT Broker
   └── 使用 Token 作为 Password

3. 订阅主题
   ├── d/{appid}/{device_id}/evt/call    (被叫状态)
   └── d/{appid}/evt/presence            (设备在线状态)

4. 等待用户操作
   └── 用户点击"呼叫"按钮
```

### 3.2 发起呼叫

**主题**：`d/{appid}/{device_id}/call`

**操作**：PUBLISH

**消息格式**：
```json
{
  "agent_id": "{YOUR_AGENT_ID}",
  "appid": "{YOUR_APP_ID}",
  "channel": "acp-sp2617xxxxx1-13800138000",
  "device_id": "acp-sp2617xxxxx1",
  "event_type": "call",
  "from": "acp-sp2617xxxxx1",
  "labels": {
    "_direction": "outbound",
    "_from_number": "acp-sp2617xxxxx1",
    "_pipeline_id": "web_demo_666",
    "_source": "web-caller",
    "_to_number": "13800138000"
  },
  "peer_uuid": "PEER-xxxxxxxx",
  "service": "",
  "timestamp": 1776657046,
  "to": "13800138000",
  "token": "",
  "uid": "666",
  "uuid": "CALL-xxxxxxxx",
  "vid": "{YOUR_VID}"
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `event_type` | string | 固定为 `"call"` |
| `appid` | string | 声网 App ID |
| `device_id` | string | 被叫设备 ID |
| `channel` | string | RTC 频道名（格式：`{device_id}-{phone_number}`） |
| `uid` | string | 主叫 UID |
| `token` | string | RTC Token（通常为空） |
| `to` | string | 被叫手机号码 |
| `uuid` | string | 呼叫唯一标识（CALL-开头） |
| `peer_uuid` | string | 对端标识（PEER-开头） |
| `labels` | object | 透传标签，状态上报时原样返回 |

### 3.3 接收状态上报

**主题**：`d/{appid}/{device_id}/evt/call`

**操作**：SUBSCRIBE

**处理逻辑**：
```javascript
if (payload.event_type === "call_state") {
  switch (payload.state) {
    case "ANSWERED":
      // 被叫接听，加入 RTC 频道
      joinRtcChannel(payload);
      break;
    case "HANGUP":
    case "ERROR":
      // 通话结束，离开 RTC 频道
      leaveRtcChannel();
      break;
  }
}
```

### 3.4 接收设备在线状态

**主题**：`d/{appid}/evt/presence`

**操作**：SUBSCRIBE

**处理逻辑**：
```javascript
if (payload.event_type === "presence") {
  if (payload.state === "device_offline") {
    // 被叫离线，清理通话状态
    leaveRtcChannel();
    currentSession = null;
  }
}
```

### 3.5 挂断呼叫

**主题**：`d/{appid}/{device_id}/call`

**操作**：PUBLISH

**消息格式**：
```json
{
  "event_type": "hangup",
  "appid": "{YOUR_APP_ID}",
  "device_id": "acp-sp2617xxxxx1",
  "uuid": "CALL-xxxxxxxx",
  "peer_uuid": "PEER-xxxxxxxx",
  "channel": "acp-sp2617xxxxx1-13800138000",
  "timestamp": 1776657100,
  "from": "666",
  "to": "13800138000",
  "cause": "NORMAL_CLEARING"
}
```

---

## 4. 被叫端协议

### 4.1 连接流程

```
1. 申请 JWT Token
   └── 使用 deviceId 调用 Token API

2. 连接 MQTT Broker
   └── 使用 Token 作为 Password

3. 订阅主题
   └── d/{appid}/{device_id}/call    (呼叫指令)

4. 发布设备事件
   ├── evt/device     (设备启动事件)
   └── evt/presence   (设备在线状态)
```

### 4.2 接收呼叫请求

**主题**：`d/{appid}/{device_id}/call`

**操作**：SUBSCRIBE

**处理逻辑**：
```javascript
if (payload.event_type === "call") {
  // 1. 检查是否有进行中的通话
  if (activeSession) {
    // 忙线，拒绝呼叫
    publishState("HANGUP", { cause: "DEVICE_BUSY" });
    return;
  }
  
  // 2. 保存会话信息
  activeSession = payload;
  
  // 3. 上报状态：CALLING → RINGING
  publishState("CALLING");
  publishState("RINGING");
  
  // 4. 显示振铃界面
  showRingingPanel(payload);
}
```

### 4.3 接听呼叫

**主题**：`d/{appid}/{device_id}/evt/call`

**操作**：PUBLISH

**消息格式**：
```json
{
  "event_type": "call_state",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "appid": "{YOUR_APP_ID}",
  "vid": {YOUR_VID},
  "labels": { ... },
  "channel": "acp-sp2617xxxxx1-13800138000",
  "call_id": "",
  "state": "ANSWERED",
  "seq": 3,
  "uuid": "CALL-xxxxxxxx",
  "peer_uuid": "PEER-xxxxxxxx",
  "agent_id": "{YOUR_AGENT_ID}",
  "device_id": "acp-sp2617xxxxx1",
  "service": "",
  "direction": "outbound",
  "from": "acp-sp2617xxxxx1",
  "to": "13800138000",
  "answered_at": "2024-01-01T00:00:05.000Z"
}
```

**后续操作**：
- 加入声网 RTC 频道
- 使用 CALL 指令中的 `appid`、`channel`、`uid`、`token`

### 4.4 上报通话状态

**主题**：`d/{appid}/{device_id}/evt/call`

**操作**：PUBLISH

**状态流转**：
```
CALLING → RINGING → ANSWERED → HANGUP
                      ↓
                   ERROR (如果发生错误)
```

### 4.5 上报设备在线状态

**主题**：`d/{appid}/{device_id}/evt/presence`

**操作**：PUBLISH

**上线消息**：
```json
{
  "event_type": "presence",
  "state": "device_online",
  "device_id": "acp-sp2617xxxxx1",
  "timestamp": 1776657000
}
```

**离线消息**：
```json
{
  "event_type": "presence",
  "state": "device_offline",
  "device_id": "acp-sp2617xxxxx1",
  "timestamp": 1776657100
}
```

---

## 5. 消息格式

### 5.1 CALL 指令（主叫 → 被叫）

详细格式见 [3.2 发起呼叫](#32-发起呼叫)

### 5.2 状态上报（被叫 → 主叫）

**通用格式**：
```json
{
  "event_type": "call_state",
  "timestamp": "ISO 8601 格式时间戳",
  "appid": "声网 App ID",
  "vid": 130451,
  "labels": { ... },
  "channel": "RTC 频道名",
  "call_id": "",
  "state": "状态值",
  "seq": 序号,
  "uuid": "呼叫 UUID",
  "peer_uuid": "对端 UUID",
  "agent_id": "Agent ID",
  "device_id": "设备 ID",
  "service": "",
  "direction": "outbound",
  "from": "设备 ID",
  "to": "手机号码"
}
```

**状态值说明**：

| state | 说明 | 附加字段 |
|-------|------|---------|
| `CALLING` | 正在拨号 | 无 |
| `RINGING` | 对端振铃中 | 无 |
| `ANSWERED` | 通话已接通 | `answered_at` |
| `HANGUP` | 通话结束 | `cause`, `duration_sec`, `billsec` |
| `ERROR` | 发生错误 | `cause` |

### 5.3 HANGUP 指令（主叫 → 被叫）

详细格式见 [3.5 挂断呼叫](#35-挂断呼叫)

**cause 取值**：

| cause | 触发条件 |
|-------|---------|
| `NORMAL_CLEARING` | 通话建立后正常挂断 |
| `USER_BUSY` | 振铃后未接听（拒接/忙线） |

---

## 6. 呼叫流程

### 6.1 正常呼叫流程

```
主叫端 (Caller)                    被叫端 (Callee)
     |                                  |
     |--- 1. 订阅 evt/call ------------>|
     |--- 2. 订阅 evt/presence -------->|
     |                                  |
     |--- 3. 发布 CALL 指令 ----------->|
     |                                  |--- 收到 CALL
     |                                  |--- 检查状态（空闲）
     |                                  |--- 4. 发布 CALLING
     |<-- 收到 CALLING -----------------|
     |                                  |--- 5. 发布 RINGING
     |<-- 收到 RINGING -----------------|
     |                                  |--- 显示振铃界面
     |                                  |--- 用户点击"接听"
     |                                  |--- 6. 发布 ANSWERED
     |<-- 收到 ANSWERED ----------------|
     |--- 7. 加入 RTC 频道              |--- 8. 加入 RTC 频道
     |                                  |
     |      ====== RTC 通话中 ======     |
     |                                  |
     |--- 9. 用户点击"挂断"             |
     |--- 10. 发布 HANGUP 指令 -------->|
     |                                  |--- 收到 HANGUP
     |                                  |--- 11. 发布 HANGUP 状态
     |<-- 收到 HANGUP ------------------|
     |--- 12. 离开 RTC 频道             |--- 13. 离开 RTC 频道
     |--- 14. 清理会话                  |--- 15. 清理会话
     |                                  |
```

### 6.2 被叫忙线流程

```
主叫端                              被叫端
     |                                  |
     |--- 发布 CALL 指令 -------------->|
     |                                  |--- 收到 CALL
     |                                  |--- 检查状态（忙碌）
     |                                  |--- 发布 HANGUP (DEVICE_BUSY)
     |<-- 收到 HANGUP ------------------|
     |--- 显示"设备忙线"                |
```

### 6.3 被叫离线流程

```
主叫端                              被叫端
     |                                  |
     |--- 订阅 evt/presence ----------->|
     |                                  |--- 断开连接
     |                                  |--- 发布 device_offline
     |<-- 收到 device_offline ----------|
     |--- 清理会话状态                  |
     |--- 离开 RTC 频道（如果在通话）   |
```

---

## 7. 状态机

### 7.1 被叫端状态机

```
         ┌─────────────────────────────────────┐
         │              IDLE                    │
         │         (空闲，等待呼叫)              │
         └──────────────┬──────────────────────┘
                        │
                   收到 CALL
                        │
                        ▼
         ┌─────────────────────────────────────┐
         │             CALLING                  │
         │          (正在处理呼叫)               │
         └──────────────┬──────────────────────┘
                        │
                   检查设备状态
                        │
            ┌───────────┴───────────┐
            │                       │
         忙线/错误                设备空闲
            │                       │
            ▼                       ▼
   ┌────────────────┐    ┌─────────────────────────┐
   │   HANGUP       │    │         RINGING          │
   │ (DEVICE_BUSY)  │    │       (振铃中)            │
   └────────────────┘    └──────────┬──────────────┘
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                      用户接听             用户拒接
                          │                   │
                          ▼                   ▼
               ┌──────────────────┐  ┌────────────────┐
               │    ANSWERED      │  │    HANGUP      │
               │   (通话接通)      │  │  (USER_BUSY)   │
               └────────┬─────────┘  └────────────────┘
                        │
                   通话中...
                        │
                   任一方挂断
                        │
                        ▼
               ┌──────────────────┐
               │     HANGUP       │
               │ (NORMAL_CLEARING)│
               └────────┬─────────┘
                        │
                        ▼
         ┌─────────────────────────────────────┐
         │              IDLE                    │
         │         (返回空闲状态)                │
         └─────────────────────────────────────┘
```

### 7.2 主叫端状态机

```
         ┌─────────────────────────────────────┐
         │              IDLE                    │
         │         (空闲，等待用户操作)           │
         └──────────────┬──────────────────────┘
                        │
                  用户点击"呼叫"
                        │
                        ▼
         ┌─────────────────────────────────────┐
         │             CALLING                  │
         │       (已发起呼叫，等待接听)          │
         └──────────────┬──────────────────────┘
                        │
                收到被叫状态上报
                        │
            ┌───────────┼───────────┐
            │           │           │
         RINGING    ANSWERED    HANGUP/ERROR
            │           │           │
            ▼           ▼           ▼
   ┌────────────┐ ┌──────────┐ ┌──────────┐
   │  CALLING   │ │ ANSWERED │ │  HANGUP  │
   │ (等待接听)  │ │ (通话中)  │ │ (已结束)  │
   └────────────┘ └────┬─────┘ └──────────┘
                       │
                  任一方挂断
                       │
                       ▼
              ┌──────────────────┐
              │     HANGUP       │
              │   (通话结束)      │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │      IDLE        │
              │   (返回空闲)      │
              └──────────────────┘
```

---

## 8. 错误处理

### 8.1 常见错误场景

| 场景 | 处理方式 | cause 值 |
|------|---------|---------|
| 被叫设备忙线 | 立即返回 HANGUP | `DEVICE_BUSY` |
| 被叫拒接 | 上报 HANGUP | `USER_BUSY` |
| 被叫离线 | 主叫收到 presence 通知 | - |
| 网络错误 | 上报 ERROR | `HFP_NOT_CONNECT` |
| 未插 SIM 卡 | 上报 ERROR | `HFP_NO_SIM` |

### 8.2 消息去重

由于使用 QoS 1，同一条消息可能被多次接收。

**去重策略**：
- 使用 `agent_id` + `timestamp` + `to` 三个字段组合作为消息签名
- 如果与最近一次收到的消息签名相同，则丢弃

**实现示例**：
```javascript
let lastSignature = "";

function isDuplicateMessage(payload) {
  const signature = [
    payload?.agent_id ?? "",
    payload?.timestamp ?? "",
    payload?.to ?? ""
  ].join("|");
  
  if (signature === lastSignature) {
    return true;  // 重复消息
  }
  lastSignature = signature;
  return false;
}
```

### 8.3 重连机制

- MQTT 客户端设置 `reconnectPeriod: 2000`（2秒重连间隔）
- 重连后需要重新订阅主题
- 被叫重连后需要重新发布 `device_online` 状态

---

## 📚 附录

### A. 主题速查表

| 端 | 操作 | Topic | 消息类型 |
|----|------|-------|---------|
| 主叫 | SUBSCRIBE | `d/{appid}/{device_id}/evt/call` | call_state |
| 主叫 | SUBSCRIBE | `d/{appid}/evt/presence` | presence |
| 主叫 | PUBLISH | `d/{appid}/{device_id}/call` | call, hangup |
| 被叫 | SUBSCRIBE | `d/{appid}/{device_id}/call` | call, hangup |
| 被叫 | PUBLISH | `d/{appid}/{device_id}/evt/call` | call_state |
| 被叫 | PUBLISH | `d/{appid}/{device_id}/evt/presence` | presence |
| 被叫 | PUBLISH | `d/{appid}/{device_id}/evt/device` | device_event |

### B. 状态速查表

| 状态 | 说明 | 方向 |
|------|------|------|
| CALLING | 正在拨号 | 被叫 → 主叫 |
| RINGING | 振铃中 | 被叫 → 主叫 |
| ANSWERED | 已接通 | 被叫 → 主叫 |
| HANGUP | 已挂断 | 双向 |
| ERROR | 错误 | 被叫 → 主叫 |
| device_online | 设备在线 | 被叫 → 主叫 |
| device_offline | 设备离线 | 被叫 → 主叫 |

---

**文档版本**：v1.0  
**更新日期**：2024-01-01  
**维护者**：开发团队
