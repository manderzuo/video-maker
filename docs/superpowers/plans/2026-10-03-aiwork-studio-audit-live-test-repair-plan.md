# AI WORK Studio 代码审计、真实测试与 BUG 修复实施计划

> **执行者必读：** 使用 `superpowers:executing-plans` 在当前会话按顺序实施。沿用用户指定的单执行者方式，不启动子代理，不重新选型。以下复选框是未来工作，均未因本计划编写而完成；实施者自检与用户验收、独立审查分别记录。

**目标：** 使用户原 Chrome 中的“测试项目”能够明确配置文字与视频服务，完成受控真实生成，并逐项验证设计规定的按钮、交互、保存、恢复和异常处理。

**架构：** 保留现有 React 网页、IndexedDB、语义命令和执行记录。独立文字 API 供提示词优化及线上 Agent 文字提案使用；视频经 Trae-core 公开用户 API 进入 AI Work。沿现有适配器修复，不新增一套执行引擎、账号或账务系统。

**技术栈：** 沿用 package-lock.json；当前 package.json 固定 React 19.2.8、TypeScript 5.9.3、Vite 7.3.6、Zustand 5.0.15、Vitest 4.1.11、Playwright 1.58.2。Node/npm 用 `scripts/use-local-toolchain.ps1`，不以 `@latest` 更新基线。

**设计依据：** `docs/superpowers/specs/AIWORK_Studio_Design_v1.md`、`AIWORK_Studio_Prompt_Generation_Design_v1.1.md`、`docs/superpowers/plans/2026-09-30-aiwork-studio-implementation-plan.md`、`shared-contracts.md`；验收细则见原 WP04、WP07、WP08。用户后续批准的满窗口画布、16px 字号、独立文字 API 和线上 Agent 文字提案优先于旧稿的相应表述。

**状态：** 2026-10-03，计划已编制，QA01–QA12 待执行。当前回合仅核对源码、文档、模型配置和本机运行元数据；没有修改产品代码、运行产品测试或发送真实生成请求。

## 1. 全局约束

- 实际根目录 `E:\trae-studio\TRAEWORK\aiwork-studio`，分支 `feat/aiwork-studio`，计划基准 HEAD `59ed6416aafb50d3153312a54a5a7690b9ec483f`。执行前再次核验，保留未提交修改。
- 用户宿主选择模型；当前工具不能核验，记录“由用户在宿主选择，当前工具不可验证”。
- 新代码、测试、浏览器测试文件、日志、下载和截图均在 E 盘。不得用 C 盘副本冒充项目；不能覆盖解压、清库、reset --hard 或 clean -fd。
- 用户真实项目位于原 Chrome 的 `http://127.0.0.1:4188`；协议、主机、端口和浏览器配置文件必须保持。4179 的隔离数据不能代替原项目验收。
- “普通Core Key仅当前标签页内存”；独立文字 Key 同样只作内存授权。凭据不进入代码、审批文件、日志、截图、trace、项目包、Agent 上下文或 Git。普通代理仅在请求期间转发鉴权。
- “文字模型id不写入视频模型字段”；本地整理、创建流程、应用提示词、接受提案都不等于收费授权。
- “真正提交前必须先保存run_id”、输入快照、原连接/授权绑定、最终 body 和幂等键；已发送后不改 body，不换键自动重发。
- executionState、queryState、deliveryState、billingState 分开；停止查询不代表取消，视频完成不代表账务结清，下载失败只重试下载。
- 源仓库只读、固定提交不自动升级；不访问 Core 财务数据库、不改管理开关、不使用内部 bridge 或管理员凭据。
- 图片/音频生成、远端取消、续写、远程备份等按已核验契约门控；不通过伪造 `live_verified`、导入 Mock 能力或全局 `allowWrites=true` 解锁。
- 已有真实视频授权边界继续有效：默认 5 秒、480P、不充值、消费不超过指定 Key 当前剩余积分。该上限不等于要求耗尽余额，也不能被报告为已核验的服务端硬限。
- 首轮最小探测最多 1 次文字生成和 1 次视频生成，无自动重试。更多文字/Agent 调用或第二条视频应列出用途和次数，在已有授权范围不清楚时集中补齐一次，不能暗中扩量。
- 本计划不包含远端推送、main 合并、生产部署、生产数据迁移或修改既有业务仓库。许可与独立审查门槛保留。

## 2. 已核对的事实与未验证项

基线文件：`docs/review/qa-20261003/planning-baseline.json`。其中保存编制时 35 个已跟踪修改文件和 20 个未跟踪文件的哈希，避免后续覆盖已有工作。未提交代码属于当前审计范围，HEAD 不能单独代表运行源码。

