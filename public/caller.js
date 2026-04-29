import {
  STATE_TEXT,
  buildCallPayload,
  buildHangupCommandPayload,
  buildTopic,
  createCallerTokenRequest,
  createLogger,
  createMqttClient,
  hasAclPermission,
  loadConfig,
  normalizeDeviceId,
  publishMessage,
  requestMqttToken,
  safeJsonParse,
  subscribeTopic,
  waitForConnect,
  randomId,
  createAgoraClient,
  joinAgoraChannel,
  leaveAgoraChannel,
  setupAgoraEventListeners,
} from "./common.js";

const elements = {
  phoneNumber: document.querySelector("#phoneNumber"),
  deviceId: document.querySelector("#deviceId"),
  uid: document.querySelector("#uid"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  callButton: document.querySelector("#callButton"),
  hangupButton: document.querySelector("#hangupButton"),
  mqttState: document.querySelector("#mqttState"),
  callState: document.querySelector("#callState"),
  callSummary: document.querySelector("#callSummary"),
  logs: document.querySelector("#logs"),
  rtcPanel: document.querySelector("#rtcPanel"),
  localUid: document.querySelector("#localUid"),
  rtcStatus: document.querySelector("#rtcStatus"),
};

const log = createLogger(elements.logs);

let config;
let client;
let currentSession = null;
let lastRemoteState = "IDLE";

// Agora RTC 相关变量
let agoraClient = null;
let localTracks = null;

function setMqttState(state) {
  elements.mqttState.textContent = STATE_TEXT[state] || state;
}

function setCallState(state, summary) {
  lastRemoteState = state;
  elements.callState.textContent = STATE_TEXT[state] || state;
  elements.callSummary.textContent = summary;
}

function syncButtons() {
  const connected = Boolean(client?.connected);
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  elements.callButton.disabled = !connected || Boolean(currentSession);
  elements.hangupButton.disabled = !connected || !currentSession;
}

function validateUid() {
  const uid = Number(elements.uid.value.trim());
  if (!Number.isInteger(uid)) {
    throw new Error("主叫 UID 必须是 int 整数");
  }
  return uid;
}

async function connectMqtt() {
  const uid = validateUid();
  const deviceId = elements.deviceId.value.trim();
  if (!deviceId) {
    throw new Error("被叫 Device ID 不能为空");
  }
  const rawDeviceId = deviceId;

  if (!config) {
    config = await loadConfig();
  }

  setMqttState("CONNECTING");
  setCallState("IDLE", "正在申请 JWT Token 并连接 MQTT...");
  syncButtons();

  const tokenRequest = createCallerTokenRequest(config.appId, uid, deviceId);
  log("申请 MQTT Token", tokenRequest);
  const token = await requestMqttToken(tokenRequest);
  const eventTopic = buildTopic(config.appId, rawDeviceId, "evt/call");
  const callTopic = buildTopic(config.appId, rawDeviceId, "call");

  if (!hasAclPermission(token, "subscribe", eventTopic)) {
    throw new Error(
      `当前 Token 无权订阅被叫状态主题：${eventTopic}。`,
    );
  }
  if (!hasAclPermission(token, "publish", callTopic)) {
    throw new Error(
      `当前 Token 无权发布呼叫主题：${callTopic}。`,
    );
  }

  client = createMqttClient({
    mqttWsUrl: config.mqttWsUrl,
    clientId: tokenRequest.clientId,
    username: tokenRequest.username,
    token,
    log,
  });
  const onReconnect = () => {
    setMqttState("CONNECTING");
    log("MQTT 正在重连");
  };
  const onClose = () => {
    setMqttState("IDLE");
    syncButtons();
    log("MQTT 连接已关闭");
  };
  const onError = (error) => {
    setMqttState("ERROR");
    log("MQTT 连接异常", error.message);
  };

  client.on("reconnect", onReconnect);
  client.on("close", onClose);
  client.on("error", onError);

  client.on("message", async (_topic, message) => {
    const payload = safeJsonParse(message);
    if (!payload || payload.event_type !== "call_state") {
      return;
    }
    const summary = `${payload.state}${payload.cause ? ` / ${payload.cause}` : ""}`;
    setCallState(payload.state, `被叫最新状态：${summary}`);
    log("收到被叫状态上报", payload);

    // 当收到 ANSWERED 状态时，加入 RTC 频道
    if (payload.state === "ANSWERED" && !agoraClient) {
      await joinRtcChannel(payload);
    }

    if (payload.state === "HANGUP" || payload.state === "ERROR") {
      // 离开 RTC 频道
      await leaveRtcChannel();
      currentSession = null;
      syncButtons();
    }
  });

  await waitForConnect(client);

  await subscribeTopic(client, eventTopic);
  setMqttState("CONNECTED");
  setCallState(lastRemoteState, `已用被叫 Device ID 身份连接，并订阅：${eventTopic}`);
  log("MQTT 已连接并完成订阅", {
    clientId: tokenRequest.clientId,
    eventTopic,
  });
  syncButtons();
}

function disconnectMqtt() {
  if (!client) {
    return;
  }
  client.end(true);
  client = null;
  currentSession = null;
  leaveRtcChannel();
  setMqttState("IDLE");
  setCallState("IDLE", "连接已断开");
  syncButtons();
}

async function joinRtcChannel(callStatePayload) {
  try {
    elements.rtcPanel.hidden = false;
    elements.rtcStatus.textContent = "正在加入语音频道...";
    
    // 使用呼叫指令中的参数加入 RTC 频道
    const appId = callStatePayload.appid || config.appId;
    const channel = callStatePayload.channel;
    const uid = 0; // 主叫 UID 固定为 0
    const token = ""; // 默认为空
    
    log("主叫准备加入语音频道", { appId, channel, uid });
    
    // 创建 Agora 客户端
    agoraClient = createAgoraClient();
    
    // 设置事件监听器
    setupAgoraEventListeners(agoraClient, {
      onUserPublished: (user, mediaType) => {
        log("远端用户发布音频流", { uid: user.uid, mediaType });
      },
      onUserUnpublished: (user, mediaType) => {
        log("远端用户取消发布音频流", { uid: user.uid, mediaType });
      },
    });
    
    // 加入频道并发布本地音频流
    localTracks = await joinAgoraChannel(agoraClient, appId, channel, uid, token, log);
    
    elements.localUid.textContent = localTracks.uid;
    elements.rtcStatus.textContent = "语音通话已连接";
    
    // 更新音频指示器状态
    const indicator = document.querySelector("#audioIndicator");
    if (indicator) {
      indicator.classList.remove("inactive");
      indicator.classList.add("active");
    }
    
    log("主叫已成功加入语音频道", { uid: localTracks.uid });
  } catch (error) {
    elements.rtcStatus.textContent = "语音连接失败";
    log("主叫加入语音频道失败", error.message);
  }
}

async function leaveRtcChannel() {
  if (!agoraClient) {
    return;
  }
  
  await leaveAgoraChannel(agoraClient, localTracks, log);
  
  // 清理
  agoraClient = null;
  localTracks = null;
  elements.rtcPanel.hidden = true;
  elements.localUid.textContent = "-";
  elements.rtcStatus.textContent = "RTC 未连接";
  
  // 重置音频指示器状态
  const indicator = document.querySelector("#audioIndicator");
  if (indicator) {
    indicator.classList.remove("active");
    indicator.classList.add("inactive");
  }
  
  log("主叫已离开语音频道");
}

async function placeCall() {
  if (!client?.connected) {
    throw new Error("请先连接 MQTT");
  }

  const uid = validateUid();
  const deviceId = elements.deviceId.value.trim();
  const rawDeviceId = deviceId;
  const phoneNumber = elements.phoneNumber.value.trim();
  if (!phoneNumber) {
    throw new Error("被叫手机号码不能为空");
  }

  const payload = buildCallPayload({
    appId: config.appId,
    deviceId: rawDeviceId,
    phoneNumber,
    uid,
    callUuid: randomId("CALL-"),
    peerUuid: randomId("PEER-"),
  });

  currentSession = payload;
  setCallState("CALLING", `已发起呼叫，等待被叫状态更新...`);
  syncButtons();

  const callTopic = buildTopic(config.appId, rawDeviceId, "call");
  await publishMessage(client, callTopic, payload);
  log("已发布 CALL 指令", { topic: callTopic, payload });
}

async function hangupCall() {
  if (!client?.connected || !currentSession) {
    return;
  }
  const callTopic = buildTopic(config.appId, currentSession.device_id, "call");
  const payload = buildHangupCommandPayload(currentSession, String(validateUid()));
  await publishMessage(client, callTopic, payload);
  log("已发布挂断指令", { topic: callTopic, payload });
  setCallState("HANGUP", "已发送挂断指令，等待被叫最终状态");
}

elements.connectButton.addEventListener("click", async () => {
  try {
    await connectMqtt();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMqttState("ERROR");
    setCallState("ERROR", message);
    log("连接失败", message);
    syncButtons();
  }
});

elements.disconnectButton.addEventListener("click", () => {
  disconnectMqtt();
});

elements.callButton.addEventListener("click", async () => {
  try {
    await placeCall();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setCallState("ERROR", message);
    log("发起呼叫失败", message);
  }
});

elements.hangupButton.addEventListener("click", async () => {
  try {
    await hangupCall();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setCallState("ERROR", message);
    log("挂断失败", message);
  }
});

syncButtons();
setMqttState("IDLE");
setCallState("IDLE", "等待建立 MQTT 连接。");
