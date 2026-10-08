# QA58：视频预算恢复与任务结束后的账务核对

2026-10-08。实施者自检通过；独立审查待进行。已修复过期策略造成的生成阻塞和Studio终态账务跟踪，不能宣布全部历史持有已释放，也不能宣布篮球视频生成验收通过。

## 实际环境和改动

项目E:\trae-studio\TRAEWORK\aiwork-studio，分支feat/aiwork-studio。最初基准4231f4edc7bca9c53c948283c1060b07a9700954；补丁父提交2e61b9fd8401c707a00b2607781dd37b65cb308d。另一个部署提交在执行期间加入，保留其7项部署文件，不将其计入本轮成果。模型由用户在宿主选择，当前工具不可验证。未启动子代理。

- Core适配器保留可信回执里的settled/released；budget_policy_expired显示具体预算原因，忽略任意原始错误文本。
- 画布、任务中心和轮询器在执行成功或失败后，继续按原服务、原授权和原任务编号核对reserved/pending账务，遇到settled/released后停止。保留暂停和授权失效门槛；不发起新的生成POST，不改最终body、幂等键或归属。
- 画布显示“视频已结束 · 正在核对实际扣费和预冻结”；任务详情可停止本地对账查询。Core后台核对不因此取消或退款。
- Run新增可选executionFinishedAt，记录本地首次观测终态的时间。后续查询、结算和下载不增加执行耗时。旧记录没有这个时间时显示“耗时未记录”，不从后来更新的时间反推。
- E:\AIWORK\data\bridge-budget-policy.json原先于10月6日到期。备份后原子续期现有397积分风险预占至10月15日23:59:59（UTC+8）；保留29个历史profiles、模型和基准规格，不读取或修改财务数据库，不改变Key额度，不重启AI Work。397是历史校准风险额度，不是本轮核验的当前价格。

运行AI Work二进制来自9cf5f98c7b969f767d821a06792df1462ae0769b，部署元数据记录base为da787d137de5370a1406dedb2f26d6788f99932b，SHA256为EAECE5C9CE88BC5421F1412F61C12310DFCDBA39A77306802CA428EE4A72CD5A。固定旧来源d97904d不能替代运行版本。只读核对运行源码，未改其现有未提交文件。

## 真实请求与账务

在用户原Chrome和4188进行检查，健康与模型目录均HTTP 200，seedance已选择，原9f632b20授权恢复。普通Key仅用于既定服务，未写入本报告或请求日志。4188最终加载index-BKaYD2Hv.js。

原篮球任务request_05gECpJzkzaRiOqGsiPzyw重新GET返回failed / budget_policy_expired / settled，Studio已保存“Core记录结算”。另一项10月3日旧失败request_NvkwJCeDKxnWuiZGcsAskg返回video_not_submitted / settled，也已更新显示。4项旧成功任务均返回completed，但成功响应只有id/status/content_url，没有账务字段；未将成功推断为已经结算。这些本地任务不能穷尽该Key在其他客户端留下的全部持有。

本轮只新增1次真实视频生成：本地ea0c7741-bcd8-4d6d-821b-b05f419b40bd，Core请求request_rZw7NSohchnYbKEGsd2mWA。使用用户原照片和原提示词，seedance、15秒、16:9、480p。正文保留原内容，执行规格附注与界面选择一致。上传200、提交202；没有第二次生成提交或再次上传来重试。未调用文字AI优化。

新任务经过queued和processing后failed，Core稳定代码video_execution_failed。可核验上游详情为3003 / HTTP 400，明确提示input image content[1] may contain real person。该结果证明上游拒绝当前参考图；不能判定这张图通过，也不通过改写人物年龄或身份等方法伪装输入。

| 同一普通Key的管理页快照 | 开始 | 真实请求结束后核对 |
|---|---:|---:|
| 已分配 | 13000 | 13000 |
| 已实扣 | 5878.6416 | 5878.8708 |
| 可用 | 5229.3584 | 4832.1292 |
| 持有 | 1892 | 2289 |

两次快照均满足已分配=实扣+可用+持有。测试期间聚合实扣增加0.2292，持有新增397；辅助预占2在流程中已退出持有。此聚合变化与辅助扣费、视频回执待核对的流程一致，但不是任务级最终视频账单。新请求的billing_state仍pending，新增397和旧1892都不能无凭据清零。当前可用余额足够；本次首要阻塞来自过期策略，随后来自参考图拒绝，不能称为Key积分不足。

Core现有隔离财务测试验证了真实回执到达后按实际金额结算、释放差额、失败也核对、重复回执不重复扣费、缺失回执不假定零费用。运行AI Work源码也会在成功和失败后启动只读用量刷新。当前新任务未取得最终费用事实，历史持有的逐请求来源仍未在可用管理页面中公开，不能把源码/隔离测试通过写成这些真实账目已修正。

## 实际验证

所有Studio命令在项目根运行，先加载scripts/use-local-toolchain.ps1。测试、缓存、Rust目标目录及截图均位于E盘。完整命令和退出码见evidence/QA58.json；原始日志位于work/qa-20261008/budget-recovery。

| 检查 | 退出码 | 结果 |
|---|---:|---|
| 初始聚焦单元红灯 | 1 | 24项：18通过、6行为失败 |
| 执行结束时间红灯 | 1 | 4项：0通过、4行为失败 |
| 修正定位器后的终态暂停红灯 | 1 | 1项：按钮仍禁用，行为失败 |
| 最终全量Studio单元 | 0 | 515通过、0失败、0跳过 |
| 最终相关浏览器回归 | 0 | 5通过、0失败、0跳过 |
| Core crate隔离回归 | 0 | 275通过、0失败、1忽略 |
| 类型检查、聚焦Lint、生产构建、体积检查 | 各0 | 通过 |

Core忽略的原有用例production_backup_migrates_without_changing_historical_rows要求私有不可变生产备份；本轮没有提供备份，也没有访问生产数据库。此项不计为通过。Core测试基于E:\trae-studio\work\core-qa32-345670b的345670bb3c4e6eb673afcb412e7a1dbd17eeffae及其既有3项未提交修复，未冒充生产Core源码版本已核验。

最初两次浏览器红灯有测试定位器/预期文案拼写错误，均先修正测试后重新观察有效行为红灯，未计为产品缺陷。初次Cargo执行遇到继承的失效代理，退出101，不计为红灯；仅在该命令进程中清除代理后按锁文件运行。第一次File.Replace的null备份参数受PowerShell绑定影响失败，原策略未变化；核对原hash和备份后改用明确备份路径，原子替换成功。

未重跑全部历史浏览器套件，未执行完整verify，未运行真实成功视频或下载验收。相关5项浏览器用例使用本地Mock/fake Key，与上述1项真实上游失败分开记录。

真实截图：work/qa-20261008/budget-recovery/original-task-settled.png、basketball-confirm.png、live-terminal-pending.png、live-final-canvas.png。最后截图为实际最终4188页面，显示待核对，不是设计图。隔离截图在browser-final-green的terminal-billing-*子目录。

## 未完成边界

历史1892和新397仍待可信最终费用回执；4项旧成功任务缺少普通用户账务字段；篮球图被上游拒绝而没有成片。核心财务数值未被手工改写。风险策略仍于10月15日到期，需要届时的有效价格/管理员风险依据。后续见QA58_NEXT_STEPS.md，独立审查仍待进行。
