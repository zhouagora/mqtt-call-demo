import {
  STATE_TEXT,
  buildCallPayload,
  buildStopCommandPayload,
  buildTopic,
  createCallerTokenRequest,
  createLogger,
  createMqttClient,
  hasAclPermission,
  loadConfig,
  publishMessage,
  requestMqttToken,
  requestRtcToken,
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
  recordDate: document.querySelector("#recordDate"),
  refreshRecords: document.querySelector("#refreshRecords"),
  recordsTable: document.querySelector("#recordsTable"),
  recordsBody: document.querySelector("#recordsBody"),
};

const log = createLogger(elements.logs);

let config;
let client;
let currentSession = null;
let lastRemoteState = "IDLE";
let callTimeoutTimer = null;  // 呼叫超时定时器
const CALL_TIMEOUT = 60000;  // 呼叫超时时间：60秒

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
  
  // 主叫端需要订阅的主题
  const callStateTopic = buildTopic(config.appId, rawDeviceId, "evt/call");  // 被叫状态上报
  const presenceTopic = buildTopic(config.appId, rawDeviceId, "evt/presence");  // 被叫设备在线状态
  const callTopic = buildTopic(config.appId, rawDeviceId, "call");  // 发布呼叫指令
  
  log("MQTT 主题配置", {
    subscribe: [callStateTopic, presenceTopic],
    publish: [callTopic],
  });

  if (!hasAclPermission(token, "subscribe", callStateTopic)) {
    throw new Error(
      `当前 Token 无权订阅被叫状态主题：${callStateTopic}。`,
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
    log("MQTT 连接已关闭（Token 可能已过期，请手动重连）");
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
    if (!payload) {
      return;
    }
    
    // 处理被叫状态上报
    if (payload.event_type === "call_state") {
      const summary = `${payload.state}${payload.cause ? ` / ${payload.cause}` : ""}`;
      setCallState(payload.state, `被叫最新状态：${summary}`);
      log("收到被叫状态上报", payload);

      // 当收到 ANSWERED 状态时，加入 RTC 频道
      if (payload.state === "ANSWERED" && !agoraClient) {
        // 清除超时定时器
        clearCallTimeout();
        await joinRtcChannel(payload);
        
        // 更新 CDR 记录
        if (currentSession) {
          await saveCdrRecord({
            action: 'update',
            call_uuid: currentSession.uuid,
            status: 'ANSWERED',
            answered_at: new Date().toISOString(),
            callee_uid: String(payload.uid)
          });
        }
      }

      if (payload.state === "HANGUP" || payload.state === "ERROR") {
        // 清除超时定时器
        clearCallTimeout();
        
        // 只有在会话还在时才清理（避免重复清理）
        if (currentSession) {
          // 计算通话时长
          const initiatedAt = currentSession.initiated_at || new Date().toISOString();
          const duration = calculateCallDuration(initiatedAt);
          
          // 更新 CDR 记录
          await saveCdrRecord({
            action: 'update',
            call_uuid: currentSession.uuid,
            status: payload.state,
            ended_at: new Date().toISOString(),
            duration_seconds: duration,
            hangup_cause: payload.cause || 'NORMAL_CLEARING'
          });
          
          // 离开 RTC 频道
          await leaveRtcChannel();
          currentSession = null;
          syncButtons();
          log("收到被叫挂断状态，已清理本地状态");
        } else {
          log("本地状态已清理，忽略被叫挂断状态");
        }
      }
      
      // 收到任何状态响应时，清除超时定时器
      if (payload.state === "CALLING" || payload.state === "RINGING") {
        clearCallTimeout();
      }
    }
    
    // 处理设备在线状态（由 MQTT Broker 自动发布）
    if (payload.event_type === "device_online") {
      log("✅ 收到被叫在线事件（MQTT Broker 自动发布）", {
        device_id: payload.device_id,
        connected_at: payload.connected_at,
      });
    }
    
    if (payload.event_type === "device_offline") {
      log("❌ 收到被叫离线事件（MQTT Broker 自动发布）", {
        device_id: payload.device_id,
        cause: payload.cause,
        disconnected_at: payload.disconnected_at,
      });
      
      if (currentSession) {
        log("⚠️ 被叫在通话/振铃过程中离线，执行兜底处理");
        
        // 清除超时定时器
        clearCallTimeout();
        
        // 离开 RTC 频道（如果已经加入）
        await leaveRtcChannel();
        
        // 发送 STOP 指令（尽力而为）
        try {
          const stopTopic = buildTopic(config.appId, currentSession.device_id, "stop");
          const stopPayload = buildStopCommandPayload(config.appId);
          await publishMessage(client, stopTopic, stopPayload);
          log("已发送被叫离线取消指令");
        } catch (error) {
          log("发送离线取消指令失败（不影响本地状态）", error.message);
        }
        
        // 清理会话状态
        currentSession = null;
        
        // 更新 UI
        setCallState("ERROR", "被叫设备已离线，通话已结束");
        syncButtons();
        
        log("✅ 被叫离线兜底处理完成");
      }
    }
  });

  await waitForConnect(client);

  // 订阅被叫状态上报主题
  await subscribeTopic(client, callStateTopic);
  log("已订阅被叫状态主题", { topic: callStateTopic });
  
  // 订阅设备在线状态主题
  await subscribeTopic(client, presenceTopic);
  log("已订阅设备在线状态主题", { topic: presenceTopic });
  
  setMqttState("CONNECTED");
  setCallState(lastRemoteState, `已连接，并订阅：${callStateTopic} 和 ${presenceTopic}`);
  log("MQTT 已连接并完成订阅", {
    clientId: tokenRequest.clientId,
    callStateTopic,
    presenceTopic,
  });
  syncButtons();
}