| 项目 | 已确认事实 | 尚不能作出的结论 |
| --- | --- | --- |
| 本机运行 | 4188 的 `/projects` 返回 200，入口包含 `index-ZYCUxUqA.js` | 不能据此判定全部功能通过 |
| 文字配置 | 用户文件提供 `https://opencode.ai/zen/go/v1/chat/completions`，模型 `deepseek-v4.1-flash` | 当前 Key 的生成权限、用途准入和真实文字结果未验证 |
| 视频配置 | 用户文件提供 `https://api.gemstory.cn/v1`，模型 `seedance` | 文件未提供部署版本、已开放规格、准入、幂等与费用回执契约 |
| 视频门控 | 本机 `/studio-deployment.json` 为 `unverified/unknown`，视频提交/查询/内容路由全为 false，模型与规格列表为空 | 不是上游模型不可用的证据；当前客户端尚不具备执行条件 |
| 登记实现 | `scripts/serve-local.mjs` 的 Core 登记创建只读契约及 `allowWrites:false` | 单纯在下拉框填 seedance 不能接通提交链路 |
| 文字状态 | 原 Chrome 中页头“只读连接成功”，表单“配置已变更”；源码直接比较原始地址与规范化地址 | 缺陷已观察，尚未补自动化红灯或修复 |
| 真实测试入口 | `tests/live/authorized-live.spec.ts` 在授权通过后仍直接抛出未实现错误；runner 固定记录实际业务调用 0 | 不能把已有守卫用例当作真实执行器 |
| 用户项目 | 已将原提示词连接到一个视频草稿并保存；参数禁用；演示观察到生成 POST 为 0 | 未生成视频，未完成用户项目全流程验收 |
| 已有覆盖 | 台账实际为 260 项交互、23 个页面/面板、30 类弹窗 | 旧映射齐全及旧测试通过数不等于当前版本逐项真实验收通过 |

既有证据保留在 `docs/review/manual-ui-20261003-01/`。旧报告与本批结果分别标注日期和版本，不回写旧通过数，不将“待实施”的冻结设计台账当作当前实现状态。

### OpenCode 专用前缀处理（用户新增要求）

