# 账号云端功能验收对照清单（2026-10-09）

> 阶段0产物。基线 `E:/trae-studio/TRAEWORK/aiwork-studio/work/account-api-cloud-20261008/dev`，分支 `feat/account-api-cloud`。
> 本轮仅确定范围，未实施产品代码、运行测试、调用模型或部署。本文件是验收记录，不用历史通过次数填充本轮结果。

## 0. 基线冻结

- HEAD：`81576d82e6a506e6c661934ef71828cba894606e`（计划写 `81576d8`，一致）
- 最近程序提交链：`81576d8 docs: record six-character password rollout` / `aebd1f5 fix: allow passwords minimum six` / `15ae563 docs: record empty cloud deployment`
- 未提交：340 个 `M docs/review/...`（抽查均为截图/日志/JSON/CSV：`NEXT_STEPS.md`、`coverage-report.json`、`interaction-map.json`、`page-dialog-trace.csv`、`logs/T46-*.json`、`screenshots/T*.png`），无 `src/`、`server/`、`tests/` 修改。复用现有工作目录，不新建目录。
- 生产（修正2026-10-09审计1，原“尚未发布”有误）：`f98fe3e412d67892dca4f73e867a49b92a0f12fd`为空内容首次发布（`https://studio.gemstory.cn`，回环4188，归档SHA256 `87e9d89d...fbe`，快照`20261009T032428Z-75480394...`）；其后六位密码修复`aebd1f54f97a141e740d6b9550f5849a9d267c42`已按`docs/review/ACCOUNT_CLOUD_RELEASE_PREPARATION_20261009.md:40-42`上线（`git show 81576d8`为其上线记录文档提交，快照`20261009T033634Z-9b67febc...`，后端258/258、前端671/671、类型/lint、严格HTTPS 7/7、真实域名4项通过，单临时账号已按UUID清理）。本地HEAD `81576d8`即该记录提交。本轮为现场只读核验（git+文档静态核对），未做生产SSH/数据库/卷版本重验；不得用旧`f98fe3e`记录盖掉后续发布。发布前必须重新备份当前生产数据库/媒体/配置（用户此后可能已写入，禁止用发布前快照覆盖）。
- 密码：已为最低6位（`aebd1f5`），不追加组合要求。
- 旧入口仍在仓库但不在当前路径：`src/app/LegacyApp.tsx`（Welcome/本地IndexedDB/旧CanvasPage/ResultPage/ComparePage/Activity/Recovery/Package/Search/命令面板），当前 `src/app/App.tsx` 只挂 `AuthBoundary` → `CloudWorkspace/Cloud*`。旧业务函数对 IndexedDB 依赖必须改接云端，不能仅恢复路由。

## 1. 报告条目对照（1～13）

