# D22 直接下载规范迁移

用户消息 Sentinel_19ccbd9fdbc88191bf37f2400a60ba01：“导出是直接下载不需要二次确认”。来源监督线程 01a0f16b-a215-70a2-967f-f7319164802e。

保留现有应用行为，未修改 src 或检查器。D22 原确认弹窗按用户决定废弃，保留 canonical 身份、数量及空 sources/proofs；不将不存在的弹窗登记为通过。[迁移登记](trace-migrations-cloud.json) 关联实际 cloud:activity:export 两个入口、源文件哈希及真实浏览器证明。[历史快照](trace-migrations/D22-before-user-decision.json) 保留决定前 incomplete 结果。旧 H03 预览契约不因此宣称完成。

## 本轮实际验证

Microsoft Edge / msedge，本地云端 fixture 测试数据，原 4310 网络保护。

- node scripts/run-account-api-ui-tests.mjs tests/e2e/cloud-export-direct.spec.ts tests/e2e/cloud-activity-recovery.spec.ts：7/7 通过。
- 两个视图单次点击下载合法脱敏 JSON，无原生或 DOM 二次确认；读取 503 无下载、可重试；密钥及提示词正文不进入报告，原回执不变、付费 provider POST 零。保留原视频结果内容和错误断言。
- npm run typecheck、npm run lint：通过。
- npm run test:trace:cloud（引用此前实际 196 项报告）：12/12 通过；node scripts/check-ui-identities.mjs：通过。
- [原始 7 项实际报告](evidence/D22-direct-export-20261011.json)。首次 5/7 的失败记录本地另行保留，未改写通过。
- 本轮没有运行新增后的全量 198 项。此前 196/196 与本轮 7/7 是独立真实报告；两份报告所有当前源文件哈希再次核对一致。应用 src 树保持 140ca53af2ca3d355ca640839d4c768f81499f55。

## 严格门禁差异

实际命令：

    node scripts/check-traceability.mjs --cloud work/account-api-cloud/direct-export-20261011-prior-full-ui-evidence.json docs/review/evidence/D22-direct-export-20261011.json

退出 1，1497 → 1497，新增和消除均零。检查器不支持 canonical 弹窗退役：D22 的 source_binding_missing 和 facet_missing:normal 两项技术缺口保留，用户产品决策已解决。其他 1495 项声明缺口未扩展处理，整体严格门禁未通过。完整行 23（11 interactions + 1 page + 11 dialogs）、不完整行 296；canonical 数量 266/23/30 未变。未放宽检查器或虚构弹窗证明。

两张本轮真实原尺寸截图已检查，测试数据和下载反馈可见。真实浏览器 125% 缩放受支持控制能力限制仍未验收，系统原生 IME 未实测，textarea 内部实际 Rendered Fonts 未取得；事件组合输入及 CSS 字体验证不能替代这些验收。未推送、部署或修改生产数据。

## 测试声明登记修正

完整198项UI通过后的追踪策略发现循环标题无法被现有字面量声明登记器识别（test_not_declared）。仅将两个导出用例改为显式声明，保留所有业务断言，检查器未改动。最终声明版本定向2/2真实通过，替代入口证据与当前源文件哈希/实际断言验证通过，原始报告见 evidence/D22-direct-export-declarations-20261011.json。replacementHistory 保留此前7项运行及旧哈希，原始报告未改写。本轮最终完整运行和追踪结果保存到本地 continued-current-full-ui-evidence.json、continued-current-trace-policy.log；以实际结果为准，未运行完成前不宣称通过。