官方 Go 文档在本次核对时列出以下区别，适配时逐层处理：[OpenCode Go](https://opencode.ai/docs/go/#endpoints)。

| 层级 | 本项目使用值/规则 |
| --- | --- |
| OpenCode 客户端配置标识 | `opencode-go/deepseek-v4.1-flash`；`opencode-go/` 是该客户端的供应商前缀 |
| 直接 HTTP 的模型 ID | 官方模型表为 `deepseek-v4.1-flash`；实际发送值与该服务模型目录匹配 |
| 服务基础路径 | 保留 `/zen/go`；模型目录为 `/zen/go/v1/models`，文字请求为 `/zen/go/v1/chat/completions` |
| 请求身份 | 代理如实使用应用 User-Agent，并转发每个会话稳定的 `x-opencode-session`；鉴权按服务协议构建一次 Bearer 前缀 |

不能把配置用的供应商前缀盲目写进 HTTP `model`，也不能把 `/zen/go` 误删成站点根地址。只对已识别的 OpenCode Go 地址做该映射，不通用剥除其他供应商模型 ID 中的斜杠。已有 User-Agent/session 代码需验证，不重复另写一套。

OpenCode Go 官方说明主要面向编程 Agent，并有客户端身份和会话要求。Studio 提示词/线上提案用途的实际准入仍需核验；如服务明确拒绝该用途，应记录限制并提交用户决定，不伪装成其他客户端、不自动更换模型或服务。[官方客户端说明](https://opencode.ai/docs/go/#where-can-i-use-it)

## 3. 审查焦点

| 容易遗漏的输入/故障 | 必须结果 | 责任任务 |
| --- | --- | --- |
| 同一地址的完整 endpoint、`/v1` 和基础路径写法；供应商前缀 | 同一连接身份，模型目录/提交路径正确；不误报修改，不破坏别家模型名 | QA03、QA05 |
| 切换 Key/服务/模型时，旧检查或生成结果晚到 | 旧结果不覆盖当前状态；历史任务继续保留旧身份 | QA05、QA06 |
| 保存失败、双击、休眠后旧标签恢复；Core 已接受但响应丢失 | 先持久化、单飞、旧写者失权；未知状态不产生新提交 | QA06、QA09 |
| 视频成功但文件失败、账务缺失、授权失效 | 四状态独立，原任务可恢复，只重试读/下载，不虚报退款 | QA06、QA07 |
| 自动保存改变 revision、中文约束、Agent 过期/越权提案 | 不丢输入、不静默改约束、不越权覆盖，不把修订接受当收费确认 | QA08、QA09、QA10 |

## 4. 阶段与依赖

| 顺序 | 任务 | 交付检查点 |
| --- | --- | --- |
| A | QA01 基线与验收台账；QA02 服务契约核验 | 保护用户项目，明确两个 API 的实际协议和缺口 |
| B | QA03 文字适配；QA04 视频登记/默认模型；QA05 状态统一 | 原 Chrome 可准确配置，执行条件与真实验证状态分明 |
| C | QA06 关键代码审计/故障回归；QA07 最小真实闭环 | 至少一条文字结果和一条视频结果可追溯，或给出具体服务阻塞 |
| D | QA08 全交互点击验收；QA09 剩余代码/数据/Agent 审计 | 每项交互有结果，每个在审模块有记录，发现的问题闭环复验 |
| E | QA10 视觉/缩放/性能；QA11 最终组合回归与启动恢复；QA12 交付审计 | 在同一最终版本上形成验收包，供用户与独立审查者签收 |

按单执行者串行推进。遇到真实服务阻塞，只暂停依赖它的真实步骤；本地代码审计、异常测试及无费用交互继续。每个阶段完成报告实测结果；不承诺无人运行的后台持续工作。

## 5. 执行任务

### QA01：冻结当前工作、保护项目、建立完整清单

**文件：** 读取 `docs/review/interaction-trace.csv`、`page-dialog-trace.csv`、`interaction-map.json` 和旧手工证据；新增 `docs/review/qa-20261003/{baseline.json,source-audit.csv,interaction-results.csv,page-dialog-results.csv,defects.json}`。

**输入/输出：** 输入实际 Git 差异、运行 bundle、原 Chrome 页面；输出可追踪基线、恢复文件路径、全部源码审查清单和实际控件清单。

- [ ] 再次核对分支/HEAD、所有未提交文件、运行资源；保存源码哈希与必要文件备份，不覆盖他人改动。
- [ ] 通过原页面“立即保存”和“导出项目备份”保护“测试项目”；校验实际导出文件可在另建测试项目恢复。备份不等于执行日志快照，原库和原任务必须保留。
- [ ] 清点 `src/`、`companion/src/`、`scripts/`、`deploy/`、测试基础设施及未提交差异，逐文件记录责任任务、hash、已读/待读、发现项与证据。供应商依赖不冒称逐行审计。
- [ ] 从 260/23/30 台账建立验收行；扫描实际路由和 `data-interaction-id`，追加独立文字 API、线上 Agent、连接状态等新增控件，不用旧 260 作分母上限。
- [ ] 每个设计项没有实现入口时登记“缺失”，不要删行；重复入口分别点击，测试集以“行为+前置条件+入口”为单位。
- [ ] 写 QA01 证据；此任务是取证，不为了计划文档编造失败测试或测试通过数。

**退出条件：** 用户作品有可核对备份，原数据仍在；源码和交互分母明确，未操作项保持未开始。

### QA02：分别核验 OpenCode Go 与 Core 视频契约

**文件：** `src/adapters/core/{contracts.ts,capabilities.ts,route-policy.ts,http-client.ts}`、`src/adapters/text/session-policy.ts`、`scripts/serve-local.mjs`；新增 `docs/review/qa-20261003/service-contracts.json`。只读来源为 `E:\trae-studio\sources\Trae-core-c056dff`。

**接口：** 沿用 `DeploymentContract`、`resolveCapabilities(raw, models)`、`createCoreClient()`、`createTextClient()`；输出绑定明确 origin/部署证据/版本的契约，未确认字段不生成可执行枚举。

- [ ] 记录用户模型文件的端点和两个模型 ID；密钥只在执行时进入当前标签内存，不复制文件、不打印原文。
- [ ] 核对官方 OpenCode 模型表、前缀、请求格式、会话头和错误格式；先验证地址/模型目录及身份，不以最小聊天冒充只读测试。
- [ ] 复核 Core 固定提交 `c056dffc41c701fb1b78a84c18c2ec139d3d708b` 的公开 `server.rs`/`user_routes.rs`，记录实际部署版本或服务方公开契约证据。固定源码存在路由不等于本域名已开放。
- [ ] 核验视频提交、原任务查询、内容获取、普通 Key scope、嵌套 task/request ID、幂等语义、错误与费用字段。使用 `/v1/videos/generations`，避免误走具有辅助文字费用的 Seedance chat 分支。
- [ ] 核验 5 秒、`480p`、比例、prompt 字节限制；有参考时再核验 MIME/字节/数量和上传接口。固定源码可接受某值只是来源证据，不直接宣布线上支持。
- [ ] 缺部署/准入/预算证据时列明缺项与可继续工作；不访问 admin、数据库，不为“测试”修改 Core 开关。

**退出条件：** 两个服务分别得到“契约可实施”或带证据的阻塞结论；目录可读、鉴权有效、模型可选、真实生成分别记录。

### QA03：修复文字连接、OpenCode 前缀与错误提示

**文件：** 新增 `src/adapters/text/provider-profile.ts`、`tests/unit/text-provider-profile.test.ts`；修改范围限 `TextApiSettings.tsx`、`register-target.ts`、`scripts/serve-local.mjs`、`src/ui/text-failure-message.ts` 及确有缺陷的现有文字适配文件；测试复用 `deepseek-text.test.ts`、`deepseek-registration.test.mjs`、`acceptance-deepseek.spec.ts`。

**接口：** 新增 `normalizeTextApiBase(value: string): ValidationResult<string>` 和 `resolveTextModelId(base: string, input: string, catalog: readonly string[]): ValidationResult<string>`；继续向 `ConnectionProfile.originSnapshot` 保存规范化基础路径，向 `sendCoreText()` 传目录匹配的 API 模型 ID。服务端登记与 UI 使用同一规则，已有任务绑定不迁写。

- [ ] 先写失败断言：三个地址写法 `https://opencode.ai/zen/go`、末尾 `/v1`、末尾 `/v1/chat/completions` 都规范到 `/zen/go`；目录与提交各追加一次 `/v1`，拒绝凭据 URL、查询和路径穿越。
- [ ] 先写失败断言：OpenCode Go 的 `opencode-go/deepseek-v4.1-flash` 与裸 ID 均解析为目录中的裸 ID；未知模型及错误供应商前缀明确报错；其他服务合法的斜杠模型名不被修改。
- [ ] 运行 `npm run test:unit -- tests/unit/text-provider-profile.test.ts tests/unit/deepseek-text.test.ts`，记录真实行为红灯；再最小修复规范化、选项显示和可复用内存授权判断。
- [ ] 核对应用 User-Agent、稳定会话头和一次 Bearer 鉴权；补 HTTP 402 无 error code 的额度提示断言，以及 401/403/404/429/超时/格式错误断言。上游拒绝不自动切服务或重发。
- [ ] 重跑上述单测、`node --test tests/companion/deepseek-registration.test.mjs`、`npm run test:acceptance -- tests/e2e/acceptance-deepseek.spec.ts`；实际 Mock 转发 URL/头/模型体匹配，不记录真 Key。
- [ ] 回到原 Chrome 测试保存/返回/只读重测；输入框清空时仍准确识别标签内存授权。新增/修复用例全部通过后记录 QA03，只暂存本任务文件形成本地提交。

**退出条件：** 专用路径和前缀处理有行为证据；页面不因等价地址失配锁住按钮；这一步仍不宣称真实文字生成通过。

### QA04：视频能力登记、seedance 默认项与参数入口

**文件：** `scripts/serve-local.mjs`、`src/infrastructure/deployment/{registration.ts,register-target.ts}`、`src/adapters/core/capabilities.ts`、`src/features/settings/{ConnectionSettings.tsx,CapabilitySettings.tsx,default-models.ts,preferences-store.ts}`、`src/features/canvas/nodes/VideoNode.tsx`；新增 `tests/unit/video-connection-activation.test.ts`、`tests/e2e/video-connection-activation.spec.ts`；必要的无密钥本机 runtime 配置存 E 盘 `work/qa-20261003/`。

**接口：** 保留 `RegisteredConnection={profile,contract}`、`defaultVideoDraft(capability): VideoSpec|undefined`。仅经 QA02 确认的目标登记 reviewed 契约，真实成功后才能形成 live_probe；运行配置没有 Key。

- [ ] 先写失败测试：同一 Core 的 origin 与 `/v1` 写法不重复拼接；未核验时不能提交；已核验目标可选择目录中匹配的 seedance，其他目标仍只读。
- [ ] 先写失败测试：新草稿优先使用 seedance；现有草稿、历史 Run 的模型/时长/比例不被默认设置覆盖；服务缺少 seedance 时显示具体原因。
- [ ] 运行 `npm run test:unit -- tests/unit/video-connection-activation.test.ts tests/unit/core-contract.test.ts tests/unit/settings-boundaries.test.ts` 观察红灯，再修复登记到能力解析的断点。
- [ ] 在视频连接卡提供明确的模型/规格入口并同步能力页。未核验时可显示目标模型 seedance 与待核验原因，不能以默认值解锁执行；真实规格可用后才显示可执行选项。
- [ ] 仅对已核验注册项开放所需公开方法/路径；`/admin`、`/internal`、任意远端和未核验能力仍拒绝。服务重启后非秘密配置可恢复，Key 仍需标签授权。
- [ ] 重跑目标单测、`npm run test:e2e -- tests/e2e/video-connection-activation.spec.ts tests/e2e/video-spec-contracts.spec.ts tests/e2e/core-transport.spec.ts` 和代理登记测试；在原项目的视频草稿查看参数入口，写 QA04 并提交本任务差异。

**退出条件：** 能力门控可解释且能按证据正确开放，不再永久卡在无入口的“待选模型”；缺线上证据时保留阻塞，不强行变绿。

### QA05：统一连接状态和真实测试入口

**文件：** `src/features/settings/{connection-status.ts,ConnectionStatus.tsx,ConnectionSettings.tsx,TextApiSettings.tsx}`、`src/app/App.tsx`、`src/security/credential-session.ts`；`tests/unit/connection-status.test.ts`、`tests/e2e/api-connection-status.spec.ts`。

**接口：** 沿用 `connectionStatusView(channel, options)`、`runConnectionCheck()`、`rememberReadonlyStatus()`、`observeGeneration()`。身份范围必须包含连接、规范地址、当前内存授权版本、模型及视频规格；历史验证时间不能恢复当前授权。

- [ ] 为页头与设置矛盾、等价地址、切换 Key 后旧回包、返回设置表单未恢复状态写复现测试；先运行目标命令观察断言失败。
- [ ] 两张连接卡分别直观展示：地址已保存、当前标签授权、只读检查、模型/执行条件、真实生成验证。只读成功但未生成的文案明确为“连接检查通过，生成待验证”。
- [ ] “测试连接（只读）”仍只做既有只读请求；“验证文字生成/验证视频生成”跳转现有正常预览/确认流程，明确次数与费用，不建立隐藏测试 POST。
- [ ] 文字仅在真实有效响应后显示已验证；视频分别显示提交受理、执行结果和文件交付。尚无可信费用证据时保留账务待确认；Mock 结果、历史成功、取消确认均不能点亮当前真实验证。
- [ ] 运行 `npm run test:unit -- tests/unit/connection-status.test.ts tests/unit/credential-session.test.ts` 和 `npm run test:e2e -- tests/e2e/api-connection-status.spec.ts tests/e2e/connection-busy-contracts.spec.ts tests/e2e/navigation-memory.spec.ts`；完成真实页面焦点、禁用原因与状态一致性点击复验。
- [ ] 保存 QA05 的红绿日志/截图，提交对应文件。真实调用成功状态留给 QA07 验证。

### QA06：收费前关键代码审计与故障回归

**文件：** `src/application/runs/`、`src/application/prompts/optimize-text.ts`、`src/adapters/core/`、`src/features/review/media-delivery.ts`、`src/infrastructure/storage/{project-repository.ts,run-repository.ts,project-lease.ts,run-lease.ts}`、`src/security/`；现有对应 unit/security/e2e 测试。

**接口：** 保留 `prepareVideoRequest()`、`submitVideo()`、`recoverSubmission()`、`pollVideoOnce()`、`fetchRunMedia()`、`preparePromptOptimization()`、`optimizePrompt()`，不把测试直接请求替代产品链路。

- [ ] 逐文件审阅从 UI 确认→落盘→上传→最终 body 落盘→单飞提交→查询→交付的调用链；审阅本批未提交差异及状态观察回调，填 source-audit.csv。
- [ ] 审核必要场景是否有有效断言：保存失败零提交；双击/双标签最多一次；已接受但响应丢失；原 body/幂等冻结；租约过期；切换服务/Key 不改历史；取消确认零上传/零提交。
- [ ] 缺用例或发现缺陷时先加故障注入复现并观察行为红灯，再修复；用本地 Mock 测 401/402/403/409/429、超时、断流、坏 JSON、存储满。禁止用真实收费请求制造这些故障。
- [ ] 运行 `npm run test:unit -- tests/unit/video-submit.test.ts tests/unit/prepared-request.test.ts tests/unit/video-polling.test.ts tests/unit/media-delivery.test.ts tests/unit/text-optimization.test.ts tests/unit/project-lease.test.ts`，再运行 `npm run test:e2e -- tests/e2e/video-submit.spec.ts tests/e2e/generation-preflight.spec.ts tests/e2e/recovery-races.spec.ts tests/e2e/credential-boundary.spec.ts`。
- [ ] 执行 `npm run test:security`；核对导出、诊断、截图与网络记录不含 Key，跨源重定向不转发鉴权。生产 runtime 不能拿 mock 证据解锁远端。
- [ ] 修复后记录 QA06；存在重复收费、密钥泄漏、数据丢失或未知状态自动重试时禁止进入真实提交。

### QA07：完成真实执行器，并在原项目跑通最小链路

**文件：** `tests/helpers/live-approval.mjs`、`tests/live/{approval.schema.json,approval.test.mjs,guard.test.mjs,authorized-live.spec.ts}`、`scripts/run-authorized-live.mjs`、`playwright.live.config.ts`；新增 `tests/live/browser-flow.ts`、`tests/live/safe-observer.ts`、`tests/unit/live-evidence.test.ts`；证据 `docs/review/qa-20261003/live/`。

**接口：** 复用 `evaluateLiveApproval()`/`createLiveCallBound()`；扩展为分别约束文字与视频的 endpoint、绑定、模型、次数和费用单位。文字额度与 Core 积分不能相加成一个数字。`safe-observer.ts` 只产出请求/任务 ID、方法/安全路径、状态码、计数、时间、body hash 和四状态摘要，不导出请求头或完整网络 trace。

- [ ] 先以假 Key/本地 Mock 写失败测试：正确授权后能从正常页面走完并生成真实观测证据；未授权/过期/超次数/目标不匹配拒绝；未知结果停止后续新提交。旧硬编码 0 和直接抛错不能满足测试。
- [ ] 实现 runner 的实际 UI 流程和安全观测，禁用自动重试及含敏感头/body 的 trace/HAR。原 Chrome 用已接通连接器执行同样步骤；单次操作只由一个入口触发，自动 runner 与人工演示不能各发一遍。
- [ ] 将当前 live 用例的 10 秒总超时改为有记录的观察窗口：首轮最长 20 分钟，每次工具等待不超过 60 秒；产品提交/查询超时分别按 QA02 协议核对。观察窗口耗尽只标未确认并保留原任务，不判失败、不再提交。该窗口不代表生成时长承诺。
- [ ] 运行 `node --test tests/live/guard.test.mjs tests/live/approval.test.mjs` 与 `npm run test:unit -- tests/unit/live-evidence.test.ts`，确认本地守卫及报告可靠；这些结果标 Mock，不标 live。
- [ ] 开始真实批次前把已有授权写成无密钥操作范围记录：沿用用户指定服务和 Key、5 秒/480P、当前剩余积分上限、不充值；补齐未提供的文字次数/额度边界、有效批次或截止条件、Core 准入证据，不重复索要已明确的部分。不能伪填 budgetEnforcement.verified。
- [ ] 文字最小实测从现有提示词进入 AI 优化，预览原文/模型/发出内容，确认一次；验证响应非空且被正确解析/标记，结果附属原版本，保留原提示词，任务/状态可追踪。无效结果保留供检查，不自动请求“修复 JSON”。
- [ ] 视频实测沿已有文本→视频草稿，核验 seedance/5 秒/480P/有效比例，查看输入快照，确认一次；保存后提交，记录 task_id/request_id，经原绑定查询到完成，实际预览并下载、缓存或回画布，核对原视频文件可播放。
- [ ] 记录明确请求次数、真实结果、返回规格、耗时和服务提供的费用证据。没有用户级费用字段/权限就标账务未知，不能读取管理数据库填数。模型未遵循创作要求应单列内容质量问题，不混成传输失败。
- [ ] 未知响应、额度/权限/准入失败即停止新收费；继续原任务只读核查。视频明确不支持 480P 或当前比例时先报告，不静默升级规格。
- [ ] 写 QA07；真实成功不只看 HTTP 200 或 task_id。文字生成、视频执行、交付和账务分别给结论，独立审查保持待审查。

**补充场景：** 线上 Agent 的真实提案需要另一文字调用；两个真实视频比较需要第二条视频。默认首轮不包含它们，应明确计入后续额度与次数；比较按钮可先用已有或本地导入结果验证，标注证据类型。跨 Key 真实归属验证需要第二个明确授权的普通测试 Key；缺少时保留待验证，本地隔离断言继续执行。

### QA08：按设计对原 Chrome 全部按钮和交互实际操作

**文件：** `docs/review/qa-20261003/{interaction-results.csv,page-dialog-results.csv,defects.json}`、`screenshots/`、`manual-events/`；缺陷对应 feature 文件及现有同模块测试，不预先泛改全部组件。

**接口：** 每行记录 `id,入口,前置,预期,实际操作,实际结果,正常/禁用/异常/持久化/副作用,版本,浏览器,证据,缺陷号,复验状态`。只读检查与真实生成分别计数。

- [ ] 用原 Chrome、同 origin、“测试项目”验主流程；每个实际控件点击或操作一次，记录执行结果，覆盖鼠标、键盘等设计明确的不同入口。DOM 映射、截图或 trial click 不能代替操作。
- [ ] 顺序：连接/能力→项目→画布节点/连线/输入→提示词库及 PG→素材→执行确认/任务→结果/比较→Agent→数据/恢复→活动/帮助。每组完成才更新该组实际进度。
- [ ] 每项分别验证正常路径、缺条件/禁用原因、忙碌防重复、异常恢复、保存/撤销和网络副作用。真实服务错误不为凑数量故意触发，故障分支在隔离 Mock 浏览器真实点击并明确标注环境。
- [ ] 检查所有 30 类原弹窗及新增弹窗：打开、默认焦点、Tab/Shift+Tab、Esc 逐层关闭、关闭/取消/确认、焦点返回、错误保留、滚动和忙碌状态。删除/清空等在同浏览器新建验收副本执行，先确认恢复可用，避免破坏唯一作品或执行追踪。
- [ ] 不可执行的条件能力验证隐藏/禁用/原因及零副作用，标“门控行为通过，远端能力未验证”。缺入口、点后无结果、伪成功、错误不可恢复分别登记 BUG，不算通过。
- [ ] 缺陷逐个走“复现→原因→行为红灯→最小修复→目标回归→原入口点击复验”；截图保留前后状态，影响同组件的其他入口一并复验，原失败记录不删除。
- [ ] 在每组结束保存证据和恢复点；写 QA08 的通过/失败/受阻/未开始数量，不把一次点击当该项所有状态验收完成。

### QA09：完成剩余源码审计、持久化与 Agent 流程核对

**文件：** `src/domain/`、`src/application/commands/`、`src/application/proposals/`、`src/features/{projects,assets,prompts,prompt-generation,agent,recovery,packages}/`、`src/infrastructure/{storage,packages}/`、`companion/src/`、测试 helpers 和报告脚本。

**接口：** 沿用原命令 envelope/receipt、Proposal schema、IndexedDB 事务和 `prepareOnlineAgent()`/`sendOnlineAgent()`；不允许 UI、快捷键与 Agent 各自绕过事务修改整图。

- [ ] 完成 QA01 源码清单的剩余文件：审查输入 Schema、UTF-8 上限、引用身份、撤销/删除范围、包导入安全、恢复兼容、Agent 权限/过期/修订和资源清理；每条结论指向实际代码与用例。
- [ ] 重点复现：素材仍被引用；备份缺文件；未知 schema/Run 保留；恢复不自动提交；提案预览后自动保存引起 revision 变化；过期、越权、未知操作及超量提案；恶意 prompt 不执行脚本。
- [ ] 自动保存与提案版本冲突需确认根因，不能以忽略 revision 消除拦截；无实质上下文变化的场景是否刷新预览，以安全 CAS 和原设计决定。
- [ ] 缺陷先加行为失败测试再修复；运行 `npm run test:unit -- tests/unit/project-store.test.ts tests/unit/project-package.test.ts tests/unit/recovery-diagnostics.test.ts tests/unit/agent-proposals.test.ts tests/unit/independent-text-agent.test.ts`，以及 `npm run test:e2e -- tests/e2e/project-package.spec.ts tests/e2e/lease.spec.ts tests/e2e/prompt-canvas-commands.spec.ts tests/e2e/agent-proposal-review.spec.ts tests/e2e/canvas-mcp.spec.ts`。
- [ ] 线上 Agent 在已有授权覆盖其额外文字调用时，从原 Chrome 发一次小范围提案：选区→上下文预览→费用确认→提案 diff→勾选应用→撤销/保存；确认没有视频提交。费用授权不足则保留真实场景待验，本地按钮测试照常。
- [ ] 运行本机 MCP 协议回归 `node --test tests/companion/mcp-runtime.test.mjs`；外部模型宿主端到端未连接时明确留空，不把在线文字提案等同完整 MCP 宿主验收。
- [ ] 审核测试本身：无随意跳过/软化断言/固定成功计数、无全局伪状态；写 QA09 和对应缺陷复验，不重构与缺陷无关模块。

### QA10：视觉、输入法、原生缩放、性能和持续运行

**文件：** `src/ui/tokens.css`、`CanvasPage.tsx`、`Dialog.tsx` 及确有问题的组件；`tests/e2e/{real-browser-zoom.spec.ts,visual-a11y-performance.spec.ts,a11y.spec.ts}`、`tests/performance/canvas-profile.spec.ts`；证据存本批目录。

- [ ] 复核满窗口画布、顶部/侧面工具、已认可字号、节点遮挡、面板可收起、文本与视频草稿的初始摆放；截图中节点重叠先复现再判定原因，不直接改布局引擎。
- [ ] 测深/浅主题和 1440/1280/1024/720 宽度；小屏收费/复杂编排按设计门控。检查空、忙、错误、只读、恢复与长文本等关键状态。
- [ ] 若所需浏览器确实缺失，先加载 E 盘工具链，再执行 `node node_modules/@playwright/test/cli.js install chromium`，补齐锁定版本对应浏览器到 E 盘缓存；随后用真正浏览器缩放验证 125%/150%。不得用 CSS zoom、画布缩放或只改 viewport 冒充。失败是环境受阻，不能删除用例计通过。
- [ ] 在真实页面做键盘焦点/快捷键；操作系统中文输入法需原生人工或当前工具确有能力的实操证据，模拟 composition 事件不冒充人工 IME 验收。
- [ ] 运行 `npm run test:e2e -- tests/e2e/real-browser-zoom.spec.ts tests/e2e/visual-a11y-performance.spec.ts tests/e2e/a11y.spec.ts` 和 `npm run test:performance`；记录固定设备上 50/200 节点输入、平移、保存及媒体资源占用。
- [ ] 做一轮有记录的 60 分钟本地持续运行，包含编辑、保存、导航、媒体打开关闭和标签休眠/恢复；不持续调用收费模型。长等待每段不超过 60 秒，定期保存进度。人工视觉与 IME 认可仍交给用户。

### QA11：最终版本组合回归、重启与离线交付检查

**文件：** 现有 package scripts、测试 runner/reporters、发行和启动脚本；仅在发现缺陷时修改。输出 `docs/review/qa-20261003/final-regression.json` 与对应日志。

- [ ] 记录最终源码 HEAD、未提交哈希和 dist 文件 hash；设置本批报告路径。旧测试可能写固定 Txx 截图/日志，先保留旧文件，必要时给工具增加输出目录参数，避免覆盖历史证据。
- [ ] 在同一最终源码版本串行运行 `npm run verify`，随后 `npm run test:acceptance`、`node --test tests/companion/*.test.mjs`、`npm run test:live-guard`。如 PowerShell/Node 不展开 glob，枚举确切 `.test.mjs` 文件逐项运行并记录。
- [ ] verify 已含的测试不无故重复；新增修复后重跑受影响部分，最终再取得同一版本的组合结果。记录每条实际命令/退出码/通过/失败/跳过数，不拼接旧版本数量。
- [ ] 做品牌、安全与许可检查；许可未解决保留发布门槛。启动包验证只产本机审阅包，不因测试通过正式发布。
- [ ] 不抢占原用户 4188 服务跑并发分发测试；隔离端口运行打包测试。需要更新原页面前先保存，再在受控重启后验证 `/projects`/画布深路径、静态资源版本、非秘密配置恢复和重新授权流程。
- [ ] 在原 Chrome 重新确认已有项目/视频草稿/真实任务/下载结果，重开只恢复原任务查询，不自动提交；留同一版本最终截图。

### QA12：形成最终验收包与独立审计交接

**文件：** 新增 `docs/review/qa-20261003/{FINAL_REPORT.md,acceptance-status.json,unresolved-items.md}`；更新 `docs/review/NEXT_STEPS.md` 指向新报告并保留旧报告链接，不重写历史 T01–T50 证据。

- [ ] 汇总 QA01–QA11 状态、源码覆盖、交互/页面/弹窗各项结论及新增控件分母，区分代码自检、原 Chrome 实操、隔离浏览器、真实服务与人工审阅。
- [ ] 汇总缺陷原因、修复文件/commit、红绿测试、真实页面复验和遗留项；没有证据的行为保持未验证。
- [ ] 真实调用单独列两个服务、模型、调用次数、请求/任务关联、结果、交付、费用证据或未知；不包含 Key、原始请求头或敏感媒体链接。
- [ ] 为用户提供原项目验收入口、最短操作路径、版本与截图/日志索引；明确哪些条件能力仍关闭，哪些项需人工视觉、IME、外部 Agent 宿主或服务方证据。
- [ ] 由用户或其安排的审查者独立核对关键变更；实施者只能标自检通过、待审查。未签收不写“独立审查通过”或“全面验收通过”。
- [ ] 保留本地历史与所有未提交工作；未授权不推送、不合并 main、不上线。记录恢复点和下一批依赖，结束当前批次。

## 6. 缺陷分级与验收规则

| 级别 | 示例 | 处理规则 |
| --- | --- | --- |
| P0 | 泄露凭据、重复收费、误用授权、永久数据丢失 | 立即停止相关真实提交，保留现场，优先修复 |
| P1 | 主链路不可用、错误成功状态、关键按钮无效、任务无法恢复 | 阻断对应模块验收，修复后原入口复验 |
| P2 | 有替代路径但误导的文案、布局遮挡、键盘/缩放问题 | 记录影响和修复，交付前明确处置 |
| P3 | 不影响操作的轻微视觉/体验问题 | 单列，由用户决定是否接受遗留 |

每个缺陷包含编号、设计 ID、版本/hash、环境、前置与复现、实际/预期、原因、影响、证据、修复 commit、复验结果。先识别代码、配置、服务限制或测试环境问题，再决定修复对象；不把所有 API 错误都当模型问题。

验收完成条件：

- 所有设计及新增控件均有处置，无未开始或缺失未解释项；可执行项的正常、禁用、异常、持久化和副作用有对应证据。
- 原 Chrome 的提示词→视频→查询→结果→下载/回画布链路有真实证据；文字生成单独验证。没有真实账务证据时该子项未通过，不用生成成功覆盖它。
- 当前最终版本所需回归 0 未解释失败；跳过/环境受阻不算通过，P0/P1 无未解决项。
- 导出恢复、身份隔离、幂等、未知状态处理、Key 不落盘有实际测试；发布许可和人工/独立审查单独签收。
- 外部条件未满足时只能交付“本地自检完成/部分真实链路通过/其余受阻”等准确结论。

## 7. 证据格式、进度与执行纪律

证据根目录 `docs/review/qa-20261003/`；逐任务写 `evidence/QAxx.json`，不覆盖历史 `evidence/Txx.json`。

每份证据至少含：任务状态、base/head、工作区 hash、执行者/独立审查状态、变更文件、实际命令与起止时间/退出码、通过/失败/跳过数、日志/截图、设计 IDs、网络方式（无网/Mock/真实）、提交数、限制和下一恢复动作。未执行命令不填写 exitCode=0，使用 null 与原因。

每任务报告一次完成/异常，持续操作时不超过约 60 秒无有意义进度更新。上下文将尽时先落盘：当前任务、准确页面/项目、已执行按钮、已发生请求及原身份、尚未提交差异和下一步；不自动重做真实请求。

实现修复采用 TDD：精确复现并观察行为失败 → 最小修复 → 目标测试与相关回归 → 原页面实际操作 → 写证据 → 只提交本任务路径。环境缺依赖不算红灯，跳过不算通过。Git 提交失败则留错误与改动，不伪造 commit，不改全局身份。

## 8. 本计划自检

- 已覆盖连接/能力、生成/任务/审片、项目/素材/画布/提示词、备份/恢复、Agent、外观/无障碍/性能、启动/安全/许可和独立审查。
- OpenCode 专用路径、配置模型前缀、HTTP 模型 ID 和请求头分别有明确归属及回归要求。
- 既有用户授权继续生效；后续只补必要的缺失调用范围或外部证据，不重复请求总体设计批准。
- 260/23/30 为原设计基线，新增实际控件另计；全量源代码审阅与旧自动化映射分别统计。
- 已列出的函数为现有接口或 QA03 明确定义的新纯函数；未知线上能力不填造值。
- 本轮只创建计划、编制基线及更新下一步索引；产品测试 0、真实业务调用 0、产品代码修改 0。本计划不是审计完成或验收通过记录。
