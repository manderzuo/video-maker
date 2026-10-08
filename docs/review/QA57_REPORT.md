# QA57：篮球参考图与15秒原提示词真实测试

日期：2026-10-08（UTC+8）。项目路径 E:/trae-studio/TRAEWORK/aiwork-studio，分支 feat/aiwork-studio，基准提交 291f6d7991f30381dbb3cac2f5d222e4c1c31de8。模型由用户在宿主选择，当前工具不可验证。状态：单次真实流程测试已执行；审核结论受阻；待用户／独立审查。

## 实际操作

4188 启动前没有监听进程，使用既有 E 盘 Node 22.23.3、scripts/serve-local.mjs、dist 及已登记的无凭据运行清单恢复服务，仅监听127.0.0.1。服务进程20472，日志位于本轮 work 目录。没有重建前端或修改源码。

当前 Chrome 3 原站点项目／授权记录停留在10月4日，未自动恢复当前Key，未发现此前tutu项目；没有据此断言数据丢失原因。使用用户明确提供的 D:/Desktop/模型.txt 中视频字段，直接填入既有 api.gemstory.cn 连接，未输出／复制密钥到记录。健康与模型目录检查通过，seedance可见。这是UI调用 CoreClient.testConnection()的等价 doctor 检查，未执行技能CLI或读取其私有配置。

新建独立项目“篮球参考图真实测试 · 2026-10-08”，项目ID934dd8a6-6d30-462a-ba9c-b235050d20fb；导入用户本次指定PNG的原字节，保留完整原提示词，创建文本和图片到视频的两条输入连线。规格seedance、15秒、16:9、480p。没有AI文字优化调用。应用按既有逻辑追加一致的输出规格说明，原提示词逐字作为前缀保留；不是完全无追加的最终prompt。

## 真实结果

- 1次POST /v1/assets，HTTP200；1次POST /v1/videos/generations，HTTP202；14次原任务GET，HTTP200。没有重发生成请求。
- Run：edfef708-4805-4590-8c65-8acb5323a306；Core任务／请求：request_05gECpJzkzaRiOqGsiPzyw。
- 显示编号：视频-20261008-115526-EDFEF7；开始11:55:26，最终同步11:56:13，耗时46747毫秒。
- 最终任务failed，公开错误码budget_policy_expired。
- 公开说明：当前视频预冻结基准已过期，尚未提交视频。
- 回执billing_state=settled，并提示可在Key使用记录查看实际扣费；没有返回具体消耗数。本地Run目前billingState=not_provided，不能把该本地状态当成服务未结算，更不能声称未扣点或已退款。

本次受阻于执行网关预算基准，尚未提交给视频模型。没有图片／提示词审核回执，没有成片，因此不能判定用户这组内容过审或被人脸审核拒绝。流程用例1项执行、0成功、1受阻；服务任务确认为失败。遵循Seedance技能失败后停止，没有自动改prompt、改Key、换任务身份重试。

## 证据与限制

私有证据均在被Git忽略的 work/qa-20261008/basketball-live/：原图source.png、原文prompt.txt、confirmation.png、result.png、result-queue.png、network.json、run-snapshot.json、run-final.json、public-error-detail.json、server.log、server-error.log。照片、完整请求／图数据不提交Git。网络记录仅保留方法、路径、请求编号、响应状态；未包含请求头、Key、图片Base64。

图片SHA256为8aeb02bf799cc1298897333b05759fb5c266177eae0edcf1d09a2392be32abbc；导入素材记录与源文件一致。两份Run快照都在最终failed状态读取，run-snapshot不是提交前快照。截图为实际运行页面；CDP仅用于读取请求回执与本地项目证据，未修改DB或页面；结束已禁用Network捕获，保留测试标签页。

只读查看Core本地源码E:/trae-studio/work/core-qa32-345670b，版本345670bb3c4e6eb673afcb412e7a1dbd17eeffae。seedance_feedback.rs明确映射budget_policy_expired为上述说明；没有访问生产财务数据库、私有配置或修改Core。该源码版本不构成当前生产内部状态核验。

发现两个展示缺口：此错误被Studio映射为video_failure_reason_unavailable，详情／执行队列丢失具体预算原因；公共settled状态未映射到本地账务状态。本轮未修复、未运行单元／浏览器套件／Lint／构建，不宣称产品验收通过。下一步见QA57_NEXT_STEPS.md。
