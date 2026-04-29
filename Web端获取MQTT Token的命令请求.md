# Web端获取MQTT JWT认证Token接口说明

## 一、请求命令

```bash
curl -X POST 'https://api-test.sd-rtn.com/v1/projects/{YOUR_APP_ID}/mqtt/token' \
-H 'Content-Type: application/json' \
-H 'Authorization: Basic {YOUR_BASIC_AUTH}' \
-d '{
"username": "12345",
"client_id": "{YOUR_APP_ID}-12345",
"device_id": "12345"
}'
```

## 二、参数说明

1. `{YOUR_APP_ID}`：替换为您的 Agora App ID
2. `Authorization`：Basic 认证，格式为 `Basic {Base64编码的username:password}`
3. 业务参数命名规则：

| 参数        | 值                     |
| --------- | --------------------- |
| Client ID | `{appid}-{device_id}` |
| Username  | `{device_id}`         |

> 说明：`username`、`client_id`、`device_id` 分别对应设备的用户名、客户端ID、设备ID。

## 三、接口返回示例

```json
{
    "code":0,
    "message":"success",
    "data":{
        "token":"{JWT_TOKEN_HERE}",
        "issued_at":1776677892,
        "expires_at":1776681492
    },
    "request_id":"18019b593a2b4354b92cc67318e470ad",
    "ts":1776677892
}
```

## 四、返回字段说明

- `token`：MQTT Token，用于设备连接 MQTT Broker。

