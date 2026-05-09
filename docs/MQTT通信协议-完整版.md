# MQTT 通信协议文档

本文档详细说明 MQTT 语音呼叫系统的完整通信协议，包括主叫端、被叫端的信令交互以及设备状态管理。

## 📋 目录

- [1. 概述](#1-概述)
- [2. 连接参数](#2-连接参数)
- [3. 主题约定](#3-主题约定)
- [4. 主叫端协议](#4-主叫端协议)
- [5. 被叫端协议](#5-被叫端协议)
- [6. 消息格式](#6-消息格式)
- [7. 呼叫流程](#7-呼叫流程)
- [8. 状态机](#8-状态机)
- [9. 设备在线/离线事件（Presence）](#9-设备在线离线事件presence)
- [10. 错误处理](#10-错误处理)

---

## 1. 概述

### 1.1 系统架构

```
主叫端 (Caller)          MQTT Broker          被叫端 (Callee)
     |                       |                      |
     |--- 订阅状态主题 ------>|                      |
     |                       |<--- 连接/断开 --------|
     |<-- 收到在线/离线事件 --|                      |
     |                       |                      |
     |--- 发起 CALL -------->|--- 转发 CALL ------->|
     |                       |<-- 上报状态 ----------|
     |<-- 收到状态上报 -------|                      |
     |                       |                      |
     |      ====== RTC 语音通话 ======              |
```

### 1.2 核心功能

- ✅ MQTT 信令交互（呼叫/接听/挂断）
- ✅ 声网 Agora RTC 语音通话（G722 编码）
- ✅ RTC Token 鉴权（安全加入频道）
- ✅ 设备在线/离线状态监控（MQTT Broker 自动发布）
- ✅ 完整的呼叫状态机
- ✅ 呼叫超时自动取消
- ✅ 对方离线兜底处理

---

## 2. 连接参数

### 2.1 主叫端连接参数

| 参数 | 值 | 说明 |
|------|-----|------|
| **Client ID** | `{appid}-caller-{uid}` | 主叫唯一标识，使用主叫 UID |
| **Username** | `{uid}` | 主叫 UID |
| **Password** | JWT Token | 通过 API 获取 |
| **QoS** | 1 | 至少一次交付 |

**示例**：
```
Client ID: b664384754fe434d84eab573961fd44c-caller-666
Username: 666
Password: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2 被叫端连接参数

| 参数 | 值 | 说明 |
|------|-----|------|
| **Client ID** | `{appid}-{device_id}` | 被叫唯一标识，使用设备 ID |
| **Username** | `{device_id}` | 设备 ID（小写） |
| **Password** | JWT Token | 通过 API 获取 |
| **QoS** | 1 | 至少一次交付 |

**示例**：
```
Client ID: b664384754fe434d84eab573961fd44c-acp-sp2617xxxxx1
Username: acp-sp2617xxxxx1
Password: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **注意**：
- Device ID 在订阅和发布时**直接透传**，不做任何转换
- 确保 Device ID 在系统中**唯一**，多个客户端使用相同 Device ID 会导致互相踢下线
- MQTT Broker 根据 Client ID 判断连接唯一性，相同 Client ID 的新连接会使旧连接断开

---

## 3. 主题约定

### 3.1 主题模式

所有主题遵循以下模式：
```
d/{appid}/{device_id}/{suffix}
```

其中：
- `d` - 固定前缀，表示 device
- `{appid}` - 声网 App ID
- `{device_id}` - 被叫设备 ID
- `{suffix}` - 主题后缀（call、evt/call、evt/presence 等）

### 3.2 主叫端主题

| 方向 | Topic 模式 | 作用 | QoS |
|------|------------|------|-----|
| **SUBSCRIBE** | `d/{appid}/{device_id}/evt/call` | 接收被叫的通话状态上报 | 1 |
| **SUBSCRIBE** | `d/{appid}/{device_id}/evt/presence` | 接收被叫设备在线/离线状态（**Broker 自动发布**） | 1 |
| **PUBLISH** | `d/{appid}/{device_id}/call` | 向被叫发起呼叫请求 | 1 |
| **PUBLISH** | `d/{appid}/{device_id}/stop` | 向被叫发送挂断指令 | 1 |

**示例**：
```
订阅: d/b664384754fe434d84eab573961fd44c/acp-sp2617xxxxx1/evt/call
订阅: d/b664384754fe434d84eab573961fd44c/acp-sp2617xxxxx1/evt/presence
发布: d/b664384754fe434d84eab573961fd44c/acp-sp2617xxxxx1/call
发布: d/b664384754fe434d84eab573961fd44c/acp-sp2617xxxxx1/stop
```

### 3.3 被叫端主题

| 方向 | Topic 模式 | 作用 | QoS |
|------|------------|------|-----|
| **SUBSCRIBE** | `d/{appid}/{device_id}/call` | 接收主叫的呼叫请求 | 1 |
| **SUBSCRIBE** | `d/{appid}/{device_id}/stop` | 接收主叫的挂断指令 | 1 |
| **PUBLISH** | `d/{appid}/{device_id}/evt/call` | 上报通话状态 | 1 |
| **PUBLISH** | `d/{appid}/{device_id}/evt/device` | 上报设备事件（启动时） | 1 |

**示例**：
```
订阅: d/b664384754fe434d84eab573961fd44c/acp-sp2617xxxxx1/call
订阅: d/b664384754fe434d84eab573961fd44c/acp-sp2617xxxxx1/stop
发布: d/b664384754fe434d84eab573961fd44c/acp-sp2617xxxxx1/evt/call
发布: d/b664384754fe434d84eab573961fd44c/acp-sp2617xxxxx1/evt/device
```

⚠️ **重要**：被叫端**不发布** `evt/presence` 主题，该主题由 MQTT Broker 自动发布。

### 3.4 系统主题（MQTT Broker 自动发布）

| 主题 | 说明 |
|------|------|
| `d/{appid}/{device_id}/evt/presence` | 设备在线/离线状态（**由 Broker 自动发布，客户端无需手动发布**） |

**工作原理**：
- 当设备连接 MQTT 时，Broker 自动发布 `device_online` 事件
- 当设备断开连接时（包括突然断网），Broker 自动发布 `device_offline` 事件
- 主叫端订阅此主题以监听被叫设备的在线状态

---

## 4. 主叫端协议

### 4.1 连接流程

```
1. 申请 JWT Token
   └── 使用 uid 和 deviceId 调用 Token API

2. 连接 MQTT Broker
   └── 使用 Token 作为 Password

3. 订阅主题
   ├── d/{appid}/{device_id}/evt/call    (被叫状态)
   └── d/{appid}/{device_id}/evt/presence (设备在线状态，Broker 自动发布)

4. 等待用户操作
   └── 用户点击"呼叫"按钮
```

### 4.2 发起呼叫

**主题**：`d/{appid}/{device_id}/call`

**操作**：PUBLISH

**消息格式**：
```json
{
  "agent_id": "A42AJ96AR26KC52KH29EP94EC66KT74T",
  "appid": "b664384754fe434d84eab573961fd44c",
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
  "vid": "130451"
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `event_type` | string | 固定为 `"call"` |
| `appid` | string | 声网 App ID |
| `device_id` | string | 被叫设备 ID |
| `channel` | string | RTC 频道名（格式：`{device_id}-{phone_number}`） |
| `uid` | string | 被叫 UID（被叫使用该 uid 加入 RTC） |
| `token` | string | **RTC Token**（为主叫生成，传递给被叫） |
| `to` | string | 被叫手机号码 |
| `uuid` | string | 呼叫唯一标识（CALL-开头） |
| `peer_uuid` | string | 对端标识（PEER-开头） |
| `labels` | object | 透传标签，状态上报时原样返回 |

### 4.3 接收状态上报

**主题**：`d/{appid}/{device_id}/evt/call`

**操作**：SUBSCRIBE

**处理逻辑**：
```javascript
if (payload.event_type === "call_state") {
  switch (payload.state) {
    case "CALLING":
      // 被叫正在处理呼叫
      break;
    case "RINGING":
      // 被叫振铃中
      break;
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

### 4.4 接收设备在线/离线状态

**主题**：`d/{appid}/{device_id}/evt/presence`

**操作**：SUBSCRIBE

**重要说明**：该主题由 **MQTT Broker 自动发布**，被叫端无需手动发布。

**处理逻辑**：
```javascript
// 处理设备在线事件
if (payload.event_type === "device_online") {
  log("✅ 收到被叫在线事件", {
    device_id: payload.device_id,
    connected_at: payload.connected_at,
  });
}

// 处理设备离线事件
if (payload.event_type === "device_offline") {
  log("❌ 收到被叫离线事件", {
    device_id: payload.device_id,
    cause: payload.cause,
    disconnected_at: payload.disconnected_at,
  });
  
  if (currentSession) {
    // 振铃或通话中离线，执行兜底处理
    clearCallTimeout();
    leaveRtcChannel();
    currentSession = null;
    setCallState("ERROR", "被叫设备已离线，通话已结束");
  }
}
```

**事件格式**：

**在线事件**：
```json
{
  "event_type": "device_online",
  "appid": "b664384754fe434d84eab573961fd44c",
  "device_id": "acp-sp2617xxxxx1",
  "timestamp": 1234567890,
  "connected_at": 1234567890
}
```

**离线事件**：
```json
{
  "event_type": "device_offline",
  "appid": "b664384754fe434d84eab573961fd44c",
  "cause": "tcp_closed",
  "device_id": "acp-sp2617xxxxx1",
  "timestamp": 1234567900,
  "disconnected_at": 1234567900,
  "connected_at": 1234567890
}
```

### 4.5 挂断呼叫

**主题**：`d/{appid}/{device_id}/stop`

**操作**：PUBLISH

**消息格式**：
```json
{
  "appid": "b664384754fe434d84eab573961fd44c"
}
```

**说明**：
- 主叫点击挂断按钮时，向被叫发送 STOP 指令
- 消息格式简化，只需包含 appid 即可
- 被叫收到后会离开 RTC 频道并上报 HANGUP 状态

---

## 5. 被叫端协议

### 5.1 连接流程

```
1. 申请 JWT Token
   └── 使用 deviceId 调用 Token API

2. 连接 MQTT Broker
   └── 使用 Token 作为 Password

3. 订阅主题
   ├── d/{appid}/{device_id}/call    (呼叫指令)
   └── d/{appid}/{device_id}/stop    (挂断指令)

4. 发布设备事件
   └── evt/device     (设备启动事件)

注意：被叫端无需发布 evt/presence，由 MQTT Broker 自动发布
```

### 5.2 接收呼叫请求

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

### 5.3 接收挂断指令

**主题**：`d/{appid}/{device_id}/stop`

**操作**：SUBSCRIBE

**消息格式**：
```json
{
  "appid": "b664384754fe434d84eab573961fd44c"
}
```

**处理逻辑**：
```javascript
// 收到 STOP 指令后
if (activeSession) {
  // 1. 离开 RTC 频道
  await leaveRtcChannel();
  
  // 2. 上报 HANGUP 状态
  publishState("HANGUP", {
    cause: activeSession.answeredAt ? "NORMAL_CLEARING" : "USER_BUSY",
    duration_sec: durationSec,
    billsec: durationSec
  });
  
  // 3. 清理会话
  resetSession("主叫已挂断。");
}
```

### 5.4 接听呼叫

**主题**：`d/{appid}/{device_id}/evt/call`

**操作**：PUBLISH

**消息格式**：
```json
{
  "event_type": "call_state",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "appid": "b664384754fe434d84eab573961fd44c",
  "vid": 130451,
  "labels": { ... },
  "channel": "acp-sp2617xxxxx1-13800138000",
  "call_id": "",
  "state": "ANSWERED",
  "seq": 3,
  "uuid": "CALL-xxxxxxxx",
  "peer_uuid": "PEER-xxxxxxxx",
  "agent_id": "A42AJ96AR26KC52KH29EP94EC66KT74T",
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

### 5.5 上报通话状态

**主题**：`d/{appid}/{device_id}/evt/call`

**操作**：PUBLISH

**状态流转**：
```
CALLING → RINGING → ANSWERED → HANGUP
                      ↓
                   ERROR (如果发生错误)
```

### 5.6 设备在线/离线事件（由 Broker 自动发布）

**重要说明**：被叫端**无需手动发布** presence 事件，MQTT Broker 会自动处理设备连接状态。

**触发时机**：
- 被叫连接 MQTT → Broker 自动发布 `device_online`
- 被叫断开连接（包括突然断网） → Broker 自动发布 `device_offline`

**主叫端订阅此主题以监听被叫状态**，详细的消息格式和处理逻辑请参考 [4.4 接收设备在线/离线状态](#44-接收设备在线离线状态)。

**优势**：
- ✅ **可靠性**：即使被叫突然断网，Broker 也能及时检测
- ⚡ **实时性**：连接断开后立即发布，延迟低
- 🎯 **简化代码**：被叫端无需手动发布 presence 事件

---

## 6. 消息格式

### 6.1 CALL 指令（主叫 → 被叫）

详细格式见 [4.2 发起呼叫](#42-发起呼叫)

### 6.2 状态上报（被叫 → 主叫）

**通用格式**：
```json
{
  "event_type": "call_state",
  "timestamp": "ISO 8601 格式时间戳",
  "appid": "b664384754fe434d84eab573961fd44c",
  "vid": 130451,
  "labels": { ... },
  "channel": "RTC 频道名",
  "call_id": "",
  "state": "状态值",
  "seq": 序号,
  "uuid": "呼叫 UUID",
  "peer_uuid": "对端 UUID",
  "agent_id": "A42AJ96AR26KC52KH29EP94EC66KT74T",
  "device_id": "acp-sp2617xxxxx1",
  "service": "",
  "direction": "outbound",
  "from": "acp-sp2617xxxxx1",
  "to": "13800138000"
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

**HANGUP cause 取值**：

| cause | 触发条件 |
|-------|---------|
| `NORMAL_CLEARING` | 通话建立后正常挂断 |
| `USER_BUSY` | 振铃后未接听（拒接/忙线） |
| `DEVICE_BUSY` | 设备正在通话中，拒绝新呼叫 |

**ERROR cause 取值**：

| cause | 触发条件 |
|-------|---------|
| `HFP_NOT_CONNECT` | 收到 CALL 消息时 HFP 未连接 |
| `HFP_NO_SIM` | 手机未插 SIM 卡，ATD 返回 ERROR |

### 6.3 STOP 指令（主叫 → 被叫）

详细格式见 [4.5 挂断呼叫](#45-挂断呼叫)

### 6.4 设备事件上报

**主题**：`d/{appid}/{device_id}/evt/device`

**消息格式**：
```json
{
  "phone_num": "+8618121335**7",
  "app_version": "1.0.0"
}
```

**上报时机**：设备启动时

---

## 7. 呼叫流程

### 7.1 正常呼叫流程

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
     |--- 10. 发布 STOP 指令 ---------->|
     |                                  |--- 收到 STOP
     |                                  |--- 11. 发布 HANGUP 状态
     |<-- 收到 HANGUP ------------------|
     |--- 12. 离开 RTC 频道             |--- 13. 离开 RTC 频道
     |--- 14. 清理会话                  |--- 15. 清理会话
     |                                  |
```

### 7.2 被叫忙线流程

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

### 7.3 被叫离线流程

```
主叫端                              被叫端
     |                                  |
     |--- 订阅 evt/presence ----------->|
     |                                  |--- 断开连接（包括突然断网）
     |                                  |
     |                                  |--- MQTT Broker 检测到断开
     |                                  |--- Broker 自动发布 device_offline
     |<-- 收到 device_offline ----------|
     |--- 清理会话状态                  |
     |--- 离开 RTC 频道（如果在通话）   |
     |--- 更新 UI 显示离线              |
```

---

## 8. 状态机

### 8.1 被叫端状态机

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

### 8.2 主叫端状态机

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

## 9. 设备在线/离线事件（Presence）

### 9.1 概述

**重要说明**：设备在线/离线状态由 **MQTT Broker 自动发布**，而非客户端手动发布。

**工作原理**：
1. 被叫端连接 MQTT → Broker 自动发布 `device_online` 事件
2. 被叫端断开连接（包括突然断网） → Broker 自动发布 `device_offline` 事件
3. 主叫端订阅 `evt/presence` 主题 → 接收并处理这些事件

### 9.2 设备在线事件

**触发时机**：设备成功连接 MQTT Broker 时

**消息格式**：
```json
{
  "event_type": "device_online",
  "appid": "b664384754fe434d84eab573961fd44c",
  "device_id": "acp-sp2617xxxxx1",
  "timestamp": 1234567890,
  "connected_at": 1234567890
}
```

| 字段 | 说明 |
|------|------|
| `event_type` | 固定为 `"device_online"` |
| `appid` | 应用 ID |
| `device_id` | 设备 ID（与 username 相同） |
| `timestamp` | 事件时间戳（Unix 时间戳，秒） |
| `connected_at` | 连接建立时间（Unix 时间戳，秒） |

### 9.3 设备离线事件

**触发时机**：设备与 MQTT Broker 断开连接时（包括突然断网）

**消息格式**：
```json
{
  "event_type": "device_offline",
  "appid": "b664384754fe434d84eab573961fd44c",
  "cause": "tcp_closed",
  "device_id": "acp-sp2617xxxxx1",
  "timestamp": 1234567900,
  "disconnected_at": 1234567900,
  "connected_at": 1234567890
}
```

| 字段 | 说明 |
|------|------|
| `event_type` | 固定为 `"device_offline"` |
| `appid` | 应用 ID |
| `cause` | 断开原因（见下表） |
| `device_id` | 设备 ID |
| `timestamp` | 事件时间戳（Unix 时间戳，秒） |
| `disconnected_at` | 连接断开时间（Unix 时间戳，秒） |
| `connected_at` | 之前的连接建立时间（Unix 时间戳，秒） |

**cause 常见取值**：

| cause | 说明 |
|-------|------|
| `tcp_closed` | TCP 连接正常关闭（客户端主动断开） |
| `keepalive_timeout` | 心跳超时（设备突然断网/崩溃） |
| `server_shutdown` | MQTT Broker 关闭 |
| `protocol_error` | 协议错误 |

### 9.4 主叫端处理逻辑

主叫端订阅 `evt/presence` 主题，根据事件类型执行不同逻辑：

**场景 1：振铃期间被叫离线**
```
收到 device_offline 事件
    ↓
清除呼叫超时定时器
    ↓
离开 RTC 频道（如果已加入）
    ↓
发送 STOP 指令（尽力而为）
    ↓
清理会话状态
    ↓
更新 UI："被叫设备已离线，通话已结束"
```

**场景 2：通话中被叫离线**
```
收到 device_offline 事件
    ↓
离开 RTC 频道
    ↓
清理会话状态
    ↓
更新 UI："被叫设备已离线，通话已结束"
```

**场景 3：空闲时被叫离线**
```
收到 device_offline 事件
    ↓
仅记录日志，不影响状态
```

### 9.5 优势

| 优势 | 说明 |
|------|------|
| **可靠性** | 即使被叫突然断网（拔网线/关WiFi），Broker 也能及时检测并发布事件 |
| **实时性** | 连接断开后立即发布，延迟低（通常 < 1 秒） |
| **准确性** | 包含断开原因（cause），便于诊断问题 |
| **简化代码** | 客户端无需手动发布 presence 事件，减少代码复杂度 |

---

## 10. 错误处理

### 10.1 常见错误场景

| 场景 | 处理方式 | cause 值 |
|------|---------|---------|
| 被叫设备忙线 | 立即返回 HANGUP | `DEVICE_BUSY` |
| 被叫拒接 | 上报 HANGUP | `USER_BUSY` |
| 被叫离线 | 主叫收到 presence 通知 | - |
| 网络错误 | 上报 ERROR | `HFP_NOT_CONNECT` |
| 未插 SIM 卡 | 上报 ERROR | `HFP_NO_SIM` |

### 10.2 消息去重

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

### 10.3 重连机制

- MQTT 客户端设置 `reconnectPeriod: 2000`（2秒重连间隔）
- 重连后需要重新订阅主题
- JWT Token 有效期为 1 小时，过期后需要手动重连获取新 Token

---

## 📚 附录

### A. 主题速查表

| 端 | 操作 | Topic | 消息类型 | 说明 |
|----|------|-------|---------|------|
| 主叫 | SUBSCRIBE | `d/{appid}/{device_id}/evt/call` | call_state | 接收被叫状态 |
| 主叫 | SUBSCRIBE | `d/{appid}/{device_id}/evt/presence` | device_online/offline | **接收 Broker 自动发布的在线/离线事件** |
| 主叫 | PUBLISH | `d/{appid}/{device_id}/call` | call | 发起呼叫 |
| 主叫 | PUBLISH | `d/{appid}/{device_id}/stop` | stop | 发送挂断指令 |
| 被叫 | SUBSCRIBE | `d/{appid}/{device_id}/call` | call | 接收呼叫指令 |
| 被叫 | SUBSCRIBE | `d/{appid}/{device_id}/stop` | stop | 接收挂断指令 |
| 被叫 | PUBLISH | `d/{appid}/{device_id}/evt/call` | call_state | 上报通话状态 |
| 被叫 | PUBLISH | `d/{appid}/{device_id}/evt/device` | device_event | 上报设备事件 |

### B. 状态速查表

| 状态 | 说明 | 方向 | 发布方式 |
|------|------|------|----------|
| CALLING | 正在拨号 | 被叫 → 主叫 | 被叫发布 |
| RINGING | 振铃中 | 被叫 → 主叫 | 被叫发布 |
| ANSWERED | 已接通 | 被叫 → 主叫 | 被叫发布 |
| HANGUP | 已挂断 | 双向 | 被叫发布/主叫指令 |
| ERROR | 错误 | 被叫 → 主叫 | 被叫发布 |
| device_online | 设备在线 | **Broker → 主叫** | **Broker 自动发布** |
| device_offline | 设备离线 | **Broker → 主叫** | **Broker 自动发布** |

### C. RTC Token 鉴权

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

---

**文档版本**：v2.0  
**更新日期**：2026-05-09  
**维护者**：开发团队