| # | 用户问题 | 旧入口 | 新入口（当前/目标） | 读写接口 | 验收场景 | 证据（当前代码） | 负责阶段 | 状态 |
|---|---|---|---|---|---|---|---|---|
| 1 | API目录、连接状态 | `ConnectionSettings`+`ConnectionStatus` 本地目录 | `ApiSettingsPanel`+`ApiModelFields`+新增`ModelPicker` | `client.list/test/save` → `server/src/settings/probe.ts`，`server/src/security/outbound.ts` | 成功显示“连接成功·已获取N个模型”；空目录显示可手填；401/403报权限；目录不支持无他证显示“未确认”；改地址/密钥旧成功失效；分页不完整标“未完整”；保存不遮盖状态；重进页去重只读检测显示“正在检测”；尾部模型可选；生成调用数为0 | `ApiModelFields.tsx` input+datalist、`use-api-settings.ts:59` 仅改model不清空result、`probe.ts` 单页`v1/models`无分页、视频要求healthz | 阶段2 | 待实现/待验证 |
| 2 | 删除使用引导 | `LegacyApp Welcome` 本地引导 | 删除`account-nav:welcome`，`/welcome`→`/settings/connections`，首次登录进项目页 | `sessionStore.completeOnboarding/lastVisitedPage`，`AuthBoundary.tsx:25` | 无使用引导导航/内容；直访/welcome跳设置；新注册进项目；空配置有设置入口；历史lastVisitedPage不循环 | `AuthBoundary.tsx:18-19` welcome与settings同渲染`ApiSettingsPanel` | 阶段3 | 待实现/待验证 |
| 3 | 页面全宽 | `app-shell`全宽 | `account-shell`去1100px/`account-content`去760px，登录表单保持阅读宽 | 纯样式 `src/ui/tokens.css:100`，`api-settings.css:1` | 1920×1080/1366×768无横向溢出；工作台占满可用宽 | tokens.css max-width限制确认 | 阶段3 | 待实现/待验证 |
| 4 | 提示词布局 | `PromptWorkspace` 左入中结果右检查，“正文/镜头草案/改动说明” | `CloudPromptGeneratorPage` 改左入中结果可收起右栏 | `server/src/prompts/routes.ts/contracts.ts/repository.ts` draft/resultVersion | AI结果在主要区域；正文可直接编辑+人工版本；镜头草案/改动说明/复制/保存到库/JSON导出/源参数对照可见；窄屏先收辅助栏 | `CloudPromptGeneratorPage.tsx:38` 纵向card，`PromptGeneratorPanel.tsx:110` 只展finalPrompt+warnings | 阶段5 | 待实现/待验证 |
| 5 | 时长画幅预设 | 旧写作 5-15s+5画幅 | `PromptForm` 预设时长5-15整数+16:9/9:16/1:1/4:3/3:4；旧超限值显示原值要求改，不静默改 | prompts draft接口 | 11档时长+5画幅可选；旧草稿超限保留原值提示改 | `PromptForm.tsx:13` 任意正数+自由文本 | 阶段5 | 待实现/待验证 |
| 6 | 全屏画布 | `canvas-shell 100dvh`+伸展画布 | `CloudCanvasPage` 占导航工具栏外全部视窗；大纲/视频/Agent进可收起侧栏/浮层；保小地图+适配缩放 | `cloud-canvas-model.ts stage/save` | 画布底近视窗底；工具栏+生成入口可见；1366×768可操作 | `CloudCanvasPage.tsx:48` 760px容器+600/420px高，面板放画布下方 | 阶段3+4 | 待实现/待验证 |
| 7 | 素材双来源 | `AssetsPage` 本地库+上传 | `CloudAssetPicker` “云端素材”+“上传素材”，上传后入库再建节点 | `listAssets/uploadCloudAsset` | 弹窗双入口；进度/失败/重试；失败不建假节点 | `CloudCanvasPage.tsx:45,58` 弹窗仅云端按钮，上传在上方files控件 | 阶段4 | 待实现/待验证 |
| 8 | 选择缩略图 | 旧素材卡预览 | 选择器图片/视频缩略图+失败占位重试 | 同上+`CloudAssetMedia` | 选前可辨认；音频占位+预览；未知文件不误作图片 | `CloudCanvasPage.tsx:58` 仅title文字按钮，`CloudAssetsPage.tsx:17` 预览组件未入选择器 | 阶段4 | 待实现/待验证 |
| 9 | 端口连线 | `CanvasConnections` 贝塞尔/端口/预览/菜单/校验 | 接回左右端口+实时曲线+高亮+点击键盘等价+选线断开+撤销 | `useCanvasConnections onCommand→cloud-canvas-model stage/save`，`GraphOperation[]` | 可视端口完成阶段1连接；锁定/错端口/撤销/刷新冲突 covered | `CloudCanvasPage.tsx:52` SVG直线pointerEvents:none；`CanvasConnections.tsx:19,72` 未引用 | 阶段4 | 待实现/待验证 |
| 10 | 续写修改 | `ResultPrimaryActions→TailFrameContinuationDialog/tail-frame.ts`，`ResultRevisionDialog/result-revision.ts`，审片/A/B/选后续输入；`WorkBranchDialog`原本禁用上游原片改版 | 新增`CloudResultsPage/ComparePage/cloud-result-actions.ts`，复用旧纯计算，媒体经`uploadCloudAsset`，图操作走云端命令 | `WorkspaceClient`+graph修订+`commands.ts/video-repository.ts` | 尾帧：选云端视频→抽帧预览→上传→一次保存帧/正文/草稿/关系；修改：冻结快照复制改后存新草稿，原保留；A/B近似同步；缺素材明示；仅建草稿时生成POST=0 | 旧链路仍在，云端详情无入口；旧服务读IndexedDB需改接 | 阶段6 | 待实现/待验证 |
| 11 | 视频任务中心 | 旧`TasksPage`分类 | `CloudTasksPage`只呈video，成功给预览/操作；`CloudPromptsPage`承接正文/草稿/AI历史；Agent回项目会话 | `listTasks`过滤+prompt库/draft接口 | 视频中心无文字/Agent混入；文字历史可查；只调展示归属不删账务 | `CloudTasksPage.tsx:13` 未过滤三种任务；`CloudPromptsPage.tsx:22` 只读库 | 阶段5 | 待实现/待验证 |
| 12 | 其他旧功能 | 见§2 | 逐项接回，无接口先补服务再开放；按钮有行为/禁用原因/移除 | 各云端服务接口 | 对照清单无未说明缺口；未开放上游能力明确标注 | §2 | 阶段0/4-7 | 待实现/待验证 |
| 13 | 缺少提示词无法生成 | 旧拖线+侧栏连接 | 统一“生成视频”入口；`inspectVideoTextInputs`按实际指向读取；`CloudVideoInputEditor`补正文/连线；保存成功取revision后预检；确认单列多目标缺失；失败留输入；“预览”不作主文案 | `client.command/videoPreview/confirmVideo`，`cloud-video-run.ts/preflight.ts` | 空项目纯界面加正文/草稿/连线再生成；多文字/多目标/共享替换不污染他草稿；保存 fail 不提交；预检/取消上游POST=0；单确认单任务；3003原因刷新仍对 | `CloudVideoRunPanel.tsx:20-25` 预览+确认；`CloudApplyPromptDialog.tsx` 只写文字不建边；`CloudCanvasPage.tsx:55` 侧栏按钮连接；`preflight.ts:35` prompt_empty | 阶段1 | 待实现/待验证 |

