const mqtt = window.mqtt;
const AgoraRTC = window.AgoraRTC;

export const STATE_TEXT = {
  IDLE: "空闲",
  CONNECTING: "连接中",
  CONNECTED: "已连接",
  CALLING: "拨号中",
  RINGING: "振铃中",
  ANSWERED: "已接通",
  HANGUP: "已挂断",
  ERROR: "异常",
};

export async function loadConfig() {
  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error("加载配置失败");
  }
  return response.json();
}

export async function requestMqttToken({ username, clientId, deviceId }) {
  const response = await fetch("/api/mqtt/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, clientId, deviceId }),
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.data?.token) {
    throw new Error(data.message || "获取 MQTT Token 失败");
  }
  return data.data.token;
}

export function decodeJwtPayload(token) {
  const [, payload = ""] = String(token).split(".");
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch (_error) {
    return null;
  }
}

export function hasAclPermission(token, action, topic) {
  const payload = decodeJwtPayload(token);
  const acl = Array.isArray(payload?.acl) ? payload.acl : [];
  return acl.some(
    (rule) =>
      rule?.permission === "allow" &&
      rule?.action === action &&
      rule?.topic === topic,
  );
}

export function createLogger(target) {
  return (title, payload) => {
    const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const suffix =
      payload === undefined
        ? ""
        : `\n${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}`;
    target.textContent = `[${now}] ${title}${suffix}\n\n${target.textContent}`;
  };
}

export function buildTopic(appId, deviceId, suffix) {
  return `d/${appId}/${deviceId}/${suffix}`;
}

export function randomId(prefix = "") {
  const buffer = new Uint32Array(4);
  crypto.getRandomValues(buffer);
  const value = Array.from(buffer, (item) => item.toString(16).padStart(8, "0")).join("");
  return `${prefix}${value}`.toUpperCase();
}

export function isoNow() {
  return new Date().toISOString();
}

export function unixNow() {
  return Math.floor(Date.now() / 1000);
}

export function normalizeDeviceId(deviceId) {
  return String(deviceId).trim().toLowerCase();
}

export function createCallerTokenRequest(appId, uid, deviceId) {
  const rawDeviceId = String(deviceId).trim();
  const uidStr = String(uid).trim();
  return {
    username: uidStr,
    clientId: `${appId}-caller-${uidStr}`,
    deviceId: rawDeviceId,
  };
}

export function createCalleeTokenRequest(appId, deviceId) {
  // Device ID 直接透传，不做大小写转换
  const rawDeviceId = String(deviceId).trim();
  return {
    username: rawDeviceId,
    clientId: `${appId}-${rawDeviceId}`,
    deviceId: rawDeviceId,
  };
}

export function createMqttClient({ mqttWsUrl, clientId, username, token, log }) {
  return mqtt.connect(mqttWsUrl, {
    clientId,
    username,
    password: token,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
    protocolVersion: 5,
  });
}

export function subscribeTopic(client, topic) {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, { qos: 1 }, (error, granted) => {
      if (error) {
        reject(
          new Error(
            `订阅主题失败：${topic}，${error.message || "未知错误"}`,
          ),
        );
        return;
      }
      resolve(granted);
    });
  });
}

