import {
  STATE_TEXT,
  buildCallStatePayload,
  buildDeviceEventPayload,
  buildTopic,
  createCalleeTokenRequest,
  createLogger,
  createMessageDeduper,
  createMqttClient,
  hasAclPermission,
  loadConfig,
  normalizeDeviceId,
  publishMessage,
  requestMqttToken,
  safeJsonParse,
  subscribeTopic,
  waitForConnect,
  isoNow,
  createAgoraClient,
  joinAgoraChannel,
  leaveAgoraChannel,
  setupAgoraEventListeners,
} from "./common.js";

const elements = {
  deviceId: document.querySelector("#deviceId"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  answerButton: document.querySelector("#answerButton"),
  rejectButton: document.querySelector("#rejectButton"),
  mqttState: document.querySelector("#mqttState"),
  callState: document.querySelector("#callState"),
  callSummary: document.querySelector("#callSummary"),
  ringingPanel: document.querySelector("#ringingPanel"),
  ringingText: document.querySelector("#ringingText"),
  logs: document.querySelector("#logs"),
  rtcPanel: document.querySelector("#rtcPanel"),
  localUid: document.querySelector("#localUid"),
  rtcStatus: document.querySelector("#rtcStatus"),
};

const log = createLogger(elements.logs);
const isDuplicateMessage = createMessageDeduper();

let config;
let client;
let activeSession = null;
let nextSeq = 1;

// Agora RTC 相关变量
let agoraClient = null;
let localTracks = null;

function setMqttState(state) {
  elements.mqttState.textContent = STATE_TEXT[state] || state;
}

function setCallState(state, summary) {
  elements.callState.textContent = STATE_TEXT[state] || state;
  elements.callSummary.textContent = summary;
}

function setRingingVisible(visible, text = "收到呼叫请求。") {
  elements.ringingPanel.hidden = !visible;
  elements.ringingText.textContent = text;
}

function syncButtons() {
  const connected = Boolean(client?.connected);
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  const hasSession = Boolean(activeSession);
  elements.answerButton.disabled =
    !connected || !hasSession || activeSession.state !== "RINGING";
  elements.rejectButton.disabled = !connected || !hasSession;
}

async function publishState(state, extras = {}) {
  if (!client?.connected || !activeSession) {
    return;
  }
  activeSession.state = state;
  const payload = buildCallStatePayload(activeSession, nextSeq++, state, extras);
  const topic = buildTopic(config.appId, activeSession.device_id, "evt/call");
  await publishMessage(client, topic, payload);
  setCallState(
    state,
    `${state}${payload.cause ? ` / ${payload.cause}` : ""}${payload.duration_sec ? ` / ${payload.duration_sec}s` : ""}`,
  );
  log(`已上报状态 ${state}`, payload);
}

async function publishDeviceEvent() {
  const deviceId = normalizeDeviceId(elements.deviceId.value);
  const topic = buildTopic(config.appId, deviceId, "evt/device");
  const payload = buildDeviceEventPayload("");
  await publishMessage(client, topic, payload);
  log("已上报设备事件", { topic, payload });
}

function resetSession(summary = "等待新的呼叫请求。") {
  activeSession = null;
  nextSeq = 1;
  setRingingVisible(false);
  setCallState("IDLE", summary);
  syncButtons();
}

async function onIncomingCall(payload) {
  if (isDuplicateMessage(payload)) {
    log("丢弃重复 CALL 消息", payload);
    return;
  }

  if (activeSession) {
    const busySession = {
      ...payload,
      state: "HANGUP",
      answeredAt: null,
      startAt: Date.now(),
    };
    const payloadToPublish = buildCallStatePayload(
      busySession,
      1,
      "HANGUP",
      {
        cause: "DEVICE_BUSY",
        duration_sec: 0,
        billsec: 0,
      },
    );
    const topic = buildTopic(config.appId, busySession.device_id, "evt/call");
    await publishMessage(client, topic, payloadToPublish);
    log("设备忙线，已拒绝新的呼叫", payloadToPublish);
    setCallState("HANGUP", "设备忙线，已拒绝新的呼叫。");
    return;
  }

  activeSession = {
    ...payload,
    state: "CALLING",
    answeredAt: null,
    startAt: Date.now(),
  };
  nextSeq = 1;
  log("收到 CALL 指令", payload);
  await publishState("CALLING");
  await publishState("RINGING");
  setRingingVisible(
    true,
    `来电号码：${payload.to}，通道：${payload.channel}，UID：${payload.uid}`,
  );
  syncButtons();
}

async function onIncomingHangup(payload) {
  if (!activeSession || payload.uuid !== activeSession.uuid) {
    return;
  }
  log("收到主叫挂断指令", payload);
  const durationSec = activeSession.answeredAt
    ? Math.max(0, Math.floor((Date.now() - activeSession.answeredAt) / 1000))
    : 0;
  await publishState("HANGUP", {
    cause: payload.cause || (activeSession.answeredAt ? "NORMAL_CLEARING" : "USER_BUSY"),
    duration_sec: durationSec,
    billsec: durationSec,
  });
  resetSession("主叫已挂断。");
}

async function connectMqtt() {
  const deviceId = elements.deviceId.value.trim();
  if (!deviceId) {
    throw new Error("Device ID 不能为空");
  }
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!config) {
    config = await loadConfig();
  }

  const tokenRequest = createCalleeTokenRequest(config.appId, deviceId);
  setMqttState("CONNECTING");
  setCallState("IDLE", "正在申请 JWT Token 并连接 MQTT...");
  log("申请 MQTT Token", tokenRequest);
  const token = await requestMqttToken(tokenRequest);
  const callTopic = buildTopic(config.appId, normalizedDeviceId, "call");
  const eventTopic = buildTopic(config.appId, normalizedDeviceId, "evt/call");
  const deviceTopic = buildTopic(config.appId, normalizedDeviceId, "evt/device");

  if (!hasAclPermission(token, "subscribe", callTopic)) {
    throw new Error(
      `当前 Device ID Token 无权订阅来电主题：${callTopic}。JWT 只允许订阅 ${eventTopic}，不能直接接收 CALL 指令。`,
    );
  }
  if (!hasAclPermission(token, "publish", deviceTopic)) {
    log(
      "提示",
      `当前 Token 未显式声明 ${deviceTopic} 的 publish 权限，后续设备事件上报可能失败。`,
    );
  }

  client = createMqttClient({
    mqttWsUrl: config.mqttWsUrl,
    clientId: tokenRequest.clientId,
    username: tokenRequest.username,
    token,
    log,
  });

  client.on("reconnect", () => {
    setMqttState("CONNECTING");
    log("MQTT 正在重连");
  });

  client.on("close", () => {
    setMqttState("IDLE");
    syncButtons();
    log("MQTT 连接已关闭");
  });

  client.on("error", (error) => {
    setMqttState("ERROR");
    log("MQTT 连接异常", error.message);
  });

  client.on("message", async (_topic, message) => {
    const payload = safeJsonParse(message);
    if (!payload) {
      return;
    }

    try {
      if (payload.event_type === "call") {
        await onIncomingCall(payload);
      } else if (payload.event_type === "hangup") {
        await onIncomingHangup(payload);
      }
    } catch (error) {
      const cause = "HFP_NOT_CONNECT";
      log("处理 CALL 消息失败", error instanceof Error ? error.message : String(error));
      if (activeSession) {
        await publishState("ERROR", { cause });
        resetSession("处理呼叫时发生异常。");
      }
    }
  });

  await waitForConnect(client);

  await subscribeTopic(client, callTopic);
  await publishDeviceEvent();
  setMqttState("CONNECTED");
  setCallState("IDLE", `已按小写设备标识连接，并订阅：${callTopic}`);
  syncButtons();
  log("MQTT 已连接并完成订阅", {
    originalDeviceId: deviceId,
    normalizedDeviceId,
    callTopic,
  });
}

