const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const APP_ID = process.env.APP_ID;
const TOKEN_URL = `https://api-test.sd-rtn.com/v1/projects/${APP_ID}/mqtt/token`;
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
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor",
  express.static(path.join(__dirname, "node_modules", "mqtt", "dist")),
);
app.use(
  "/agora",
  express.static(path.join(__dirname, "Agora_Web_SDK")),
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
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/caller", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "caller.html"));
});

app.get("/callee", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "callee.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MQTT demo server listening on http://127.0.0.1:${PORT}`);
});