## 2. 旧功能逐项（报告12细化，无空路由）

- 全局搜索/命令面板/顶部连接状态/通知/帮助：旧 `LegacyApp:77-87`（IndexedDB搜索、命令面板、ConnectionLights/Status、通知/帮助）→ 云端账号范围重接，无云端接口先补服务。阶段7。
- Activity/Recovery：旧 `ActivityPage/RecoveryCenter` → 云端操作记录/失败保存重试/项目包恢复，按资源归属，不读匿名库。阶段7。
- 项目包导入导出：`cloud-project-package.ts`+`PackagePage` → 验证旧流程，缺口修补。阶段7。
- Agent提案/应用：`CloudAgentPanel` → 验证旧提案/应用/撤销流程。阶段7。
- 项目/素材回收站及历史：`CloudProjectsPage/CloudAssetsPage/CloudPromptsPage trashed` → 验证旧流程。阶段7。
- 画布操作：框选/多选拖动/快捷键/节点尺寸/外部拖入粘贴/复制为分支/对齐等间距/分组序号/布局预览/大纲可收起 → `CloudCanvasSurface`+复用`selection.ts/branch-command.ts/group-layout.ts/NodeResizeHandles/NodeOutline/NodeMenu`。阶段4。
- 提示词：中央编辑/镜头草案/改动说明/复制/保存到库/JSON导出/仅建流程/画布源节点侧栏/源视频参数对照 → 阶段5。
- 视频结果：审片页/比较页/下载/选择历史结果供后续/撤销选择 → 阶段6。
- 每个可见按钮有有效行为/禁用原因/移除；旧匿名入口测试迁移为等价云端用例并说明对应。

## 3. Review Focus 对应

1. 多文字+多草稿绑定目标：阶段1多目标场景。
2. 保存预览交错/超时重试/连点：阶段1（先保存后预览，单幂等键单任务）。
3. 草稿更改/切账号/迟到响应/模型分页：阶段2（结果绑账号通道地址版本）。
4. 旧界面夹带旧库访问：阶段4-7（读写归当前云端账号，刷新/换设备恢复）。
5. 续写截图上传/建节点/保存提示词部分失败：阶段5-6（保留原果+可恢复输入，不重复建，不污染他号）。

