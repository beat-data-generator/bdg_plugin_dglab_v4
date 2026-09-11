window.__bdgPluginRegister(function activate(api) {
  api.log("dglab renderer activated (id=" + api.id + ")");

  var CH_A = 0;
  var CH_B = 1;
  var TRACK_KEY = api.id + ":vibe";

  var state = {
    ws: null,
    controllerId: null,
    clientId: null,
    slotId: null,
    deviceName: null,
    reqSeq: 0,
    attached: false,
    lastPos: 0,
    active: false,
    enableLive: true,
  };

  var listeners = [];

  function subscribe(name, cb) {
    var off = api.events.on(name, cb);
    listeners.push(off);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function nextReqId() {
    state.reqSeq += 1;
    return "bdg-" + Date.now().toString(36) + "-" + state.reqSeq;
  }

  function requireDevice() {
    if (!state.attached) {
      api.log("dglab: no device attached, skipping");
      return false;
    }
    return true;
  }

  function sendWire(obj) {
    if (!state.ws || state.ws.readyState !== 1) return;
    state.ws.send(JSON.stringify(obj));
  }

  function sendDeviceOp(data) {
    sendWire({ t: "req", reqId: nextReqId(), m: "device.op", data: data });
  }

  function clearSlot() {
    if (!requireDevice()) return;
    sendWire({ t: "req", reqId: nextReqId(), m: "device.op.clear", data: { s: state.slotId } });
  }

  function hitMarker(channel, intensity, durationMs) {
    if (!requireDevice()) return;
    var c = channel === "B" ? CH_B : CH_A;
    var v = Math.max(0, Math.min(100, Number(intensity)));
    var d = Math.max(50, Math.round(Number(durationMs)));
    sendDeviceOp({ s: state.slotId, t: 4, c: c, p: 1, d: d, v: v });
  }

  function vibeMarkers() {
    var snap = api.project.snapshot();
    var trackIds = {};
    for (var i = 0; i < snap.tracks.length; i++) {
      if (snap.tracks[i].type === TRACK_KEY) trackIds[snap.tracks[i].id] = true;
    }
    var hits = [];
    for (var j = 0; j < snap.markers.length; j++) {
      var m = snap.markers[j];
      if (!trackIds[m.trackId]) continue;
      if (m.attrs && m.attrs.enabled === false) continue;
      hits.push(m);
    }
    hits.sort(function (a, b) { return a.timeMs - b.timeMs; });
    return hits;
  }

  function onPlayhead() {
    if (!state.enableLive) return;
    var now = api.player.positionMs();
    var prev = state.lastPos;
    var hits = vibeMarkers();
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].timeMs > prev && hits[i].timeMs <= now) {
        var attrs = hits[i].attrs || {};
        hitMarker(
          attrs.channel || "A",
          attrs.intensity !== undefined ? attrs.intensity : 20,
          attrs.duration !== undefined ? attrs.duration : 500,
        );
      }
    }
    state.lastPos = now;
  }

  function onPlaying(payload) {
    var playing = typeof payload === "boolean" ? payload : api.player.playing();
    if (playing) {
      state.lastPos = api.player.positionMs();
      state.active = true;
    } else {
      state.active = false;
      clearSlot();
    }
  }

  // ---- WebSocket (V4 relay) ----

  function isControlUrl(url) {
    try {
      return !new URL(url).searchParams.has("tid");
    } catch (e) {
      return true;
    }
  }

  function connectServer(url) {
    disconnectServer();
    api.log("dglab: connecting", url);
    state.ws = new WebSocket(url);
    state.ws.onopen = function (e) {
      api.log("dglab: ws open", e);
    };
    state.ws.onerror = function (e) {
      api.log("dglab: ws error", e);
    };
    state.ws.onclose = function (e) {
      api.log("dglab: ws closed code=" + e.code);
      state.attached = false;
      state.clientId = null;
      state.controllerId = null;
      state.slotId = null;
      state.deviceName = null;
    };
    state.ws.onmessage = function (e) {
      var raw = String(e.data);
      var frame;
      try {
        frame = JSON.parse(raw);
      } catch (err) {
        api.log("dglab: bad frame:", raw);
        return;
      }
      switch (frame.type) {
        case "hello":
          state.controllerId = frame.clientId;
          api.log("dglab: hello, controllerId=", state.controllerId);
          break;
        case "client_attached":
          state.clientId = frame.clientId;
          state.attached = true;
          requestDevices();
          break;
        case "client_disconnected":
          state.attached = false;
          state.clientId = null;
          state.slotId = null;
          state.deviceName = null;
          break;
        case "message":
          handleAppMessage(frame);
          break;
        default:
          break;
      }
    };
  }

  function disconnectServer() {
    if (state.ws) {
      try { state.ws.close(); } catch (e) { /* ignore */ }
      state.ws = null;
    }
    state.attached = false;
    state.clientId = null;
    state.controllerId = null;
    state.slotId = null;
    state.deviceName = null;
  }

  function requestDevices() {
    if (!state.clientId) return;
    sendWire({ t: "req", reqId: nextReqId(), m: "devices.get" });
  }

  function handleAppMessage(frame) {
    var data = frame.data;
    if (!data || data.t !== "resp") return;
    if (data.result && Array.isArray(data.result.devices)) {
      var devs = data.result.devices;
      state.slotId = devs.length ? devs[0].slotId : null;
      state.deviceName = devs.length ? devs[0].name || devs[0].slotId : null;
      api.log("dglab: devices =", devs);
    }
  }

  // ---- track type ----

  api.trackTypes.register({
    id: "vibe",
    trackName: { zh: "联动轨", en: "Sync track" },
    pointName: { zh: "联动点", en: "Sync point" },
    color: "#8b5cf6",
    fields: [
      {
        key: "channel",
        label: { zh: "通道", en: "Channel" },
        type: "enum",
        default: "A",
        options: [
          { value: "A", label: { zh: "A", en: "A" } },
          { value: "B", label: { zh: "B", en: "B" } },
        ],
      },
      {
        key: "intensity",
        label: { zh: "强度", en: "Intensity" },
        type: "number",
        default: 20,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: "duration",
        label: { zh: "时长(ms)", en: "Duration(ms)" },
        type: "number",
        default: 500,
        min: 50,
        max: 10000,
        step: 50,
      },
      {
        key: "enabled",
        label: { zh: "启用", en: "Enabled" },
        type: "bool",
        default: true,
      },
    ],
  });

  // ---- events ----

  subscribe("playing", onPlaying);
  subscribe("playhead", onPlayhead);

  // ---- panel ----

  var panel = api.ui.registerPanel({
    id: "dglab",
    title: { zh: "DG-LAB 联动", en: "DG-LAB Sync" },
    mount: function mount(host) {
      host.textContent = "";

      var wrap = el("div", "dg-wrap");
      host.appendChild(wrap);

      var urlInput = el("input", "dg-input");
      urlInput.value = "ws://127.0.0.1:9998";
      urlInput.placeholder = "ws://relay-host:9998";
      wrap.appendChild(urlInput);

      var connBtn = el("button", "dg-btn", "连接");
      wrap.appendChild(connBtn);

      var status = el("div", "dg-row");
      wrap.appendChild(status);

      var qrImg = document.createElement("img");
      qrImg.className = "dg-qr";
      qrImg.width = 160;
      qrImg.height = 160;
      wrap.appendChild(qrImg);

      var idLine = el("div", "dg-row");
      wrap.appendChild(idLine);

      var devLine = el("div", "dg-row");
      wrap.appendChild(devLine);

      var liveRow = el("div", "dg-row");
      wrap.appendChild(liveRow);

      var enableLive = el("input");
      enableLive.type = "checkbox";
      enableLive.checked = state.enableLive;
      var liveLabel = el("label", null, "播放时联动");
      liveLabel.prepend(enableLive);
      liveRow.appendChild(liveLabel);

      var testBtn = el("button", "dg-btn", "测试脉冲 (A/20/500)");
      wrap.appendChild(testBtn);

      var posLine = el("div", "dg-row");
      wrap.appendChild(posLine);

      function renderStatus() {
        var s = "";
        if (!state.ws) s = "未连接";
        else if (state.attached) s = "已配对 · " + (state.deviceName || state.clientId);
        else if (state.controllerId) s = "等待 APP 扫码接入";
        else s = "已连接 · 握手…";
        status.textContent = "状态: " + s;

        var pairUrl = buildPairUrl(urlInput.value, state.controllerId);
        if (pairUrl) {
          var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" +
            encodeURIComponent(pairUrl);
          qrImg.setAttribute("src", qrUrl);
          qrImg.style.display = "inline";
          idLine.textContent = "配对 ID: " + state.controllerId;
        } else {
          qrImg.style.display = "none";
          idLine.textContent = "配对 ID: -";
        }
        devLine.textContent = state.slotId
          ? "设备: " + (state.deviceName || state.slotId)
          : "设备: - (接入后自动取首个)";

        var pos = api.player.positionMs();
        posLine.textContent = "播放位置: " + pos.toFixed(0) + " ms · " +
          (state.active ? "联动中" : "停止/空闲");
      }

      function buildPairUrl(base, controllerId) {
        if (!base || !controllerId) return null;
        var normalized = base.indexOf("?") >= 0 ? base.split("?")[0] : base;
        var socketUrl = normalized + "?tid=" + controllerId;
        return "https://dungeon-lab.cn/s/?v=1&action=socket&url=" +
          encodeURIComponent(socketUrl);
      }

      function refresh() {
        renderStatus();
      }

      connBtn.addEventListener("click", function () {
        if (state.ws) {
          disconnectServer();
          connBtn.textContent = "连接";
        } else {
          var base = urlInput.value.trim();
          if (!base) { api.log("dglab: empty url"); return; }
          if (!/^ws(s)?:\/\//i.test(base)) base = "ws://" + base;
          connBtn.textContent = "断开";
          connectServer(base);
        }
        refresh();
      });

      enableLive.addEventListener("change", function () {
        state.enableLive = enableLive.checked;
      });

      testBtn.addEventListener("click", function () {
        if (state.ws) {
          if (!state.attached) { api.log("dglab: not paired"); return; }
          hitMarker("A", 20, 500);
        } else {
          connectServer(urlInput.value.trim() || "ws://127.0.0.1:9998");
        }
      });

      subscribe("playhead", refresh);
      subscribe("playing", refresh);
      subscribe("project", refresh);

      refresh();
      api.log("dglab: panel mounted");

      return function unmount() {
        disconnectServer();
        host.textContent = "";
      };
    },
  });

  api.ui.registerAction({
    label: { zh: "切换 DG-LAB 面板", en: "Toggle DG-LAB panel" },
    run: function () {
      panel.toggle();
    },
  });

  api.ui.registerShortcut({
    id: "toggle-dglab",
    label: { zh: "切换 DG-LAB 面板", en: "Toggle DG-LAB panel" },
    combo: "Alt+2",
    run: function () {
      panel.toggle();
    },
  });

  return function dispose() {
    for (var i = 0; i < listeners.length; i++) listeners[i]();
    listeners.length = 0;
    if (state.ws) {
      try { state.ws.close(); } catch (e) { /* ignore */ }
    }
    api.log("dglab renderer disposed");
  };
});
