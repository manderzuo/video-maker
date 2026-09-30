# 下一步与恢复点

本批已经实施至 T06 并停在检查点，未进入 T07。用户“允许实施，开始吧。”已授权 T03–T06 本地开发，独立审查保留到批次结束；无需重复询问该授权。

当前实施提交 ac3ed3c6c3ec1daf69862cc96ec5c800005cfe83，分支 feat/aiwork-studio，项目 E:\trae-studio\TRAEWORK\aiwork-studio。交付文档提交另计；恢复时先检查真实 Git 状态和最终 HEAD，保留现有更改。

1. 用户或用户指定审查者审查 T01–T06；重点核对固定来源/写入边界、原始许可、Schema 与输入边界、保存事务 complete、CAS、epoch、旧标签恢复、Run 单飞及未知提交不重发。实施者自检不是独立审查。
2. 对已提供的 T02 关键状态作出实际视觉结论，补真实 125%/150% 浏览器页面缩放证据。字号大小已认可，不重开总体设计，不推定其他视觉结论已通过。审查材料见 REVIEW_CHECKPOINT.md 和 visual-signoff.md。
3. 真实审查结论到达后据实更新对应记录及 visual-manifest.json，再运行 npm run verify。当前规划批准门槛应保持失败，不删测试、不屏蔽门槛、不假造 approved。
4. 下一批建议为原计划 T07–T10，依赖 T04 Schema 与 T05/T06 的事务、revision 和 lease 上下文，以及本批实际审查结论；由用户明确决定范围后才开始。先读对应 WP01 原逐任务计划，不凭本说明补造接口。
5. 后续模块写入须走事务仓储并校验项目 lease epoch 与 revision；Run 跟踪用独立 epoch/revision，接管不能重新 dispatch。PromptRun 写入等 T20 草稿 CAS，不能恢复无租约的临时入口。
6. 完整产品页面、产品弹窗及创作功能继续按原任务阶段实施；本批启动页和技术夹具不等于 T11 页面已经完成。提示词与 Agent 分支到其批准阶段才创建，不同时创建开发三个分支。

许可澄清、真实接口/业务联调、付费调用、生产迁移、远端推送和发布仍需原约定授权，不属于本次范围。

## 本机恢复命令

在真实项目根运行：

```powershell
. ./scripts/use-local-toolchain.ps1
npm ci
npm run verify
# verify 当前会在真实 T02-G02 审查门槛 exit1；build 需单独运行：
npm run build
# 真实接口未授权，以下测试为 0通过/0失败/1跳过：
npm run test:live
```

默认宿主 Node24 不是本计划工程基线，使用 E 盘辅助脚本切换当前进程 PATH；不修改系统或全局 Git 配置。依赖锁定后用 npm ci；已锁定 Node22.23.3/npm11.6.2，细节见 toolchain/LOCKED_TOOLCHAIN.md。

文档评审入口：

```powershell
node scripts/serve-review.mjs
# http://127.0.0.1:4178/docs/design/visual-review.html
```

技术存储夹具（本地开发服务器）：

```powershell
npm run dev -- --port 4181
# http://127.0.0.1:4181/tests/fixtures/storage.html
```

夹具只执行本地存储操作；完整浏览器测试自动启动独占 4179 服务，禁止复用已运行服务器，守卫只允许该测试本地 origin。不要把人工 4181 服务作为自动测试目标。

恢复时阅读 EXECUTION_PROGRESS.md、batch-status.json、evidence/T01.json–T06.json、对应源文件与日志。CI 尚未远端运行；源审计依赖本机真实快照，换宿主先重新核验，不伪造路径或来源。
