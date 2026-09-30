# T01–T06 本地实施交付

实际项目：E:\trae-studio\TRAEWORK\aiwork-studio

分支：feat/aiwork-studio

文档基线：f811447b6867984b66e027de3b6326f479bb0f08

实施 HEAD：ac3ed3c6c3ec1daf69862cc96ec5c800005cfe83（T06）

本报告另作本地证据提交，最终仓库 HEAD 以 git rev-parse HEAD 为准。

模型记录：由用户在宿主选择，当前工具不可验证；用户指定 GPT6.1 sol / high。单执行者，没有启动子代理，没有独立审查通过声明。全部开发、源码快照、依赖、缓存、日志及截图位于 E 盘。

用户“允许实施，开始吧。”允许本批 T03–T06 本地基础开发，独立审查保留到本批检查点。字号已获认可；这不等于全部关键状态视觉认可。记录见 continuation-authorization.json。本批实施到 T06 停止，未进入 T07，未将全部 50 项任务标记完成。

|任务|实际状态|实施提交|
|---|---|---|
|T01|来源与目录冻结，自检通过，待审查|66ceb20400c2b9027383902392b7993d2d99a182（含前序来源与守卫提交）|
|T02|具体状态稿与字体修订已提供；字号获认可，完整视觉审阅及独立审查待进行，真实高缩放证据未补齐|31a6a6f62f8a316256844e877a9f6f6f83766af3；字号 162068ad9292f0865abf65d92531a7dbe97b7ec7|
|T03|实施完成，自检通过，待独立审查|0eee5909fb812b3662fce9390645cee87aca7c9f|
|T04|实施完成，自检通过，待独立审查|92a4248db3bcee4f956e077332b316d5c1aafd45|
|T05|实施完成，自检通过，待独立审查|f921d3e0c84a539ec4737e51d9b8f48a225af529|
|T06|实施完成，自检通过，待独立审查|ac3ed3c6c3ec1daf69862cc96ec5c800005cfe83|

## 修改与功能

- T01：核验五份计划固定提交的只读来源，保留版权与许可原文；来源清单、模块 hash、复用台账、目录层级及路径写入守卫已落盘。没有修改原业务工程。
- T02：23 页、30 类弹窗的文档状态稿；171 张真实浏览器渲染截图，关键状态覆盖深浅主题及 1440/1280/1024，720 只读样例。正文与表单 16px、说明 14px，用户认可当前大小。
- T03：React19/TypeScript5/Vite7 本地隔离工程，精确版本与 npm lock；类型、Lint、单测、浏览器、网络阻断及规划门槛串联。普通运行页仅为基础启动页，产品页面按后续任务实施。
- T04：src/domain/ 下 Project、Graph、Asset、Run、Prompt、Connection、Proposal 类型与严格 Schema；Unicode 字符、UTF-8 字节限制、UTC 毫秒、非秘密授权绑定、requestedSpec/executionSpec 以及四维执行/查询/交付/账务状态。秘密字段不进入持久快照；旧绑定别名仅显式导入迁移。
- T05：src/infrastructure/storage/ 原生 IndexedDB 结构与升级；项目/图/引用/运行记录的事务保存及 revision CAS，等待事务 complete 后才报告 saved；失败保留内存草稿并阻断提交，旧连接 blocked、新版本数据和提交未知记录有明确恢复行为。
- T06：项目 30 秒写者租约、前台 5 秒续租、epoch 接管与同事务 revision 校验；跨标签广播仅作通知，数据库决定写入权限。Run 单飞与独立跟踪租约保存网络前提交意图，接管不产生再次 dispatch 权限。
- tests/fixtures/storage.* 为实际可操作的技术验收页，接入真实浏览器 IndexedDB 与生产存储模块；完整产品页面和弹窗仍由后续 UI 任务实现。

逐文件清单见 changed-files.txt；每任务命令、红灯、绿灯、异常及限制见 evidence/T01.json 至 T06.json。历史失败日志保留，未删除测试或放宽审查断言。

## 实际验证

以下命令均在真实项目目录执行；先 . ./scripts/use-local-toolchain.ps1 使用 E 盘 Node22.23.3/npm11.6.2。数量是该次命令报告值，不将重复执行的用例累加。