function disconnectMqtt() {
  if (!client) {
    return;
  }
  client.end(true);
  client = null;
  resetSession("连接已断开。");
  leaveRtcChannel();
  setMqttState("IDLE");
  syncButtons();
}

async function answerCall() {
  if (!activeSession) {
    return;
  }
  activeSession.answeredAt = Date.now();
  setRingingVisible(true, "通话已接通，等待主叫挂断或被叫结束。");
  await publishState("ANSWERED", { answered_at: isoNow() });
  
  // 加入 RTC 频道
  await joinRtcChannel();
  
  syncButtons();
}

async function rejectOrHangup() {
  if (!activeSession) {
    return;
  }
  const answered = Boolean(activeSession.answeredAt);
  const durationSec = answered
    ? Math.max(0, Math.floor((Date.now() - activeSession.answeredAt) / 1000))
    : 0;
  await publishState("HANGUP", {
    cause: answered ? "NORMAL_CLEARING" : "USER_BUSY",
    duration_sec: durationSec,
    billsec: durationSec,
  });
  
  // 离开 RTC 频道
  await leaveRtcChannel();
  
  resetSession(answered ? "被叫已结束通话。" : "被叫已拒接来电。");
}

async function joinRtcChannel() {
  try {
    elements.rtcPanel.hidden = false;
    elements.rtcStatus.textContent = "正在加入语音频道...";
    
    // 使用呼叫指令中的参数加入 RTC 频道
    const appId = activeSession.appid || config.appId;
    const channel = activeSession.channel;
    const uid = Number(activeSession.uid); // 使用呼叫指令中的 uid
    const token = activeSession.token || ""; // 使用呼叫指令中的 token，默认为空
    
    log("被叫准备加入语音频道", { appId, channel, uid });
    
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
    
    log("被叫已成功加入语音频道", { uid: localTracks.uid });
  } catch (error) {
    elements.rtcStatus.textContent = "语音连接失败";
    log("被叫加入语音频道失败", error.message);
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
  
  log("被叫已离开语音频道");
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

elements.answerButton.addEventListener("click", async () => {
  try {
    await answerCall();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("接通失败", message);
  }
});

elements.rejectButton.addEventListener("click", async () => {
  try {
    await rejectOrHangup();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("挂断失败", message);
  }
});

syncButtons();
setMqttState("IDLE");
setCallState("IDLE", "等待连接并订阅 CALL 主题。");
setRingingVisible(false);
