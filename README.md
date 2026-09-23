# bdg_plugin_dglab_v4

**DG-LAB 4 联动插件** —— 用于 **Beat Data Generator** 踩点编辑器。

在播放曲子时，按节拍点上记录的位置、通道、强度与时长，通过 **DG-LAB 4 WebSocket Relay** 实时下发脉冲/强度到郊狼等设备 —— 让踩点即刺激。

> ⚠️ **只支持 DG-LAB V4 协议**（WebSocket Relay，默认端口 `9998`）。
> **不兼容 V3**（V3 是 `9999` + 另一套报文格式），本插件里没有任何 V3 兼容分支。
> 仓库名里的 `_v4` 指的就是所适配的**协议版本**。

---

## 功能

- **配对面板**：连接 V4 Relay 后自动拿到 `controllerId`（控制方 ID），显示配对 ID 与二维码，DG-LAB 4 APP 扫码即接入。
- **类型化轨道「联动轨」**：侧栏 `＋` 创建，每个联动点带通道 / 强度 / 时长 / 启用四个字段。
- **播放联动**：监听 `playing` / `playhead` 事件，播放头每次越过一个联动点的时间戳，就向设备下发该点的临时强度（到时自动回落 0）。
- **自动清理**：暂停 / 停止播放时向设备发送 `device.op.clear`，避免任务残留。
- **零 npm 依赖**：renderer 用浏览器原生 `WebSocket` 直连 Relay，按 V4 协议手写指令，**不需要安装 `dglab-kit`**。

---

## 协议版本与兼容性

| | 本插件 (V4) | V3（不支持） |
| --- | --- | --- |
| Relay 默认端口 | `9998`（`bun run v4`） | `9999` |
| 配对方式 | 被控方用 `?tid=<控制方 clientId>` 接入，控制方 1:N | 单向/单一连接 |
| 指令报文 | `{t:"req", m:"device.op", data:{...}}`、`device.op.clear` | 旧版 `strength-*` / `msg` 系列 |
| 强度回落 | `device.op` 自带时长 `d`，到时自动回落 | 需手动下发 0 |

**为什么叫 v4**：本插件从第一版起就走 V4 Relay（`ws://…:9998` + `device.op`），但仓库旧名是 `bdg_plugin_dglab_v3`，容易被误认为是协议 V3 或需要 V3 服务端。故更名，与协议对齐。

> 如果你在跑的是 V3 服务（`bun run v3`，9999），请改跑 V4 —— 本插件不会连接它。

---

## 前置条件

- 宿主编辑器 **Beat Data Generator**（插件 API 需支持 `trackTypes` / `ui.registerPanel` / `player` / `events`）。
- 本机（或局域网内某台机器）运行 [dglab-websocket-server](https://github.com/dungeonlab-open/dglab-websocket-server) 的 **V4** 服务：

  ```bash
  bun run v4      # 默认监听 ws://127.0.0.1:9998
  ```

- 手机装 **DG-LAB 4** APP，与 Relay 所在机器网络互通（同一 WiFi 即可）。

---

## 安装

把本插件文件夹放进宿主的插件目录：

- 用户目录：`/plugins`
- 开发模式下也可放进工程根目录的 `plugins/`

重启编辑器，在 **设置 → 插件** 里看到 `dev.bdg.dglab-relay` 即加载成功。

> 插件 id 固定为 `dev.bdg.dglab-relay`，**文件夹名随便起**，不影响加载。

---

## 使用

1. 插件菜单 →「切换 DG-LAB 面板」（或快捷键 <kbd>Alt</kbd>+<kbd>2</kbd>）打开浮动面板。
2. 在面板输入 Relay 地址（默认 `ws://127.0.0.1:9998`），点「连接」。
3. 等面板显示「等待 APP 扫码接入」，用 **DG-LAB 4 APP** 扫二维码（或手输上方显示的配对 ID）。
4. APP 接入后面板显示设备名，即可开始：
   - 新建「联动轨」，在节拍点上放置「联动点」，填写通道 / 强度 / 时长；
   - 勾选「播放时联动」，点击播放。
5. 面板实时显示播放位置与联动状态；「测试脉冲」按钮可单独验证链路（固定 `A / 20 / 500ms`）。

### 联动点字段

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `通道` | `A` / `B` | `A` | 对应设备两个通道 |
| `强度` | 0–100 | `20` | 下发值，超出会被夹到区间内 |
| `时长(ms)` | 50–10000 | `500` | 临时强度持续时间，到时自动回落 0 |
| `启用` | 开关 | 开 | 关掉则该点不触发 |

---

## 工作原理

```
播放头推进 ──playhead──▶ 遍历联动点 ──t 落在 (上次位置, 当前位置]──▶ device.op
                                                                  {s:slotId, t:4, c:通道, p:1, d:时长, v:强度}
暂停 / 停止 ──playing=false──▶ device.op.clear {s:slotId}
```

- 联动点跨播放头判定用**区间**（`prev < t <= now`），快进/跳转不会漏点也不会重复触发。
- 设备列表在 APP 接入后通过 `devices.get` 拉取，默认取**第一个** `slotId` 下发。
- 面板关闭（unmount）或插件卸载时会断开 WebSocket。

---

## 目录

```text
├── manifest.json     # 插件元信息（id: dev.bdg.dglab-relay, version 0.1.0）
├── main.js           # 主进程入口（最小占位，仅 ping/pong）
├── renderer.js       # 渲染侧：配对面板、联动轨类型、播放联动逻辑
├── plugin-api.d.ts   # 宿主插件 API 类型声明
└── README.md
```

---

## 常见问题

**连不上 Relay？**
Relay 必须起 **V4** 服务（`bun run v4`，9998）。起的是 v3（9999）会连不上或没有响应。跨机连接时把地址写成 `ws://<relay 所在 IP>:9998`。

**面板一直停在「等待 APP 扫码接入」？**
扫码用的是 `https://dungeon-lab.cn/s/...` 短链，APP 侧需要能打开它；也可直接在 APP 里手输面板显示的配对 ID。

**二维码不显示？**
二维码图由外部服务 `api.qrserver.com` 生成，编辑器所在机器需能访问外网；否则用配对 ID 手输。

**点了「测试脉冲」没反应？**
先确认状态是「已配对 · 设备名」；未配对时面板只会尝试重连。

**多个设备接入时怎么选？**
当前版本固定取第一个 `slotId`。要支持多设备/指定 slotId，可在 `renderer.js` 的 `handleAppMessage()` 基础上扩展（面板加设备下拉）。

**强度是跳变的，不像波形？**
现在是「临时强度」模式（`t:4`）。想要连续波形，可扩展为 `AppendPulseData`（`device.op` 带 `t:0`）下发 `dglab-kit` 内置波形帧。

---

## 许可

插件本身归作者所有；宿主 **Beat Data Generator** 以 GNU GPL v3 发布（作者 BUGJI）。分发请注明与宿主关联。