function disconnectMqtt() {
  if (!client) {
    return;
  }
  // 清除超时定时器
  clearCallTimeout();
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
    const uid = 1; // 主叫 UID 固定为 1
    
    // 请求主叫的 RTC Token
    log("正在请求主叫的 RTC Token", { channel, uid });
    const callerToken = await requestRtcToken(channel, uid);
    log("主叫 RTC Token 请求成功");
    
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
      onUserLeft: async (user, reason) => {
        log("远端用户离开 RTC 频道", { uid: user.uid, reason });
        
        // 对方离线，执行兜底处理
        await handleRemoteUserLeft("被叫已离开语音频道");
      },
    });
    
    // 加入频道并发布本地音频流（使用 Token）
    localTracks = await joinAgoraChannel(agoraClient, appId, channel, uid, callerToken, log);
    
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

  // 构建 RTC 频道名
  const channel = `${rawDeviceId}-${phoneNumber}`;
  
  // 请求被叫的 RTC Token（uid 为被叫的 uid）
  log("正在请求被叫的 RTC Token", { channel, uid });
  const calleeToken = await requestRtcToken(channel, uid);
  log("被叫 RTC Token 请求成功");

  const payload = buildCallPayload({
    appId: config.appId,
    deviceId: rawDeviceId,
    phoneNumber,
    uid,
    callUuid: randomId("CALL-"),
    peerUuid: randomId("PEER-"),
    rtcToken: calleeToken,  // 添加 RTC Token
  });

  currentSession = payload;
  currentSession.initiated_at = new Date().toISOString();  // 保存通话开始时间
  setCallState("CALLING", `已发起呼叫，等待被叫状态更新...`);
  syncButtons();

  // 创建 CDR 记录
  await saveCdrRecord({
    action: 'create',
    call_uuid: payload.uuid,
    caller_uid: String(elements.uid.value || config.uid || 'unknown'),
    callee_device_id: rawDeviceId,
    phone_number: phoneNumber,
    channel: channel,
    initiated_at: new Date().toISOString(),
    status: 'CALLING'
  });

  const callTopic = buildTopic(config.appId, rawDeviceId, "call");
  log("发布 CALL 指令", { topic: callTopic, payload });
  await publishMessage(client, callTopic, payload);
  
  // 注意：不在这里启动录音，等被叫接听后再启动
  
  // 启动呼叫超时定时器
  startCallTimeout();
}

async function hangupCall() {
  if (!client?.connected || !currentSession) {
    return;
  }
  
  // 清除超时定时器
  clearCallTimeout();
  
  // 保存会话信息用于发送 STOP 指令
  const session = currentSession;
  
  // 计算通话时长
  const initiatedAt = session.initiated_at || new Date().toISOString();
  const duration = calculateCallDuration(initiatedAt);
  
  // 更新 CDR 记录
  await saveCdrRecord({
    action: 'update',
    call_uuid: session.uuid,
    status: 'HANGUP',
    ended_at: new Date().toISOString(),
    duration_seconds: duration,
    hangup_cause: 'CALLER_HANGUP'
  });
  
  // 立即清理本地状态（不依赖被叫响应）
  currentSession = null;
  
  // 离开 RTC 频道
  await leaveRtcChannel();
  
  // 发送 STOP 挂断指令（无论被叫是否在线）
  try {
    const stopTopic = buildTopic(config.appId, session.device_id, "stop");
    const payload = buildStopCommandPayload(config.appId);
    log("发布 STOP 挂断指令", { topic: stopTopic, payload });
    await publishMessage(client, stopTopic, payload);
  } catch (error) {
    log("发送 STOP 指令失败（不影响本地挂断）", error.message);
  }
  
  // 立即更新 UI 状态
  setCallState("HANGUP", "通话已结束");
  syncButtons();
  
  log("主叫已挂断，本地状态已清理");
}

/**
 * 启动呼叫超时定时器
 * 如果被叫在指定时间内没有响应，自动取消呼叫
 */
