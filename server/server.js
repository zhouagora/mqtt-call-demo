const express = require("express");
const path = require("path");
const { RtcTokenBuilder, RtcRole } = require("agora-token");
const { initCallRecordsDir, getCallRecords, saveCallRecord, updateCallRecord } = require("./call-records");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;
const APP_ID = process.env.APP_ID;
const APP_CERTIFICATE = process.env.APP_CERTIFICATE;
const TOKEN_URL = `https://api.sd-rtn.com/v1/projects/${APP_ID}/mqtt/token`;
const BASIC_AUTH = process.env.BASIC_AUTH;
const MQTT_WS_URL = process.env.MQTT_WS_URL;

// 验证必需的环境变量
if (!APP_ID) {
  console.error("错误: 未设置 APP_ID 环境变量");
  process.exit(1);
}
if (!BASIC_AUTH) {
  console.error("错误: 未设置 BASIC_AUTH 环境变量");
  process.exit(1);
}
if (!MQTT_WS_URL) {
  console.error("错误: 未设置 MQTT_WS_URL 环境变量");
  process.exit(1);
}

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(express.json());

// 初始化通话记录目录
initCallRecordsDir().catch(err => {
  console.error('[CDR] 初始化通话记录目录失败:', err.message);
});
app.use(express.static(path.join(__dirname, "..", "web", "public")));
app.use(
  "/vendor",
  express.static(path.join(__dirname, "..", "node_modules", "mqtt", "dist")),
);
app.use(
  "/agora",
  express.static(path.join(__dirname, "..", "sdk", "Agora_Web_SDK")),
);

app.get("/api/config", (_req, res) => {
  res.json({
    appId: APP_ID,
    mqttWsUrl: MQTT_WS_URL,
    tokenEndpoint: "/api/mqtt/token",
  });
});

app.post("/api/mqtt/token", async (req, res) => {
  const { username, clientId, deviceId } = req.body || {};

  if (!username || !clientId || !deviceId) {
    return res.status(400).json({
      code: -1,
      message: "username, clientId, deviceId are required",
    });
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: BASIC_AUTH,
      },
      body: JSON.stringify({
        username: String(username),
        client_id: String(clientId),
        device_id: String(deviceId),
      }),
    });

    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    res.status(500).json({
      code: -1,
      message: "token request failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "web", "public", "index.html"));
});

app.get("/caller", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "web", "public", "caller.html"));
});

app.get("/callee", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "web", "public", "callee.html"));
});

// 生成 RTC Token
app.post("/api/rtc/token", (req, res) => {
  const { channel, uid } = req.body;
  
  if (!channel || uid === undefined || uid === null) {
    return res.status(400).json({
      code: 1,
      message: "channel and uid are required",
    });
  }
  
  // 如果没有配置 APP_CERTIFICATE，返回空 Token（降级为静态 App ID 模式）
  if (!APP_CERTIFICATE || APP_CERTIFICATE === "your_app_certificate_here") {
    console.log("[警告] APP_CERTIFICATE 未配置，返回空 Token（使用静态 App ID 模式）");
    return res.json({
      code: 0,
      message: "success (no certificate, using empty token)",
      data: {
        token: "",  // 空 Token，表示不使用鉴权
        appId: APP_ID,
        channel,
        uid,
        expiresAt: null,
      },
    });
  }
  
  try {
    // Token 过期时间（秒）
    const tokenExpirationInSeconds = 3600; // 1小时
    const privilegeExpirationInSeconds = 3600;
    
    // 生成 Token
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channel,
      uid,
      RtcRole.PUBLISHER,
      tokenExpirationInSeconds,
      privilegeExpirationInSeconds
    );
    
    res.json({
      code: 0,
      message: "success",
      data: {
        token,
        appId: APP_ID,
        channel,
        uid,
        expiresAt: Math.floor(Date.now() / 1000) + tokenExpirationInSeconds,
      },
    });
  } catch (error) {
    console.error("生成 RTC Token 失败:", error);
    res.status(500).json({
      code: 1,
      message: "Failed to generate RTC token",
      error: error.message,
    });
  }
});

// 查询通话记录
app.get('/api/call-records', async (req, res) => {
  try {
    const { date, caller_uid, status } = req.query;
    const queryDate = date || new Date().toISOString().split('T')[0];
    
    const records = await getCallRecords(queryDate, { caller_uid, status });
    
    res.json({
      code: 0,
      data: records,
      total: records.length,
      date: queryDate
    });
  } catch (error) {
    console.error('[CDR] 查询通话记录失败:', error);
    res.status(500).json({
      code: 1,
      message: 'Failed to get call records',
      error: error.message
    });
  }
});

// 保存/更新通话记录
app.post('/api/call-records', async (req, res) => {
  try {
    const { action, call_uuid, ...data } = req.body;
    
    if (action === 'create') {
      await saveCallRecord({ call_uuid, ...data });
    } else if (action === 'update') {
      await updateCallRecord(call_uuid, data);
    } else {
      return res.status(400).json({
        code: 1,
        message: 'Invalid action. Use "create" or "update"'
      });
    }
    
    res.json({ code: 0, message: 'Success' });
  } catch (error) {
    console.error('[CDR] 保存通话记录失败:', error);
    res.status(500).json({
      code: 1,
      message: 'Failed to save call record',
      error: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MQTT demo server listening on http://127.0.0.1:${PORT}`);
  console.log('[CDR] 通话记录功能已启用');
});
