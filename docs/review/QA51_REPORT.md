# QA51 画布直接播放视频 — 2026-10-05

视频素材节点与固定结果节点新增醒目的“▶ 播放视频”。点击后在画布内打开播放器，播放本地缓存；播放器复用现有媒体协调器、音量、进度和卸载清理。暂停和进度定位可用，关闭停止播放并返回原按钮。视频播放器使用完整宽度及简短标签，图片保留素材预览。

项目 E:\trae-studio\TRAEWORK\aiwork-studio；分支 feat/aiwork-studio；base eb5891d8fd80f82d0c5918e7c42849d08282e494；实现 ef81a79ad60fb57f115565b74fc90b1ac9fb9ef6。单执行者，待用户／独立审查；模型由用户在宿主选择，当前工具不可验证。没有推送或发布。

先运行行为红灯：真实渲染的结果节点缺少“播放视频”，1 例失败、exit 1，日志 red.log。实现后新增 5 例通过，覆盖结果播放、暂停、进度、关闭与重新打开、锁定素材、缓存缺失／损坏及浏览器播放策略拒绝。正常用例使用原生 MediaRecorder 生成并实际解码 WebM，不伪造播放状态。策略拒绝用例只注入一次 NotAllowedError，其后仍执行原生 play。

相关素材库、双版本审片、修改／续写与来源线共 35 例通过；492 单元通过。最终类型检查、Lint、UI 标识检查和构建 exit 0。最终播放器展示调整后重新执行新增 5 例通过；去重浏览器用例总计 40，0 失败、0 跳过。本次没有重跑完整 verify，保留 QA50 的全套记录与人工视觉门槛。

4188 最终构建 index-Dlrr4Va5.js。Chrome 新标签使用原“按钮综合测试”项目，点击任务 7f20363f-dedd-4ae0-9e60-ae0704171562 的视频按钮；原生 MP4 为 5.088 秒、864×496，播放器宽 590px，readyState 4，paused false，时间已前进。随后实际暂停、键盘定位、关闭；没有在后台继续播放，焦点回到按钮。前后核对节点、连线、素材和 Run 均未变化。网络观察中远端 HTTP 请求 0，新生成和消耗积分 0。没有刷新原用户授权标签。

命令、退出码、文件和限制见 [evidence/QA51.json](evidence/QA51.json)。浏览器执行证据见 logs/QA51-browser-executed.json、logs/QA51-regression-executed.json、logs/QA51-actual-proof.json；原始日志及截图在 work/qa-20261005/canvas-video-play/。截图 actual-video-player.png 为真实项目视频；isolated-player.png 是隔离用例，不能混作真实生成证据。

浏览器策略拒绝时可手动播放；本地文件缺失时显示恢复入口，不自动联网下载。人工视觉、独立审查及此前尚未完成的服务／许可／下载验收继续待审查。后续见 [QA51_NEXT_STEPS.md](QA51_NEXT_STEPS.md)。
