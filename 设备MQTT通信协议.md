## 7. MQTT 通信协议

### 连接参数

| 参数 | 值 |
|------|-----|
| Client ID | `{appid}-{device_id}` |
| Username | `{device_id}` |
| Password | `d_agora_secret` 中存储的值 |
| QoS | 1 |

### 订阅主题

| 主题 | 说明 |
|------|------|
| `d/{appid}/{device_id}/call` | 接收呼叫指令（CALL 消息） |

### 发布主题

| 主题 | 说明 |
|------|------|
| `d/{appid}/{device_id}/evt/call` | 上报通话状态 |
| `d/{appid}/{device_id}/evt/device` | 上报设备事件 |

---

## 8. 呼叫流程

### 8.1 下行呼叫消息（CALL）

云端向设备发送呼叫指令，主题：`d/{appid}/{device_id}/call`

**消息格式：**

```json
{
    "agent_id": "A42AJ96AR26KC52KH29EP94EC66KT74T",
    "appid": "{YOUR_APP_ID}",
    "channel": "ACP-SP2617XXXXX1-1760218**87",
    "device_id": "ACP-SP2617XXXXX1",
    "event_type": "call",
    "from": "ACP-SP2617XXXXX1",
    "labels": {
        "_direction": "outbound",
        "_from_number": "ACP-SP2617XXXXX1",
        "_pipeline_id": "rtm888_1496117",
        "_source": "sip-manager",
        "_to_number": "1760218**87"
    },
    "peer_uuid": "019da902-f83e-703f-b55b-d6f17704a59a",
    "service": "",
    "timestamp": 1776657046,
    "to": "1760218**87",
    "token": "",
    "uid": "12345",
    "uuid": "019da902-f83e-703c-b4ae-ca2dd85122f3",
    "vid": "130451"
}
```

| 字段 | 说明 |
|------|------|
| `event_type` | 固定为 `"call"` |
| `to` | 被叫号码 |
| `channel` | Agora RTC 频道名 |
| `uid` | Agora RTC 用户 ID（十进制字符串） |
| `token` | Agora RTC Token（为空时不使用 Token） |
| `appid` | Agora AppID |
| `labels` | 透传字段，状态上报时原样返回 |
| `vid` | 业务 vid（字符串） |
| `uuid` | 本次呼叫唯一标识 |
| `peer_uuid` | 对端唯一标识 |

### 8.2 设备处理流程

```
收到 CALL 消息
    ↓
检查网络是否已连接
    ├── 未连接 → 上报 ERROR（cause: HFP_NOT_CONNECT）
    └── 已连接
        ↓
        检查是否有进行中的通话
        ├── 有 → 上报 HANGUP（cause: DEVICE_BUSY）
        └── 无
            ↓
            上报 CALLING
            ↓
            手机振铃（call_setup=2）→ 上报 RINGING
            ↓
            手机接听（call=1）→ 上报 ANSWERED
                              → 启动 Agora RTC，加入 channel
            ↓
            通话中
            ↓
            挂断 → 上报 HANGUP（cause 见下表）
```

### 8.3 上行状态上报

主题：`d/{appid}/{device_id}/evt/call`

**消息格式：**

```json
{
    "event_type": "call_state",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "appid": "{YOUR_APP_ID}",
    "vid": 130451,
    "labels": {
        "_direction": "outbound",
        "_from_number": "ACP-SP2617XXXXX1",
        "_pipeline_id": "rtm888_1496117",
        "_source": "sip-manager",
        "_to_number": "1760218**87"
    },
    "channel": "ACP-SP2617XXXXX1-1760218**87",
    "call_id": "",
    "state": "CALLING",
    "seq": 1,
    "uuid": "019da902-f83e-703c-b4ae-ca2dd85122f3",
    "peer_uuid": "019da902-f83e-703f-b55b-d6f17704a59a",
    "agent_id": "A42AJ96AR26KC52KH29EP94EC66KT74T",
    "device_id": "ACP-SP2617XXXXX1",
    "service": "",
    "direction": "outbound",
    "from": "ACP-SP2617XXXXX1",
    "to": "1760218**87"
}
```
	
**state 取值：**

| state | 说明 |
|-------|------|
| `CALLING` | 正在拨号 |
| `RINGING` | 对端振铃中 |
| `ANSWERED` | 通话已接通，附加 `answered_at` 字段 |
| `HANGUP` | 通话结束，附加 `cause`、`duration_sec`、`billsec` 字段 |
| `ERROR` | 发生错误，附加 `cause` 字段 |

**HANGUP cause 取值：**

| cause | 触发条件 |
|-------|---------|
| `NORMAL_CLEARING` | 通话建立后正常挂断 |
| `USER_BUSY` | 振铃后未接听（拒接/忙线） |
| `DEVICE_BUSY` | 设备正在通话中，拒绝新呼叫 |

**ERROR cause 取值：**

| cause | 触发条件 |
|-------|---------|
| `HFP_NOT_CONNECT` | 收到 CALL 消息时 HFP 未连接 |
| `HFP_NO_SIM` | 手机未插 SIM 卡，ATD 返回 ERROR |

**去重复逻辑：**
设备端订阅采用QOS1，理论上同一条消息可能存在收到多次
当前采用agent_id、timestamp、to三字段如果与最近一次一样就直接丢弃

---

### 8.4 设备事件上报

主题：`d/{appid}/{device_id}/evt/device`

**消息格式：**

```json
{
    "phone_num": "+8618121335**7", //主叫手机号
    "app_version": "1.0.0" //固件版本号
}
```
上报时机为设备启动时
