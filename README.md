# bdg_plugin_dglab_v3

DG-LAB 联动插件,用于 **Beat Data Generator** 踩点编辑器。

在播放曲子时,按节拍点上记录的位置、通道、强度与时长,通过 DG-LAB 4 WebSocket Relay 实时下发脉冲/强度到郊狼等设备——让踩点即刺激。

## 功能

- **配对面板**:连接 V4 Relay 后自动拿到 `targetId`,显示配对 ID 与二维码,DG-LAB 4 APP 扫码即接入。
- **类型化轨道「联动轨」**:侧栏 `＋` 创建,点属性含字段:
  | 字段 | 说明 |
  | --- | --- |
  | `通道` | `A` / `B` |
  | `强度` | 0–100 |
  | `时长(ms)` | 临时强度持续时间 |
  | `启用` | 开关,置否则该点不触发 |
- **播放联动**:监听 `playing` / `playhead` 事件,playhead 每次越过某个联动点的时间戳就向设备下发该点的强度(临时强度,到时自动回落 0)。
- **自动清理**:暂停 / 停止播放时向设备发送 `device.op.clear`,避免任务残留。

## 前置条件

- 宿主编辑器 **Beat Data Generator**。
- 本机(或局域网)运行 [dglab-websocket-server](https://github.com/dungeonlab-open/dglab-websocket-server) 的 V4 服务:

```bash
bun run v4   # 默认监听 ws://127.0.0.1:9998
```

零 npm 依赖:renderer 用浏览器原生 WebSocket 直连 Relay,并按 dglab-kit 的 V4 协议(`device.op` / `device.op.clear`)手写指令,因此**不需要**安装 `dglab-kit`。

## 安装

把本插件文件夹放入宿主的插件目录:

- 用户目录 `<userData>/plugins`
- 开发模式下也可放入工程根目录的 `plugins/`

重启编辑器后在设置/插件页看到 `dev.bdg.dglab-relay` 即加载成功。

## 使用

1. 插件菜单 →「切换 DG-LAB 面板」(或快捷键 `Alt+2`)打开浮动面板。
2. 在面板输入 Relay 地址(默认 `ws://127.0.0.1:9998`),点「连接」。
3. 等面板显示「等待 APP 扫码接入」,用 DG-LAB 4 APP 扫二维码(或手输配对 ID)。
4. APP 接入后显示设备名,即可开始:
   - 新建「联动轨」并放置联动点,填写通道 / 强度 / 时长;
   - 勾选「播放时联动」,点击播放。
5. 面板实时显示播放位置与联动状态,「测试脉冲」按钮可单独验证链路。

## 目录

```text
├── manifest.json       # 插件元信息 (id: dev.bdg.dglab-relay)
├── main.js             # 主进程入口(最小占位)
├── renderer.js         # 渲染侧:配对面板、联动轨、播放联动逻辑
├── plugin-api.d.ts     # 宿主插件 API 类型声明
└── README.md
```

## 说明

- V4 为推荐协议(控制方 1:N 被控方)。被控方用 `tid=<控制方clientId>` 接入,与 `renderer.js` 生成的配对 URL 一致。
- 联动默认取接入设备列表中的**第一个** slotId 下发;自定义通道(多设备、指定 slotId 选择)可在此基础上扩展。
- 强度随播放实时触发,若需更像“波形”的连续刺激,可扩展为 `AppendPulseData`(`device.op` `t:0`)下发 `dglab-kit` 内置波形帧。

## 许可

插件本身归作者所有;宿主 **Beat Data Generator** 以 GNU GPL v3 发布(作者 BUGJI)。分发请注明与宿主关联。