## 4. 本轮证据要求

- 实现、自动检查、真实点击、真实生成、严格HTTPS、线上复测分别留证据；未过项标未完成。
- 阶段1-7只跑所属文件定向检查；阶段8才全回归。纯文案/样式不补镜像单元测试。
- 新增交互场景必须进 `playwright.account-api-ui.config.ts` testMatch。
- 真实收费提交用用户所选输入/模型+费用确认；本轮定方案不触发，不重跑已过付费生成。
- 发布包禁旧资料/演示/测试账号素材/密钥/数据库；发布前备份生产库/媒体/配置；用户后来内容不得清空。

## 5. 阶段1验收（审计后，截至本记录）
基线：HEAD `81576d82e6a506e6c661934ef71828cba894606e`，分支`feat/account-api-cloud`；以下文件未提交（`git status --short`）：
`M CloudApplyPromptDialog.tsx/CloudCanvasPage.tsx/CloudPromptGeneratorPage.tsx/CloudVideoRunPanel.tsx`，
`M cloud-video.spec.ts/cloud-prompt-apply.spec.ts`，
`?? cloud-video-input.ts/CloudVideoInputEditor.tsx/cloud-video-input.test.ts/ACCOUNT_CLOUD_FEATURE_ACCEPTANCE_20261009.md`。
`playwright.account-api-ui.config.ts`未改（新增用例沿用已在testMatch的`cloud-video.spec.ts/cloud-prompt-apply.spec.ts`）。

审计处理：
1. 生产基线：本文件§0已修正。`f98fe3e`为首次空内容发布，`aebd1f5`六位密码修复已按`RELEASE_PREPARATION:40-42`上线（`git show 81576d8`为记录提交，快照`20261009T033634Z-9b67febc...`）。本轮现场只读核验，未做生产SSH/库/卷重验。
2. Flow规格：`buildOperations()`删除“复制首个视频草稿→取`cap.videoSpecs[0]`→猜`seedance/5秒/16:9`”链路。新增`resolveFlowSpec()`（`cloud-video-input.ts`）：wanted=`requested ?? suggested`逐字段；无capability一律`capability_unavailable`并显示重试，不猜默认；无匹配/多分辨率一律`need_selection`并列出options；已选与请求不一致时返回warning但按所选创建、原请求保留。对话框flow分支展示写作请求/建议、能力状态、规格下拉与原因文案；能力失败显示重试，确认在非ready时禁用。定向单元覆盖：请求15秒/9:16在双规格目录中精确命中；请求超出单规格目录时`need_selection`且原因含15；无capability时`capability_unavailable`。E2E新增：未指定请求时须明确选择才可确认；15秒/9:16请求在仅5秒/16:9目录下先禁确认并显示不支持原因，用户显选5秒后出现不一致提示并按所选创建。
3. 失败保留与保存门槛：`CloudCanvasPage`保留void `stage`供旧调用，新增boolean `tryStage`并以`stage={tryStage}`传入`CloudVideoRunPanel`→`CloudVideoInputEditor`；编辑器仅在返回true时清空选择/正文，失败保留。`prepare()`未保存时直接报错（按钮亦禁用）；保存后先`readWorkspace`核对`fresh.graph.revision===graph.revision`，不一致则报错返回，不调`videoPreview`；本地缺正文先列出缺失标题并返回，上游POST为0。E2E新增：纯界面建正文/草稿/连线再生成；缺正文定位+就地补接；双视频多目标仅列出缺失的“视频二”且零任务；未保存编辑下生成禁用且零上游POST。连续确认幂等：前端`busy`守卫+服务端`consumed_runs`同一`approvalId`返回同一任务（`video-tasks.test.ts`“returns the same confirmed run…”15项中覆盖），UI纯界面用例断言确认后对话框关闭且仅建一份任务。

