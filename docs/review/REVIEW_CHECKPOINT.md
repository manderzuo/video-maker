# T01–T06 审查检查点

项目 E:\trae-studio\TRAEWORK\aiwork-studio，分支 feat/aiwork-studio。审查范围：文档基线 f811447b6867984b66e027de3b6326f479bb0f08 至实施 HEAD ac3ed3c6c3ec1daf69862cc96ec5c800005cfe83；证据交接另有本地提交。

用户“这个大小可以了。接着继续吧”认可字号；随后“允许实施，开始吧。”允许 T03–T06 本地实施、独立审查留在批次检查点。授权记录 continuation-authorization.json。没有独立审查通过记录，没有替用户认可全部关键状态。

|范围|审查入口与重点|实际自检证据|
|---|---|---|
|T01|source-policy/freeze-sources、source-manifest、reuse-ledger、third-party；固定来源、CLI 写入边界、版权及许可处理|5/0/0，logs/T01-resume-check.log|
|T02|visual-review.*、visual-manifest.json、captures；关键状态、深浅主题、宽度、字号|171 实际文档截图；6 导航断言、172 字号视图；材料 4/0/0，批准门槛 0/1/0|
|T03|package/lock、配置、tests/helpers/network-*、live-approval、verify 工作流|工具链规划 5/0/0；类型/Lint/build 0；阻断负例真实失败；CI 未远端运行|
|T04|src/domain/*、domain-schema.test.ts；非秘密绑定、严格输入、四维状态、UTF-8/字符限制|目标 8/0/0，evidence/T04.json|
|T05|database/migrations/project-repository/run-repository、project-store.test.ts、storage.spec.ts；事务 complete、CAS、失败草稿及恢复|目标单位 9/0/0；真实浏览器 5/0/0|
|T06|project-lease/run-lease/tab-channel、project-lease.test.ts、lease.spec.ts；epoch/TTL/revision、失去广播、旧标签、独立 Run 跟踪、不可再次 dispatch|目标单位 11/0/0；真实浏览器 4/0/0|

整批最新单位 30/0/0，浏览器 10/0/0，安全 2/0/0；规划 14/1/0，因此 verify exit1。失败是 T02-G02 人的视觉认可待定，未放宽断言；build 另外 exit0。日志 logs/BATCH-verify.log、BATCH-build.log、BATCH-audit.json。逐任务红灯、改动和限制见 evidence/T01.json–T06.json。

必须由实际审阅者核对的情形：

- 旧标签失去写者权限、广播丢失及恢复后，不得覆盖新 revision；模拟休眠不冒充真实设备休眠证据。
- Run 已持久提交意图或提交未知时，身份、最终 body、幂等键不能更换重发。当前函数仅保存意图，未发送网络；真实执行门槛留到后续阶段。
- 中文人物、品牌、对白、时长、比例等冲突在设计稿中明确保留；本批领域字段不静默改 requestedSpec。完整提示词生成行为未实施。
- execution/query/delivery/billing 独立持久字段，停止查询不冒充取消或退款；真实收费及交付未验证。
- Proposal 版本及冲突 Schema/静态状态已提供；Agent 接受修改、冲突处理运行逻辑留到原计划阶段，不能从本批推定通过。

T05/T06 实际运行截图位于 docs/review/screenshots/，为技术验收夹具。完整产品 UI、125%/150% 真实页面缩放、前端标识授权、真实 Core 能力、独立审查均未获通过结论。

先记录本批实际审查与 T02 具体视觉结论，再由用户决定下一批。不进入 T07，不推送或发布，不创建提示词/Agent 分支。
