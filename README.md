# CS2 优化助手（v0.5）

面向 CS2 新玩家的 Windows 调优工具：**设备调整**（显卡驱动/电源/系统优化）+ **游戏设置调整**（准星/持枪视角/操控/启动项）+ **一键实施**。
Electron 33 实现；驱动写入通过 NVIDIA NVAPI DRS 接口（官方 nvapi 头 + ProfileInspector 设置库的真实 ID）。

## 页面结构（v0.2 重组）
- 🏠 **概览与一键实施**：环境总览 + 汇总各页草稿，一次性落地全部改动
- 🔧 **设备调整**
  - NVIDIA 驱动设置：8 项关键 3D 设置（电源管理/低延迟/垂直同步/三重缓冲/纹理过滤/线程优化/着色器缓存开关与大小）
    直接写入显卡配置，写入前自动备份原值，可一键恢复；优先写 CS2 专属配置档，被第三方优化软件锁定时自动回退到全局设置
  - 系统优化：CS2 指定高性能 GPU、关闭全屏优化(FSO)、关闭 Game DVR、开启游戏模式、高性能电源计划、PCIe 省电关闭、处理器提升模式、关闭鼠标加速
    每项带“已开启/未开启”实时状态 + “仅实施此项”
- 🎯 **游戏设置调整（v0.3 单页版）**
  - 不再分页：准星（实时预览）、持枪视角（实时预览+甩枪手感）、操控性能参数、开关集 在同一页面完成
  - ④ 输出区：自定义 cfg 文件名 → 一键写入 game\csgo\cfg\（标记块合并、自动备份）；启动项自动生成且**始终包含 +exec <你的文件名>**，复制粘贴到 Steam 即全部生效
  - 支持协议直达：steam:// 打开游戏列表（已修复白名单）
- ⚙️ 路径与关于

- ⭐ **职业哥预设**
  - 20 位顶尖选手（zywoo/m0NESY/donk/sh1ro/ropz/NiKo/device/b1t/w0nderful/magixx/stavn/apEX/huNter-/karrigan/TeSeS/jabbi/nertZ/flameZ/Jame/s1mple）
    的准星、灵敏度、eDPI、开镜系数、雷达与帧率参数，数据实时抓取自 prosettings.net（scripts/scrape-pros.ps1 可一键重抓更新）
  - 每张卡带准星实时迷你预览；“载入编辑”一键灌入下方调校器（同步进入 cfg 输出）
  - 注意：CS2 已移除 viewmodel 偏移命令，所有选手持枪模型位置一致，选手间真实差异体现在准星与分辨率/比例

- ⌨️ **按键绑定与便捷功能（v0.5 新增）**
  - 便捷功能一键包：**一键跳投**（alias 组合，键可自定义）、**滚轮跳**、**一键全装购买 / 甲+拆弹器 / 投掷物套装 / eco 局**（F1/F2/F6/F7，自动避开单机存档键冲突）、**网络状态图开关**（F8，toggle cq_netgraph）
  - 全动作改键表：默认键位**直接读取自当前版本游戏文件 user_keys_default.vcfg**（+sprint/player_ping/+radialradio/switchhands 等命令名 100% 与游戏一致），勾选动作 + 填新键即生成 bind；非法键名标红且不写入
  - 全部绑定并入 ⑤ 区 cfg 输出（“按键绑定与便捷功能”段），随一键实施落地

## 使用方式
双击项目根目录 **启动.bat**（本机器无全局 Node，脚本自动用 DSH 内置 Node）。
有 Node 环境时：pnpm install && pnpm start。

改完任何设置，回到“概览”点 🚀 开始一键实施 即可全部落地；
驱动与鼠标写入均有备份，支持一键恢复原值。

## 技术要点
- 驱动写入：PowerShell + Add-Type 内嵌 C# P/Invoke，nvapi_QueryInterface(序号) → NvAPI_Initialize(0x0150E828) → DRS CreateSession/LoadSettings/CreateProfile/CreateApplication/SetSetting/SaveSettings；
  结构体版本 MAKE_NVAPI_VERSION = size | (ver<<16)，NVDRS_SETTING 为 Pack=8 Unicode 布局
- 电源：powercfg /setacvalueindex + /attributes 解隐藏（boost），方案不支持时优雅跳过
- 系统项：全部走 HKCU（无需管理员），DirectX UserGpuPreferences / AppCompatFlags Layers / GameDVR / GameBar / Control Panel Mouse
- 游戏配置：autoexec.cfg 标记块（CS2-Optimizer:TAG BEGIN/END）替换写入 + 时间戳 .bak 备份
- 跨页草稿：localStorage（cs2opt-draft:*），首页统一执行

## 边界与说明
- AMD 驱动设置没有公开稳定的写入接口，为避免写坏配置提供“官方清单 + 直达面板”，未做自动写入
- 若安装 Atlas OS / GamePP 等深度优化工具，NVIDIA 配置档可能被锁，工具自动回退全局写入并提示
- 部分系统项（指针精确度）对已在运行的进程不生效，注销重新登录最彻底

## 路线图
1. 准星官方分享码解析（CS2-0... 格式）
2. 一键体检报告（刷新率 60Hz 未调满、双显卡未指定等输出诊断文本）
3. NSIS 打包安装包 + 应用图标
4. 配置档云同步 / 多 Steam 账户