实际定向检查（基线目录执行）：
- `npm.cmd run typecheck` → exit 0（前后端各一次均通过；含新增E2E编译）。
- `Set-Location server; npm.cmd run typecheck` → exit 0。
- `npm.cmd run test:unit -- tests/unit/cloud-video-input.test.ts tests/unit/cloud-canvas-model.test.ts` → 2文件15项通过，exit 0。
- `Set-Location server; npm.cmd test -- tests/video-tasks.test.ts tests/api-probe.test.ts tests/api-settings.test.ts tests/prompts.test.ts` → 4文件59项通过（video-tasks 15含3003/未知/幂等/过期租约），exit 0。
- `npm.cmd run lint` → exit 0（中途发现自加的`eslint-disable-line react-hooks/exhaustive-deps`因本仓无此规则报错，已删除该注释后通过）。
- `npm.cmd run build` → exit 0（175模块；`dist/`为忽略目录，工作树无新增污染）。

Codex独立浏览器核验（`E:/trae-studio/tools/node-v22.23.3-win-x64/node.exe scripts/run-account-api-ui-tests.mjs cloud-video.spec.ts cloud-prompt-apply.spec.ts`，输出`C:/Users/StarLink/Documents/ChatGPT/traework/.codex/dsh-supervision/e2e-20261009-1225`，在制工作树非固定提交）：7 passed / 4 failed，4项均为用例写法问题、产品逻辑符合预期：
1. 两个创建流程用例（原行62/83）未先给隔离账号PATCH假视频通道（`https://video.example.test`/`seedance`/假Key），对话框显示“请先在API设置保存对应通道的模型配置”，未走到规格分支。已补假配置并实际走到断言（无真实密钥）。
2. 缺正文/多目标用例（原行49/69）的`getByRole('alert')`同时命中就地提示与汇总提示致strict violation。已改用`getByText('以下视频草稿缺少明确连接的提示词正文')`精确定位，多目标隔离与补接后预检断言保留。
我方修复后重跑（同命令，`--output=work/account-api-cloud/stage1-ui-rerun3`，在制工作树）：14 passed / 0 failed，exit 0。期间一次中间态13/14（新增重试用例断言的append radio在零输入视频下不渲染）已修正：给该视频预置已有文字输入，断言冻结+重试追加后“原文字保留、文本节点2、连线2”。

P2追加/重试语义（Codex已确认代码修正）：
- `CloudApplyPromptDialog`追加/替换radio补`disabled={busy||!!frozen.current}`，与其他目标控件一致；失败重试提示“重试沿用同一请求；若服务端已保存，重试只取回原结果，不重复创建”。
- 服务端定向证据：`server/tests/workspace-commands.test.ts`新增“丢失响应的文字+连线批量同key重试只应用一次、新key+旧revision判409”（12/12通过，exit 0）；既有“同key重放/异内容409”一并通过。
- 对话框端到端证据（以独立审计版为准，已迁回）：旧`route.abort()`版只证明“首次请求未达后端”，不能证明“后端已保存后回执丢失”，已替换为“首次请求直达真实隔离后端并已应用（修订到2）→仅浏览器回执丢失→同payload/key重试→修订仍为2、节点连线不重复”（`cloud-prompt-apply`“replays the identical committed apply request…”）。同approval并发`workspace.call`只证明服务端幂等，不等同浏览器双击；真实双击由“延迟首次请求下双击确认生成→按钮禁用、请求1次、任务1份、假上游POST1次”专测覆盖（`cloud-video`“double clicking confirm…”）。独立审计在`d26d46a`固定副本通过15+1项（日志`e2e-d26d46a-independent.log`/`e2e-d26d46a-double-click.log`，用例源在审计副本`codex-stage1-response-loss.audit.spec.ts`/`codex-stage1-confirm.audit.spec.ts`）；两场景已迁回testMatch内spec并在dev验证2/2通过（`work/account-api-cloud/stage1-migrated`）。以上均系隔离假上游/本地库，不证明真实生成或HTTPS/线上通过。
- 诚实性修正：单元“failed stage”用例改名为“云端保存冲突时保留已暂存操作并要求显式放弃后重载”（其本体即model层冲突保留）；纯界面用例注释去除“连续点击”字样，重复确认改由“同一approval并发确认只建一份任务”专测覆盖；未运行用例不计入验收。

仍未完成（不计入本轮通过）：真实上游生成成功单独验收；严格HTTPS/线上复测未动。浏览器全量14/14（`stage1-ui-rerun3`）对应迁移前在制工作树；迁移后两文件共15项，其中新增2项单独验证2/2通过（`stage1-migrated`）；迁移用例与本记录更新已随阶段1提交`6b30aed`落定，独立审计15+1证据见上。