function startCallTimeout() {
  // 清除已有的定时器
  clearCallTimeout();
  
  log(`启动呼叫超时定时器，${CALL_TIMEOUT / 1000}秒后自动取消`);
  
  callTimeoutTimer = setTimeout(async () => {
    if (!currentSession) {
      return;
    }
    
    log("呼叫超时，自动取消呼叫");
    setCallState("ERROR", "呼叫超时，被叫无响应");
    
    // 发送挂断指令
    try {
      const stopTopic = buildTopic(config.appId, currentSession.device_id, "stop");
      const payload = buildStopCommandPayload(config.appId);
      await publishMessage(client, stopTopic, payload);
      log("已发送超时取消指令");
    } catch (error) {
      log("发送超时取消指令失败", error.message);
    }
    
    // 清理会话状态
    currentSession = null;
    syncButtons();
  }, CALL_TIMEOUT);
}

/**
 * 清除呼叫超时定时器
 */
function clearCallTimeout() {
  if (callTimeoutTimer) {
    clearTimeout(callTimeoutTimer);
    callTimeoutTimer = null;
    log("已清除呼叫超时定时器");
  }
}

/**
 * 处理远端用户离开 RTC 频道的兜底逻辑
 * @param {string} reasonText - 离开原因的描述文本
 */
async function handleRemoteUserLeft(reasonText) {
  if (!currentSession) {
    log("会话已清理，忽略远端用户离开事件");
    return;
  }
  
  log("执行远端用户离开兜底处理", { reason: reasonText });
  
  // 清除超时定时器
  clearCallTimeout();
  
  // 离开 RTC 频道
  await leaveRtcChannel();
  
  // 清理会话状态
  currentSession = null;
  
  // 更新 UI
  setCallState("ERROR", `${reasonText}，通话已结束`);
  syncButtons();
  
  log("远端用户离开兜底处理完成");
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

// ==================== 通话记录功能 ====================

// 保存 CDR 记录
async function saveCdrRecord(data) {
  try {
    const response = await fetch('/api/call-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    if (result.code !== 0) {
      console.error('[CDR] 保存记录失败:', result.message);
    } else {
      console.log('[CDR] 记录已保存:', data.call_uuid, data.action);
      // 刷新通话记录列表
      loadCallRecords();
    }
  } catch (error) {
    console.error('[CDR] 保存记录失败:', error);
  }
}

// 计算通话时长（秒）
function calculateCallDuration(initiatedAt) {
  if (!initiatedAt) return 0;
  const start = new Date(initiatedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 1000));
}

// 初始化日期选择器为今天
const today = new Date().toISOString().split('T')[0];
elements.recordDate.value = today;

// 加载通话记录
async function loadCallRecords() {
  const date = elements.recordDate.value;
  
  console.log('[CDR] 正在加载通话记录，日期:', date);
  
  try {
    const response = await fetch(`/api/call-records?date=${date}`);
    const { code, data, total } = await response.json();
    
    console.log('[CDR] API 返回:', { code, total, dataLength: data?.length });
    
    if (code !== 0) {
      throw new Error('Failed to load call records');
    }
    
    renderCallRecords(data);
  } catch (error) {
    console.error('[CDR] 加载通话记录失败:', error);
    elements.recordsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">加载失败: ${error.message}</td>
      </tr>
    `;
  }
}

// 渲染通话记录表格
function renderCallRecords(records) {
  const tbody = elements.recordsBody;
  
  console.log('[CDR] 渲染通话记录，数量:', records?.length);
  
  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">暂无通话记录</td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = records.map(record => {
    const time = new Date(record.initiated_at).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const duration = record.duration_seconds 
      ? formatDuration(record.duration_seconds)
      : '-';
    
    const statusClass = getStatusClass(record.status);
    const statusText = getStatusText(record.status);
    
    return `
      <tr>
        <td>${time}</td>
        <td>${record.phone_number || '-'}</td>
        <td class="duration">${duration}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

// 格式化时长
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m${s}s`;
}

// 获取状态样式类
function getStatusClass(status) {
  const statusMap = {
    'ANSWERED': 'status-answered',
    'HANGUP': 'status-hangup',
    'ERROR': 'status-error',
    'CALLING': 'status-calling',
    'RINGING': 'status-ringing'
  };
  return statusMap[status] || 'status-calling';
}

// 获取状态文本
function getStatusText(status) {
  const statusMap = {
    'ANSWERED': '已接通',
    'HANGUP': '已挂断',
    'ERROR': '错误',
    'CALLING': '呼叫中',
    'RINGING': '振铃中'
  };
  return statusMap[status] || status;
}

// 绑定事件
elements.refreshRecords.addEventListener('click', loadCallRecords);
elements.recordDate.addEventListener('change', loadCallRecords);

// 初始加载
loadCallRecords();
