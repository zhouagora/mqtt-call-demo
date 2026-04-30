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
2. `Authorization`：Basic 认证，详见 [如何获取 BASIC_AUTH](#如何获取-basic-auth)
3. 业务参数命名规则：

| 参数        | 值                     |
| --------- | --------------------- |
| Client ID | `{appid}-{device_id}` |
| Username  | `{device_id}`         |

> 说明：`username`、`client_id`、`device_id` 分别对应设备的用户名、客户端ID、设备ID。

## 如何获取 BASIC AUTH

`Authorization` 字段使用声网 HTTP 基本认证，生成方法如下：

### 方法一：使用在线工具（最简单）

1. 登录 [声网控制台](https://console.agora.io/)
2. 进入项目详情，获取 **客户 ID** 和 **客户密钥**
3. 访问 https://www.base64encode.org/
4. 在编码框输入：`客户ID:客户密钥`（中间有冒号）
5. 点击“Encode”得到 Base64 字符串
6. 最终格式：`Basic {Base64字符串}`

### 方法二：使用命令行

```bash
# Linux/Mac
echo -n '客户ID:客户密钥' | base64

# 输出示例：YWJjMTIzOnNlY3JldDQ1Ng==
# 最终 Authorization: Basic YWJjMTIzOnNlY3JldDQ1Ng==
```

### 方法三：使用代码

**Node.js**：
```javascript
const customerKey = 'YOUR_CUSTOMER_KEY';
const customerSecret = 'YOUR_CUSTOMER_SECRET';
const auth = 'Basic ' + Buffer.from(`${customerKey}:${customerSecret}`).toString('base64');
console.log(auth);
```

**Python**：
```python
import base64
customer_key = 'YOUR_CUSTOMER_KEY'
customer_secret = 'YOUR_CUSTOMER_SECRET'
auth = 'Basic ' + base64.b64encode(f'{customer_key}:{customer_secret}'.encode()).decode()
print(auth)
```

> 📖 详细文档：[声网 HTTP 基本认证文档](https://doc.shengwang.cn/doc/convoai/restful/user-guides/http-basic-auth)

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