## 6. 阶段2验收（API状态和完整模型选择）
实现（相对`6b30aed`）：
- 新增`src/features/settings/ModelPicker.tsx`：可展开/搜索/完整滚动/手填的组合框+列表框（`{value,models,disabled,onChange}`，调用方负责加载与错误，选择器内不保存密钥）；空目录显示手填提示，无匹配时保留手填值；键盘上下/回车/ESC可用；目标≥44px。
- `ApiModelFields.tsx`：视频/文字共用选择器（保留原字段顺序与`模型名称`标签关联）；连接结果与保存结果分别显示两行，保存不再遮盖状态；成功显示“连接成功 · 已获取 N 个模型 · 测试时间”，空目录显示可手填，401/403类失败显示权限或密钥错误，目录不支持且无他证显示“连接状态未确认”；目录外手填值给出“按手填保存、生成前重核”提示；`data-field="model"`保留。
- `use-api-settings.ts`：`ApiDraft`增`testedAt/testedBase`；仅改模型名不清空目录结果，改地址/密钥清空；保存成功后无匹配有效检测则自动只读检测（不覆盖保存提示），重进（fresh load）对有钥无匹配通道各自动检测一次（去重、不带密钥明文、不调用生成）；`autoProbe`选项默认开，单测隔离用关。
- `api-settings-client.ts`：`ModelProbe.complete?: boolean`（兼容旧形状）。
- `server/src/security/outbound.ts`：视频`healthz`永不单独决定成败（404/405/501/异常/非JSON一律继续读目录，仍先请求healthz）；新增`modelsNext`（仅跟随同源下一页，跨域不发密钥返回null，出站校验同首页）。
- `server/src/settings/probe.ts`：首页404/405/501→unknown/unavailable，401/403→failed（权限拒绝文案），分页`next`同源跟随（≤10页、去重、20000上限、`has_more`无`next`记未完整），`complete`贯穿返回；密钥回显保护保留。
- 单测：`account-api-settings` 24项（含成功时间戳/地址绑定、四态保持、仅改模型保留、保存后自动只读检测、重进自动检测、无匹配有效检测抑制）；`api-probe` 30项（healthz四码回退、权限拒绝、合并分页、跨域/坏页/悬空/自环记未完整）。

定向检查：
- 前后端`typecheck` exit 0；`lint` exit 0（中途1处用例未用变量已删）；`build` exit 0（176模块）。
- `test:unit account-api-settings` 24/24 exit 0；`server api-probe` 30/30 exit 0。
- 浏览器`account-api-settings.spec.ts` 15/15通过（`stage2-ui3`全量14/15后单修一行再验`stage2-ui4` 1/1；失败均为用例写法：旧`option`/`status`定位、自动检测门闩时序、手填过滤遮挡，均已修正，产品逻辑无改）。fixture全局断言生成调用为0保持。
- 真实供应商目录协议只读核对：本轮无用户密钥可用，未发起任何真实探测/生成；分页按同源`next`通用适配，实际供应商格式待有钥后在阶段8前补核（记为未完成，不冒充已验证）。

提交：阶段2文件已随`1050fda`落定（11文件，仅阶段2边界），后续F006-F009修正另见下节。

## 6b. 阶段2后续修正（独立审计F006-F009，已定向验证）