export function publishMessage(client, topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) {
        reject(
          new Error(
            `发布主题失败：${topic}，${error.message || "未知错误"}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

export function waitForConnect(client) {
  return new Promise((resolve, reject) => {
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      client.off("connect", onConnect);
      client.off("error", onError);
    };
    client.on("connect", onConnect);
    client.on("error", onError);
  });
}

export function buildCallPayload({
  appId,
  deviceId,
  phoneNumber,
  uid,
  callUuid,
  peerUuid,
}) {
  return {
    agent_id: randomId("A"),
    appid: appId,
    channel: `${deviceId}-${phoneNumber}`,
    device_id: deviceId,
    event_type: "call",
    from: deviceId,
    labels: {
      _direction: "outbound",
      _from_number: deviceId,
      _pipeline_id: `web_demo_${uid}`,
      _source: "web-caller",
      _to_number: phoneNumber,
    },
    peer_uuid: peerUuid,
    service: "",
    timestamp: unixNow(),
    to: phoneNumber,
    token: "",
    uid: String(uid),
    uuid: callUuid,
    vid: "130451",
  };
}

export function buildHangupCommandPayload(session, origin) {
  return {
    event_type: "hangup",
    appid: session.appid,
    device_id: session.device_id,
    uuid: session.uuid,
    peer_uuid: session.peer_uuid,
    channel: session.channel,
    timestamp: unixNow(),
    from: origin,
    to: session.to,
    cause: session.state === "ANSWERED" ? "NORMAL_CLEARING" : "USER_BUSY",
  };
}

export function buildCallStatePayload(session, seq, state, extras = {}) {
  const base = {
    event_type: "call_state",
    timestamp: isoNow(),
    appid: session.appid,
    vid: Number(session.vid || 130451),
    labels: session.labels || {},
    channel: session.channel,
    call_id: "",
    state,
    seq,
    uuid: session.uuid,
    peer_uuid: session.peer_uuid,
    agent_id: session.agent_id,
    device_id: session.device_id,
    service: session.service || "",
    direction: "outbound",
    from: session.from,
    to: session.to,
  };

  return { ...base, ...extras };
}

export function buildDeviceEventPayload(phoneNumber = "") {
  return {
    phone_num: phoneNumber,
    app_version: "web-demo-1.0.0",
  };
}

export function createMessageDeduper() {
  let lastSignature = "";
  return (payload) => {
    const signature = [
      payload?.agent_id ?? "",
      payload?.timestamp ?? "",
      payload?.to ?? "",
    ].join("|");
    if (signature === lastSignature) {
      return true;
    }
    lastSignature = signature;
    return false;
  };
}

export function safeJsonParse(message) {
  try {
    return JSON.parse(message.toString());
  } catch (_error) {
    return null;
  }
}

// Agora RTC 辅助函数
export function createAgoraClient() {
  if (!AgoraRTC) {
    throw new Error("AgoraRTC SDK 未加载");
  }
  // 使用 G722 音频编码，纯语音通话
  return AgoraRTC.createClient({ mode: "rtc", codec: "h264", audioCodec: "g722" });
}

export async function joinAgoraChannel(client, appId, channel, uid, token, log) {
  try {
    log("正在加入 Agora RTC 频道", { appId, channel, uid, token: token ? "***" : "(空)" });
    
    // 加入频道
    const joinedUid = await client.join(appId, channel, token || null);
    log("成功加入 Agora RTC 频道", { uid: joinedUid });
    
    // 只创建音频轨道（纯语音通话）
    const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    
    await client.publish([audioTrack]);
    log("已发布本地音频轨道");
    
    return { audioTrack, uid: joinedUid };
  } catch (error) {
    log("加入 Agora RTC 频道失败", error.message);
    throw error;
  }
}

export async function leaveAgoraChannel(client, tracks, log) {
  try {
    // 停止并关闭轨道
    if (tracks) {
      if (tracks.audioTrack) {
        tracks.audioTrack.stop();
        tracks.audioTrack.close();
      }
    }
    
    // 离开频道
    if (client) {
      await client.leave();
    }
    
    log("已离开 Agora RTC 频道");
  } catch (error) {
    log("离开 Agora RTC 频道时出错", error.message);
  }
}

export function setupAgoraEventListeners(client, options) {
  const { onUserPublished, onUserUnpublished, onLocalPlayerReady } = options;
  
  // 当远端用户发布流时
  client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    
    // 只处理音频
    if (mediaType === "audio" && user.audioTrack) {
      user.audioTrack.play();
    }
    
    if (onUserPublished) {
      onUserPublished(user, mediaType);
    }
  });
  
  // 当远端用户取消发布流时
  client.on("user-unpublished", (user, mediaType) => {
    if (onUserUnpublished) {
      onUserUnpublished(user, mediaType);
    }
  });
  
  // 本地用户加入后
  client.on("user-joined", (user) => {
    if (onLocalPlayerReady) {
      onLocalPlayerReady(user);
    }
  });
}