|命令|退出码|通过 / 失败 / 跳过|日志|
|---|---|---|---|
|npm ci|0|安装成功，不按测试计数|logs/T03-ci-final.log|
|npm run typecheck|0|不适用|logs/T06-typecheck-final.log|
|npm run lint|0|不适用|logs/T06-lint-final.log|
|npm run test:unit|0|30 / 0 / 0|logs/T06-regression-final.log；logs/BATCH-verify.log|
|npm run test:e2e|0（verify 内对应阶段）|10 / 0 / 0|logs/BATCH-verify.log|
|npm run test:security|0（verify 内对应阶段）|2 / 0 / 0，另有阻断负例|logs/BATCH-verify.log|
|npm run test:trace|1（verify 内对应阶段）|14 / 1 / 0|logs/BATCH-verify.log|
|npm run verify|1|类型、Lint、单测、浏览器、网络阻断通过；规划门槛 1 失败|logs/BATCH-verify.log|
|npm run build（单独运行）|0|不适用|logs/BATCH-build.log|
|npm audit --json|0|0 个已知依赖漏洞；不等于全面安全审查|logs/BATCH-audit.json|
|npm run test:live|0|0 / 0 / 1；真实接口未验证|logs/T03-live-unverified.log|

verify 的唯一最终失败为 T02-G02：关键状态的真实用户视觉批准仍 pending。没有替用户写 approved；verify 在该失败后没有执行 build，所以 build 另外实际运行并记录成功。网络负例故意访问未获准域名，子进程在阻断检查处 exit1，外层确认确切失败原因后 exit0，不是业务网络可用性验证。

目标检查：T01 5 项；T03 工具链规划 5 项；T04 8 项；T05 9 项单位及 5 项浏览器；T06 11 项单位及 4 项浏览器。相关回归覆盖新增的租约上下文；首次完整浏览器回归有观察器误记 lease 事务的失败，修复观察器以实际 Project put 为依据，精确保存事件顺序断言保留，最终 10 项通过。

## 真实截图与日志

日志绝对目录：E:\trae-studio\TRAEWORK\aiwork-studio\docs\review\logs。

- T02 文档截图：E:\trae-studio\TRAEWORK\aiwork-studio\docs\design\captures（171 张；映射见 visual-manifest.json）。
- T03 启动页：E:\trae-studio\TRAEWORK\aiwork-studio\docs\review\screenshots\T03-bootstrap.png。
- T05 原生事务验收：E:\trae-studio\TRAEWORK\aiwork-studio\docs\review\screenshots\T05-native-storage.png。
- T06 多标签接管弹窗：E:\trae-studio\TRAEWORK\aiwork-studio\docs\review\screenshots\T06-takeover-dialog.png。

T05/T06 是实际运行技术夹具截图；点击、禁用、焦点、Esc、保存、刷新恢复与接管已在 Edge 隔离上下文执行。设计稿不作为产品交互通过证据。

## 尚未解决或未验证

- 独立审查未发生，本批所有任务保留待审查。T02 完整关键状态视觉认可及 125%/150% 真实浏览器页面缩放未验证，字号认可单独记录。
- 画布前端标识授权尚未澄清，仍为发布门槛。Core/助手/MCP 来源未找到明确 LICENSE/NOTICE，只参考契约；上游完整构建、bun 测试和全面安全扫描未执行。
- 真实 Core 部署契约、图片/音频/远端取消能力及真实业务调用未验证，live 测试明确跳过。无账号池、充值或新计费系统；无真实 Core/上游业务请求，无 Key/Cookie/JWT/生产数据库读取。
- 配额失败通过原生 put 故障注入；休眠通过推进浏览器时钟并停止续租模拟，不声称实际磁盘耗尽或设备休眠已实测。
- markRunDispatched 写入网络前持久提交意图，没有发送业务请求。独立 Run 跟踪接管不等于收费授权；PromptRun 写入接口待 T20 草稿 CAS，不留下无租约临时写入入口。
- 网络守卫覆盖测试 fetch、浏览器请求及 WebSocket 检查，不是操作系统网络沙箱。当前业务实现没有 Node 原生网络调用。
- CI 工作流已定义但没有远端运行。来源规划审计依赖真实 E 盘快照，迁出本机须重新核验路径与来源证据，不能复用本机结果宣称跨环境 CI 通过。
- 无远端地址、无推送、无合并、无部署、无生产迁移、无付费调用。当前仅 feat/aiwork-studio 本地历史，未创建另两个功能分支。

下一批建议和依赖见 NEXT_STEPS.md；先完成本批真实审查，由用户决定是否进入 T07–T10。