- F006 healthz超时毒化：`models()`曾让healthz与目录共用15秒signal，healthz挂起超时后目录请求已aborted。现healthz改为后台best-effort（独立signal，不等待、不设门），目录请求独立15秒；中途另发现串行等待会把目录超时推到30秒，一并消除。证据：`outbound.test.ts`旧共享断言改写+新增探针级“healthz永挂而目录200→verified”（`calls`两signal独立且目录未aborted）。
- F007相对下一页基准：`modelsNext(base,next)`曾按API根解析`?page=2`致404丢页。现签名改为`modelsNext(pageUrl,next)`并返回`{response,url}`，`probe`以`modelsUrl(base)`起算逐页跟踪当前URL；同源/出站/循环/上限校验保留。证据：新增“`?page=2`按`/gateway/v1/models`解析合并First+Second/complete=true”。
- F008选择与搜索混淆：`ModelPicker`曾把持久value当query，已保存A+目录A/B/C时展开仅见A。现搜索态与已选值分离（聚焦/编辑才显示搜索，展开按钮重置搜索），展开全部必达完整目录，手填与已选保留。证据：迁移审计UI用例“展开A选中下仍见A/B/C且选中不动”。
- F009 503误报密钥错误：`probe`增可选`failure:'denied'|'unavailable'`（401/403→denied，其余失败→unavailable；前后端schema同步，mock旧形状兼容），`connectionLine`仅denied提示权限/密钥错误，其余显示服务暂不可用且不含该短语。证据：迁移审计UI用例“假503路由真实probeModels→不断言权限错误”；服务端`failure`标签断言同步。
- 定向检查：服务端`typecheck` exit 0；`outbound/api-probe/workspace-commands/video-tasks` 104/104 exit 0；前端`typecheck/lint` exit 0；单测30/30；浏览器F008/F009两场景2/2（`stage2-fixes`）；`account-api-settings`全量17/17（`stage2-ui5`）。
- 真实供应商协议仍无钥未验（记为未完成，不冒充）。

## 7. 阶段3验收（工作台全宽、画布全屏和入口整理）

实现（相对`1050fda`）：
- `AuthBoundary.tsx`：删除使用引导导航与重复表单；旧`/welcome`重定向到`/settings/connections`；首次登录进入项目页；历史`lastVisitedPage`经白名单清洗（未知/`/welcome`/空一律回项目页，避免跳转循环）；导航可收起（`nav-collapsed`）。登录/注册表单保持460px阅读宽。
- `tokens.css`：外壳去1100px、内容区去760px，全宽flex纵列；画布路由限定`height:100dvh`高度链（`account-shell:has(.cloud-canvas-page)`），其余页面保持自然流；`.canvas-main`双栏（画布+360px侧栏）可收起，大纲/侧栏收起后画布扩展；显式`grid-template-rows:minmax(0,1fr)`逐层约束，侧栏内部滚动；小屏（≤900px）堆叠。
- `CloudCanvasPage.tsx`：视频操作与Agent移入可收起右侧栏（`side-toggle`，常挂载仅隐藏，保留未保存正文/上下文/重试身份）；大纲可收起（`outline-toggle`）；其余节点操作条、工具栏、小地图保留。
- 用例迁移（合法入口替换）：`account-api-settings`内`/welcome`→设置页直达、`使用引导`→项目往返、`进入工作台`→首次登录直达项目/旧链接重定向三测；`account-auth`注册落地与tab页改为项目页；`account-welcome-assertions`改断言设置入口，`account-welcome-integration`改断言重定向+遗产数据保留+首登项目。旧匿名welcome单测不受影响（LegacyApp未动）。

定向检查：
- 前端`typecheck/lint` exit 0；全量单测93文件683项 exit 0。
- 云套件全量53/53（`stage23-full`；含`cloud-controls`新布局3测与审计迁入2测，截图与尺寸附件留存）。
- `account-api-settings` 17/17、`cloud-controls` 8/8、集成配置（含欢迎集成）18/18。
- 审计迁入：布局上限（1366x768/1920x1080 bottom≤视窗+4且>视窗-64，生成入口在视窗内）与侧栏输入保留（视频正文+Agent描述收起展开不丢）均通过；我方旧弱断言（bottom>height-120无上限）已加上限。
- F010：侧栏常挂载隐藏，收起保留正文/上下文/重试身份（上文迁入用例覆盖）。
- F011：高度链固定后1366x768底边由1287回到视窗内；断言改为上下限双向。
- 路由竞态根治：`cloud-video`全量中曾现单素材GET被基座guard误判404（1/60级偶发）；基座未知路径在云用例下`passthrough`放行给真实进程内应用（设置套件仍严格记录），双guard任意顺序确定。
- 未完成：`account-auth` TLS套件（4180）因已知证书交互阻塞未跑（见`ACCOUNT_TLS_BLOCKED_CHECKPOINT`），迁移断言仅过类型检查，归阶段8严格HTTPS；真实上游/线上复测未动。
