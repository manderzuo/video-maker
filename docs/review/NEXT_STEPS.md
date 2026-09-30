# 下一步与恢复点

本轮授权仍为T01→T06，尚未走完本轮，不进入T07。当前停在真实评审门槛。

1. 审阅T01来源/路径守卫与证据，记录主审实际结论。`docs/agent/EXECUTION_HANDOFF.md`明确要求“主审检查后才进入依赖任务”；该门槛没有被用户本轮取消。
2. 审阅T02具体视觉材料，补125%/150%浏览器真实缩放证据，记录关键状态的实际视觉决定及独立审查。原件设计已批准，毋须重新选型。
3. 门槛满足后继续本轮T03：宿主当前Node24.13.0，不满足计划Node22.x，使用E盘本地、修补过的Node22版本；锁定React19/TS5/Vite7/Zustand5等兼容补丁与npm lock。已有工具审阅依赖Playwright1.58.2不等于T03产品工具链完成。
4. T04按共享契约冻结领域Schema，真实RED→GREEN覆盖UTF-8/字符数、未知版本、requested/executionSpec与非秘密authBinding。
5. T05原生IndexedDB事务complete/CAS/abort/QuotaExceeded/blocked，以真实浏览器和事务故障样本验收；保存失败保持草稿且阻止收费。
6. T06租约epoch + revision所有写入校验、30秒租约、5秒前台续租、run dispatch独立单飞；休眠旧标签和广播丢失必须被DB拦截。
7. 本批T01–T06全部完成/自检且需要的审查结论齐全后再交付该批检查点，由用户决定是否进入T07–T10；不要自动创建提示词或Agent分支。

来源许可、真实Core契约/业务联调、付费调用、生产迁移、远端推送及发布不在当前授权内。画布README前端标识要求未澄清；Core/助手/MCP未找到LICENSE/NOTICE，仍只参考协议。

## 可复现命令

在 `E:\trae-studio\TRAEWORK\aiwork-studio`：

```powershell
node --test tests/planning/source-policy.test.mjs
node scripts/serve-review.mjs
# 另一个项目终端运行，所有临时产物留E盘：
$env:TEMP='E:\trae-studio\tools\temp'
$env:TMP=$env:TEMP
node scripts/capture-visual-review.mjs
node --test tests/planning/visual-baseline.test.mjs
```

视觉基线批准用例当前应当失败，除非已有真实审阅记录并据此更新manifest；不要为了绿色删掉这个门槛。

恢复时先读 `docs/review/EXECUTION_PROGRESS.md`、`batch-status.json`与T01/T02证据，再看Git日志。原批准文件与导入校验和保持冻结。
