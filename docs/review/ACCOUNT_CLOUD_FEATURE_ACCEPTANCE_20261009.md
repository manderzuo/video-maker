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

## 8. 阶段4验收（画布端口、素材选择和编辑操作）

实现（相对`10dfe79`）：
- 新增`CloudCanvasSurface.tsx`：画布渲染与交互层。旧直线SVG改为`CanvasEdges`贝塞尔曲线+`ConnectionPreview`实时预览+`ConnectionMenu`右键断开；`NodePorts`左右端口（文本输出/文本·图片·视频输入、结果输出、关系来源）带兼容高亮；点击/键盘等价连接（输出回车开始+输入点按完成），类型错配与重复连接给出明确错误且不建线；`onCommand`仅保存成功返回成功，失败保留待保存操作（沿用`cloud-canvas-model`幂等与冲突语义）。
- 能力：`videoCapability`服务端透出`policy.limits`，`cloudVideoCapabilitySchema`同步扩展可选`limits`；画布由当前账号视频能力+文字模型目录组装`CapabilityProfile`（模型取已核验规格去重，不过编默认值），`validateConnection`缺上限时不拦截、服务端预检为最终依据；任务中心视频任务映射`ResultSourceRun`供结果来源校验。
- 新增`CloudAssetPicker.tsx`：添加节点弹窗内“云端素材”（`CloudAssetMedia`缩略图+类型字节+选择）与“上传素材”（进度/失败占位/重试，失败不建假节点）双入口；上传入库后刷新列表再选。
- 编辑操作：框选（shift合并）+多选拖动（组内成员除外）+Delete/Backspace删线删节点+Ctrl+A/C/V/D/Z/Y+`V`/`H`+Esc（输入法与弹窗优先）；`NodeResizeHandles`尺寸（仅已保存可调，`update_node.size`服务端已支持，刷新恢复）；外部文件拖入/粘贴上传建节点、纯文本粘贴建文字节点；对齐/等间距（`alignNodes`+阈值提示）/`ArrangePreview`布局预览/复制为分支（`branchSpec`+云端规格）/分组镜头序号（组头数字项直存）。
- 有限复用说明：`NodeOutline`未整体替换（现有大纲交互ID被阶段1用例依赖，搜索/排序不在本阶段验收内）；`NodeMenu`未整体复用（其删除影响评估/本地租约历史/`select_result`与云端命令语义不兼容），改为复用其下纯模块（`branch-command/selection/group-layout`）与`ArrangePreview`组件；`CanvasToolbar`继续复用。
- `testMatch`新增`cloud-canvas-interactions.spec.ts`（端口连接+错配、选择器缩略图与上传入库、锁定端口禁用+撤销重做+保存冲突保留、框选对齐+布局预览、分支+键盘尺寸+刷新恢复；失败2项均为用例写法：端口旧名“文字”实为“文本”、撤销计数与修订号，已修正）。
- 路由竞态根治（全量偶发1/60，已随`10dfe79`落定，见§7）：基座未知路径在云用例下放行，本阶段全量61/61无复发。

定向检查：
- 前后端`typecheck/lint` exit 0；全量单测93文件683项 exit 0；`build` exit 0（247KB主包）。
- 服务端`video-tasks/workspace-commands` 27/27 exit 0（能力扩展无回归）。
- 浏览器`cloud-canvas-interactions` 5/5；云全量61/61（`stage4-full`，含此前偶发项复核通过）；生成调用0（各用例断言+全局守卫）。

## 9. 阶段4后续修正F013（多选拖动保留整组选择）

问题（审计F013，已在固定提交上独立复现路径）：多选后拖动其中一个节点，第一次暗中取消其余选择、第二次只移动一个。

修复（`bb761a2`）：
- `CloudCanvasSurface.tsx`的`pointerStart`：点已选节点保留整组（`moveIds=selected`），拖动`gesture.ids=moveIds`；shift点已选节点取消该选择且不武装拖动；点未选节点仍单选取代。
- 用例迁回`cloud-canvas-interactions.spec.ts`：`:106`素材预留503后保留文件并可重试、失败不建假节点；`:120`多选后连续两次拖动，逐轮断言DB坐标偏移与`.canvas-node.selected`数量，并断言刷新后偏移持久化。

定向检查：
- 反向验证：临时`git checkout --`还原修复后`-g "preserves the whole multi-selection"`必失败（1 failed：选择数期望2实得1、第二次位移只生效一半）；从`work/account-api-cloud/f013-backup`恢复后7/7通过；`bb761a2`已提交。
- 前后端`typecheck/lint` exit 0。

## 10. 阶段5验收（提示词中央结果、规格预设和内容归属）

实现（相对`bb761a2`）：
- `src/features/prompt-generation/PromptForm.tsx`：写作规格固定为时长5、6、7…15秒整数与画幅16:9、9:16、1:1、4:3、3:4（对应Global Constraints第7条）；旧草稿超出预设的原值以“原值 X · 超出预设，请明确修改”选项原样呈现，并显示`PG10:out-of-preset`/`ui:PromptForm:input:a944108bfffb:out-of-preset`明确提示，不静默改写；未指定仍是可选状态。
- `src/features/workspace/CloudPromptGeneratorPage.tsx`：恢复左输入、中结果、可收起右检查三栏（`.cloud-prompt-workspace`）。中部正文可直接编辑，“保存为新的人工结果”生成明确`manual`版本且不改写AI/规则原结果；新增镜头草案、改动说明、警告、复制正文、保存到库、JSON导出、源参数对照（取`selected.sourceRevision`的不可变快照经`client.draftRevision`读取）。
- 来源一致性（审计F016）：人工正文未保存时导出与存库禁用并给出原因；导出字段`finalPrompt`/`resultVersionId`/`origin`/`sourceRevision`与持久化版本一致，`source`取自该版本快照而非当前草稿；快照读取中或失败时明确提示，不用当前草稿或上一版本冒充。
- 指定草稿（审计F015）：`?draft=<id>`按明确ID选择；目标不存在或不属于当前账号时明确提示且不静默改用列表首项；迟到的初始草稿加载不再覆盖用户已选草稿（`touched`）。
- 人工正文保护（审计F014）：`manualDirty`纳入规则整理、切换草稿、回收站/重新加载、应用、恢复、存库与导出；迟到AI结果不再覆盖正文，改为刷新修订，用户保存或明确放弃后才切换；被拒的草稿切换通过重挂载复位选择，避免控件显示与实际状态不一致。
- `src/features/workspace/CloudTasksPage.tsx`：任务中心只呈现video任务（Agent与文字任务的原数据、结果版本与账务记录保留），成功视频在列表内展示当前账号的云端结果媒体（缩略图/播放），并注明Agent记录在项目会话、文字任务在提示词库写作记录中查看。
- `src/features/workspace/CloudPromptsPage.tsx`：新增“已保存提示词/写作记录”入口；写作记录列出原草稿、修订、结果数与文字任务状态，可打开原草稿或只读查看结果正文；草稿已不可达的任务保留只读记录，不隐藏。
- `src/domain/prompt.ts`：`promptLibrarySchema`新增可选`draftId`/`resultVersionId`，保存到库保留草稿与结果版本来源。

定向检查（命令、统计与真实进程退出码分开记录）：
- `npm run typecheck` exit 0；`npm run lint` exit 0。
- `npm run test:unit` exit 0：93文件683项通过（日志`work/account-api-cloud/stage5-unit.log`）。
- 服务端`npm test -- tests/prompts.test.ts tests/prompt-tasks.test.ts tests/video-tasks.test.ts tests/workspace-commands.test.ts` exit 0：4文件43项通过（`work/account-api-cloud/stage5-server.log`）。
- 浏览器`node scripts/run-account-api-ui-tests.mjs` exit 0：68 passed（`work/account-api-cloud/stage5-browser.log`，2.8分钟，未截断）。此前用`Select-String`管道读取会把node的stderr变成NativeCommandError并让外层报exit 1，本节改用`*>`写入完整日志并用`$LASTEXITCODE`记录真实退出码；统计数字与实际退出码在此分列。
- 审计F014反向验证：用`work/account-api-cloud/stage5/negative-patch.mjs`临时移除`manualDirty`守卫与禁用（备份`negative-backup.tsx`）后，两条F014用例失败（`f014-negative`：“规则整理”期望disabled实为enabled）；从备份恢复后5/5通过（`f014-restored`）。
- 新增/迁移浏览器用例：`cloud-prompts.spec.ts:26`超预设旧值显式保留并要求明确选择；`:40`写作记录按ID打开非首项草稿、刷新一致、不存在ID明确提示；`:56`保存/导出与持久化版本的正文、版本ID、origin、source、sourceRevision一致（含改草稿输入后导出旧结果仍用旧快照）；`cloud-prompt-optimize.spec.ts:13`迟到AI结果不覆盖人工正文、保存后才切换；`:29`规则整理/切换草稿/应用在人工正文未保存时被阻断且原AI版本不变；`cloud-prompt-apply.spec.ts:3`改用中部可编辑正文与版本选择后应用历史版本。
- 未完成/未验：旧匿名提示词套件（`prompt-field-contracts`、`prompt-validation-races`、`prompt-workspace`、`missing-entry-contracts`）在本分支不可达——实测`prompt-field-contracts.spec.ts` 6 failed，页面为账号外壳“无法确认登录状态”，与本次改动无关；因此未改其`spinbutton`/`textbox`引用。旧入口按阶段7/8接回后需迁移：`prompt-field-contracts.spec.ts:6`与`:17`、`missing-entry-contracts.spec.ts:24-25`、`prompt-workspace.spec.ts:18`改`selectOption`；`prompt-validation-races.spec.ts:15-25`需改为种子化超预设草稿后断言原值保留与明确提示。
- 未验：真实供应商目录协议、真实付费生成、严格HTTPS与线上核验（阶段8）。

## 11. 阶段6验收（视频结果、续写、修改和比较接入云端）

实现（相对`e05bf7e`）：
- 新增`src/features/workspace/cloud-result-actions.ts`：与旧本地读写拆开的纯命令构建层——结果放置/复用/解除关联/移除、冻结输入快照复制为修改草稿（含`revisionSource`与引用边）、尾帧续写批次（原视频→帧素材`tail-frame`关系→续写正文→新草稿）、来源可用性判定；`resultLink`只按冻结的 producing draft 识别结果，不用布局或时间推断。
- 新增`src/features/workspace/CloudResultsPage.tsx`（路由`/projects/:id/results`）与`CloudComparePage.tsx`（路由`/projects/:id/compare?runs=a,b`，`AuthBoundary`放行该项目子路由）：直接播放/下载、审片（复用`CloudVideoTaskDetail`）、选择历史结果进画布及撤销选择、尾帧续写（浏览器抽帧→上传云端素材→一次命令批次建帧节点/正文/草稿/关系）、修改后重新生成（从冻结快照复制正文/规格/可读引用，原视频与快照保留）、A/B 近似同步比较（同步播放/暂停、交换、回到起点，声明非帧级同步）；两侧版本只取当前账号云端结果；素材缺失明确提示，不自动替换。
- 真实入口（审计F020）：`CloudVideoTaskDetail`成功结果旁新增“打开视频结果页”（带 project/run 定位）、`CloudVideoRunPanel`画布侧栏新增结果页入口、`CloudTasksPage`每行新增“打开视频结果”入口；结果页对`?runId=`给出可见定位标记。不再需要手输地址。
- 冻结请求（审计F017）：首次发送前冻结 key/operations/baseRevision；提交结果未知时保留冻结请求并禁用相关输入，重试发送完全相同的请求体（服务端按幂等键 replay，不重复创建）；提交成功但刷新失败与发送失败明确区分，前者可“重新读取结果确认”。
- 完整素材集（审计F018）：修改草稿的引用可读性用全账号素材集合加存储文件双重校验；可读引用保留建边，不可读只明确提示并跳过，原 snapshot 不变。
- 上传后读取失败（审计F019）：尾帧上传成功后立即保留素材 ID，读素材/构建批次纳入异常处理并回到可编辑可重试状态；未发送命令不报未知提交；同一素材重试不重新上传。
- 测试基座：新增`tests/fixtures/cloud-result-clip.mp4`（64×64 H264 真实可解码片段）作为假上游结果字节，使抽帧/播放走真实解码；`setVideoReferenceSupport`/`videoReferenceSupport`测试缝允许单个用例打开图片引用与素材上传（用后恢复，默认仍为 0/关闭）。

定向检查（命令、统计与真实进程退出码分开记录）：
- `npm run typecheck` exit 0；`npm run lint` exit 0。
- `npm run test:unit` exit 0：94文件688项通过（含新增`tests/unit/cloud-result-actions.test.ts` 5项：各命令批次先经`executeGraphOperations`再过`graphSchema`与`validateConnection`，含`tail-frame`/`revision`关系）。
- `node scripts/run-account-api-ui-tests.mjs tests/e2e/cloud-result-actions.spec.ts` exit 0：6/6通过——播放/下载/选择/撤销（含刷新后仍能撤销）；尾帧丢失响应后重试（两次命令 POST body 逐字节相同，receipts 与 assets 各只 +1）；上传后读失败恢复（同一素材、命令 0→1、无重复节点）；可读引用保留建边、缺失引用明确跳过、提交成功刷新失败可确认；A/B 比较/未知版本/跨账号隔离/文件缺失不替换；画布与任务中心点击进入结果页并带 run 定位。
- 浏览器云全量 exit 0：74 passed（`work/account-api-cloud/stage6-final.log`，未截断）。中途一次全量为 72/73：`cloud-prompt-optimize.spec.ts:29` 因草稿列表顺序不确定，首选草稿的`selectOption`偶发为空操作导致后续断言错位；已把“当前即为第一份草稿”（选择值与`原始创意`）固定为用例前提，复跑 11/11 与全量 74/74。
- 未验：真实供应商目录协议、真实付费生成、严格HTTPS与线上核验（阶段8）。

## 11b. 阶段6后续修正F021-F022（隔离复验定向验证）

- 审计F021（复用撤销）：`CloudResultsPage.undo`原校验只接受`type==='result'`且`runId`匹配的节点，与`placedNode`/`resultPlacement`明确允许的asset复用矛盾，导致复用后撤销只清本地记录、服务端`result`边残留。现校验接受同一素材的`result`/`asset`两类节点；只有本次新建的`result`节点才允许移除，其他情况一律只解除关联，原节点与文件保留；关联已不在时明确提示且不发空命令。
- 审计F022（未知提交恢复）：续写/修改的冻结请求原只存在弹窗state，取消/关闭/刷新即丢失，重开会用新key重复创建。现`unknown`/`submitted`未确认请求以原key/baseRevision/operations/nodeIds连同输入（正文/时间/帧素材/跳过项/可用性）持久化到本标签页存储（按账号拥有的项目/记录UUID键控，不接匿名库）；重开同记录对话框恢复原请求（续写后台重下帧文件恢复预览，重试不依赖本地文件）；页面横幅提示未确认数量；`放弃未确认请求`为显式动作，文案明确不取消服务端提交；记录消失的条目在读取时清理。
- 定向检查：`typecheck`/`lint` exit 0；`test:unit` 95文件694项 exit 0（含新增复用unlink纯构建用例）；`cloud-result-actions.spec.ts`新增3条——复用asset撤销（边1→0、原节点保留且`generationLinked:false`）、revision/tail-frame未知提交经取消+刷新后同一key重试（两次POST body逐字节相同、receipts只+1）；云全量77 passed exit 0（`work/account-api-cloud/stage6-fix-final.log`，未截断）。

## 12. 阶段7验收（其余旧功能逐项接回）

实现：
- 账号外壳（`AuthBoundary`+新增`CloudShellChrome`）：全局搜索（300ms防抖，查当前账号项目标题/简介、全部非回收站项目节点标题、提示词库标题/正文/标签，上限20条，分别进画布/`canvas?node=`/预填过滤的提示词库；加载中/失败/空态明确，可清除）、命令面板（账号目的地＋当前项目画布/结果/比较，`Ctrl/Cmd+K`打开，输入框内不劫持）、顶部连接状态（`modelConfigs`读文字/视频配置有无，进详情看地址模型与密钥保存态）、通知（打开时读任务，用`cloud-attention.ts`纯函数挑失败/未知提交/待处理issue，逐条进任务中心/写作记录/恢复中心）。
- 画布`?node=`定位（`CloudCanvasPage`挂载后选中并适配该节点，无参数时行为不变）、提示词库`?q=`预填过滤。
- 操作记录（审计口径补服务接口）：服务端新增只读`GET /studio-api/projects/:id/receipts`（验归属，`limit` 1..100默认20，倒序），`CloudActivityPage`（`/activity`）聚合各项目最近回执（上限50）并进画布。
- 恢复中心（`CloudRecoveryPage`，`/recovery`）：同`attentionItems`聚合未知提交/失败/待处理issue并进对应处理页，另给项目包恢复与旧版迁移入口；画布未保存修改仍在画布页内重试/放弃（`cloud-canvas-model`已有保存机）。
- 帮助（`CloudHelpPage`，`/help`）：云端口径重写（账号隔离、修订冲突、未知提交、费用、受控能力），复用静态第三方许可文本；旧本地存储口径（浏览器存整库、`已保存`=本地事务等）不再出现。
- 逐项验证（旧流程→云端覆盖→用例）：项目包导出/导入→`CloudProjectsPage`导入导出（`cloud-workspace.spec.ts:27`）；Agent提案/应用/撤销→`CloudAgentPanel`（`cloud-agent.spec.ts`两条）；项目/素材/提示词回收站与恢复→三页trashed态（`cloud-controls.spec.ts:19`、`cloud-prompts.spec.ts:7`、`cloud-workspace.spec.ts`系列）；提示词写作记录/历史→`cloud-prompts.spec.ts:40`等；任务中心→`cloud-video.spec.ts:13`等；旧版迁移→`legacy-user-import.spec.ts`。
- 未开放并明确标注（不计入完成）：旧离线包格式显式迁移开关（`PackagePage`遗留逻辑，只读用户自选文件那套未接回；云端包与旧版迁移两条路已覆盖导入）；本地诊断导出/活动（无云端接口，诊断由服务端任务记录承载）；Agent待决策的跨项目聚合（只在项目内会话处理）；全局搜索不含回收站与已删除内容。
- 上述三项逐项定性（范围待验转明确结论）：①旧离线包显式迁移开关→**原“等价恢复”结论有误，更正为实际缺口并已修复**：旧`PackagePage.inspectImport(file,{legacy:true})`经`migrateLegacyPackage`可读infinite-canvas v3 `projects.json`（`project-package.test.ts:48` T36为证），而云端两入口（`inspectCloudProject`只认`project.json`+`aiwork-studio-cloud-project`、`inspectWorkspaceMigration`只认`workspace.json`）都不读该格式。现`inspectCloudProject`在用户明确选文件后自动识别旧包：纯内存经`migrateLegacyPackage`转换（不碰匿名库），仅保留云端已知类型节点（不支持的旧节点隔离计数后丢弃，旧配置/会话/无类型连线不导入），媒体按转换后manifest旧路径读取字节并经hash/MIME校验后写入云端original路径；预览明确标注旧包身份与隔离数，确认后走现有账号导入链（新ID、历史标记、去授权），原包只读不写。②本地诊断导出→**已实现**：`CloudActivityPage`新增“导出脱敏诊断”，纯客户端组装已有只读接口（项目/回执/任务/配置presence）的白名单子集，提示词全文、提交原文、密钥、媒体永不进入报告，复用`triggerLocalDownload`下载；unit+e2e双覆盖（含报告内无密钥与正文的直接断言）。③Agent跨项目待决策聚合→**非缺口**：旧版导航（项目/画布/素材/提示词/任务/活动/设置/帮助）本就没有跨项目Agent页，Agent会话历来是项目级；云端`CloudAgentPanel`（创建/授权/预览/确认/应用/撤销）已等价恢复并有`cloud-agent.spec.ts`两条覆盖，任务中心只呈video是审计定归属，不删账务。
- 按钮审计：新增表面全部按钮均有行为或禁用原因（保存类按钮在确认引用可读前禁用并给出原因；空态无按钮；通知/连接数只读展示）；`?node=`/`?q=`不新增按钮。
- 审计F023（连接状态误报已连接）：`CloudConnectionStatus`原仅凭`modelConfigs()`有配置就显示“已连接”，而该接口无任何探测证据。现仅保存的配置一律标“已配置·未验证”，视频另取与当前配置绑定的`videoCapability().verified`（按当前地址查合同、按当前模型过滤规格，配置一改即重算）才标“规格已核验”；弹窗明示“不代表连接探测成功”，探测只在API设置页当时当地呈现，不为展示发起任何上游调用。另核实：新地址保存强制要求密钥（服务端`API_KEY_REQUIRED`），无密钥的已存配置经公开接口不可达，故不设无密钥分支。
- 草稿切换flaky根因修正（`cloud-prompt-optimize:29`全量偶发失败）：`manualDirty`把“初始未同步的空正文”误判为用户未保存修改，导致加载窗口内切换被误阻断。现以独立`edited`标记区分用户编辑与程序化同步（切换/保存/放弃/重载时复位），F014“未保存则阻断”语义不变；用例加“初始无`manual-guard`误报”断言并等选项加载完再选择。
- 定向检查：`typecheck`/`lint`/服务端`typecheck` exit 0；`test:unit` 95文件694项 exit 0（中途一次`text-optimization` T30超时单项失败，文件单跑与重跑全量均过，与本轮改动无依赖关系，记为偶发超时）；服务端`workspace-commands` 13项 exit 0（含新增receipts归属/倒序/分页校验）；`cloud-shell`/`cloud-activity-recovery` 9条 exit 0；`cloud-prompt-optimize`连跑3遍15/15；云全量86 passed exit 0（`work/account-api-cloud/stage7-f023-final.log`，未截断）。
- 审计F023剩余分支（保存后无刷新不同步）：顶部状态读取effect原只依赖稳定client，设置页保存不重读。现保存成功派发`aiwork:model-configs-changed`事件，顶部按路由变化与该事件重读，并以序号守卫丢弃迟到响应；另按静态核对收紧语义——`verified`为真但当前模型不在`videoSpecs`内时不宣称“规格已核验”。回归用例经真实设置页改模型→保存→不刷新断言状态翻转，改回亦然。
- 新增F024（同项目连续搜索只改URL不跟随）：`CloudCanvasPage`的`focusedOnce`首定位后永久失效。现按目标node变化重新定位；有未保存输入（非saved态）时不动选中与视角，autosave完成后状态变化会重新评估；回归用例连续点击两节点并断言选中跟随与前者脱钩。
- 审计F025（旧离线包入口缺失）：`inspectCloudProject`只认云端包，`inspectWorkspaceMigration`只认迁移包，旧`projects.json`（infinite-canvas v3）无入口。现用户明确选文件后自动识别旧包：纯内存经`migrateLegacyPackage`转换（不碰匿名库），仅保留云端已知类型节点（不支持的旧节点隔离计数后丢弃，旧配置/会话/无类型连线不导入），媒体按转换后manifest旧路径读取字节并经hash/MIME校验后写入云端original路径（含审计019指出的`.bin`→`.original`路径错配修复），预览明确标注旧包身份与隔离数，确认后走现有账号导入链（新ID、历史标记、去授权），原包只读不写。验证：unit（文本+真实小PNG媒体分支）与`cloud-legacy-import.spec.ts`两条（转换导入无密钥残留、原包可重复导入、真实旧图入库可读、零上游POST）。
- 本地诊断脱敏导出（原实际缺口，现已实现）：`CloudActivityPage`新增“导出脱敏诊断”，纯客户端组装已有只读接口（项目/回执/任务/配置presence）的白名单子集，提示词全文、提交原文、密钥、媒体永不进入报告，复用`triggerLocalDownload`下载；unit+e2e双覆盖（含报告内无密钥与正文的直接断言）。
- F023/F024后复验：`typecheck`/`lint` exit 0；`test:unit` 97文件699项 exit 0；`cloud-shell` 8/8（含时序与连续搜索回归）；`cloud-prompt-optimize`连跑3遍15/15；云全量93 passed exit 0（`work/account-api-cloud/stage8-f025.log`，未截断）。
- 审计022四项（`9b194b8`隔离复验）：F026诊断`projectId`越联合访问——`cloudTaskSchema`本无此字段，`pickRun`改`in`收窄，测试补`schemaVersion:1 as const`；F027收据同毫秒按随机id排序——`listReceipts`改`created_at DESC,revision DESC,id`，并以最小/最大UUID幂等键固定确证测试（旧排序下复跑确红两项）；F028品牌误判——`legalDataOnly`允许全白名单字符串的子集形态（严格性不变）；6份runtime许可hash——仓库blob本就是LF，工作树CRLF系`core.autocrlf`转换，新建`.gitattributes`定`runtime-*.LICENSE text eol=lf`并重检出，`check-license`恢复`preservedAll:true`，未泛化忽略hash；QA43生产运行时依赖——白名单投影+敏感扫描提取提交内`gateway-contract.sample.json`，测试改读它，一次性脚本已删。
- 审计022四项（`9b194b8`隔离复验）：F026诊断`projectId`越联合访问——`cloudTaskSchema`本无此字段，`pickRun`改`in`收窄，测试补`schemaVersion:1 as const`；F027收据同毫秒按随机id排序——`listReceipts`改`created_at DESC,revision DESC,id`，并以最小/最大UUID幂等键固定确证测试（旧排序下复跑确红两项）；F028品牌误判——`legalDataOnly`允许全白名单字符串的子集形态（严格性不变）；6份runtime许可hash——仓库blob本就是LF，工作树CRLF系`core.autocrlf`转换，新建`.gitattributes`定`runtime-*.LICENSE text eol=lf`并重检出，`check-license`恢复`preservedAll:true`，未泛化忽略hash；QA43生产运行时依赖——白名单投影+敏感扫描提取提交内`gateway-contract.sample.json`，测试改读它，一次性脚本已删。
- 审计F029（账号发布归档遗漏许可证）：`package-account-cloud.mjs`只归档了`THIRD_PARTY_NOTICES.txt`与`runtime-licenses.json`，11份许可原件缺失。现把6份runtime许可与5份静态许可（infinite-canvas/prompt-for-seedance/两份business_license/frontend-design）纳入明确归档清单，并在stage上实际执行`scanLicenses`+`scanBrand`，失败拒绝出包，不放宽条件；正式批准状态保持不变。另消掉本轮新增UI文案带入构建的第三方标识，当前产物无新增违规项。
- 审计F029（账号发布归档遗漏许可证）：`package-account-cloud.mjs`只归档了`THIRD_PARTY_NOTICES.txt`与`runtime-licenses.json`，6份runtime许可与5份静态许可原件缺失，stage上`scanLicenses`报missing 11项。现把11份原件纳入明确归档清单，并在stage上实际执行`scanLicenses`+`scanBrand`，任一失败即拒绝出包，不放宽hash与扫描条件；正式批准状态保持不变。另消掉本轮新增UI文案带入构建的第三方标识，当前产物无新增违规项（剩余为基线固有许可文本块与隔离旧格式例外）。
- F026/F027/F028后复验：`typecheck`/`lint`/服务端`typecheck` exit 0；`test:unit` 97文件699项 exit 0；服务端`workspace-commands` 14/14；云全量93 passed exit 0；`cloud-prompt-optimize`连跑3遍15/15（`work/account-api-cloud/stage8-022.log`中1项F018带参考生成卡poll超时，单跑即过且本轮改动未碰worker路径，记偶发，并把该helper的poll按`cloud-video.spec.ts:12`先例放宽到15s）。
- `check-traceability`旧映射迁移待决（非通过项，不冒充完成）：`interaction-map.json`共260 interactions/23 pages/30 dialogs，其中227/17/29条的sources全是旧匿名路径（`review`全待审查），其proofs指向的旧e2e在账号外壳下不可跑。分类：①真实不适用（旧匿名专属：本地存储/欢迎引导/本地诊断库条目、旧离线格式开关形式等）；②仍有效待迁移（旧有效场景，云端实现与对应用例已在本节逐项验证，差的是把旧条目重指到云端id/云端用例行号的登记工作，未做）；③需人类决定（品牌门`frontendMarkAuthorization`、视觉基线批准）。`test:trace` 31/36的5失败中QA-005/T50两项卡品牌许可门、T01-C05系测试硬编码旧检出根（本检出下基线必挂）、T02-G02系人工门，均与本轮产品改动无关。

## 13. 阶段8（整体验收，本地可执行部分；生产与真实收费待授权）

- 真实点击旅程（本地假上游，零付费）：`cloud-journey.spec.ts`从空项目开始，全程点击完成API配置（含测试连接成功后保存）、提示词新建、画布建流程并保存、素材上传入库、生成确认、经任务详情进入结果页、修改、续写、跨页面恢复；`providerCalls` POST仅1次（生成提交）。
- 验证矩阵（本轮实际commit与结果）：`typecheck`/`lint`/服务端`typecheck` exit 0；`test:unit` 95文件694项；服务端`workspace-commands` 13项；云全量90 passed；`vite build` exit 0且`check-bundle-budget` passed；构建产物无测试密钥/私钥残留（`dist/assets`无`FAKE_*_KEY`/`aiwork_local_test_only`/私钥头）。
- verify子项逐项：`test:coverage`中`check-ui-identities`已从10归零（含本轮新增7处与历史3处补id）；`check-traceability`依赖旧匿名映射表（`interaction-map.json`等无账号体系更新流程），与旧匿名套件同列不适用；`test:security`后半`check-network-negative`通过；`test:trace` 31/36——5失败均与本轮无关（QA-005/T50两项卡品牌许可门；T01-C05系测试硬编码旧检出根路径，本检出下基线必挂；T02-G02系需人工批准视觉基线的人工门，保持pending）；`companion:build`通过；`test:e2e`默认旧匿名runner、`test:distribution`、`test:performance`、`test:live`未执行（入口替换不适用/需授权，见下）。
- 品牌门现状：`check-brand`仍`passed:false`（`frontendMarkAuthorization` unresolved为基线发布门槛，需人类澄清）；本轮行为——新增UI文案避开第三方标识并清理`emptyOutDir:false`累积的旧构建残留后重建，当前产物无新增违规项（剩余为基线固有的许可文本块与隔离旧格式例外）；第三方运行时许可基线过期（`runtime-*.LICENSE`被标modified）与本轮依赖无关（未改依赖）。
- 严格HTTPS阻塞（精确版，纠正“本机只有5.1”误判）：`C:/Users/StarLink/.cache/codex-runtimes/.../powershell/pwsh.exe`实测7.6.5；`start-account-browser-tests.ps1 -DryRun`（只读零变更）确认执行范围——固定Subject `CN=AIWORK-Local-Account-Test-20261008-Restricted`、信任目标仅CurrentUser/Root、Prepare生成24小时非CA叶证书并ACL锁定目录、finally按指纹清理（删信任+删文件）并落盘证据；真正待用户确认的只有临时CurrentUser信任（`-AuthorizeLocalTrust`开关，脚本自带强制要求）。`prepared-test-tls.json`系旧轮证据不复用。旧匿名验收套件因合法入口替换不适用（映射见§10），不以静态检查代替。
- 推送阻塞（精确版）：`feat/account-api-cloud`本地超前`origin` 16个提交；`Test-NetConnection github.com:443`直连成功，失败根因是用户全局`~/.gitconfig`写了`http.proxy=http://127.0.0.1:10809`而该端口无服务。只读诊断到此为止，不改代理；待用户执行`git config --global --unset http.proxy`（及https.proxy）后重试推送，之前先核对远端未被他人改写。
- 审计补充事实（023轮，实施侧不重复执行）：只读`git -c http.proxy= -c https.proxy= ls-remote origin`成功，远端实际仍`81576d8`，命令级临时绕过无需改全局代理（审计执行，未推送）；只读SSH核对线上`cloud-aebd1f5`、commit `aebd1f54f97a141e740d6b9550f5849a9d267c42`、24文件哈希一致、service active，无生产变更；品牌授权仍unresolved；HTTPS临时信任待用户回复，不执行；计费/生产动作待授权；traceability保持待验收登记；定时任务保持PAUSED。
- F018生成setup等待定向确认：`stage8-022`全量中该用例卡5秒poll（error-context为accepted等候，worker侧3秒后查+500ms tick所致），仅将等待放宽到15秒，未改业务断言、不掩盖unknown/failed；定向连跑2次通过（10.2s/8.7s，均超老窗口）。
- 审计025（超预设保存等待竞态）：`cloud-prompts.spec.ts:26`第二次保存后只等本地已消失的提示就读库，偶发撞上在飞的PATCH读到旧值。现第二次点击前捕获草稿id/revision，对PATCH加300ms固定延迟做反向验证，等待同一草稿PATCH成功响应（`waitForResponse`）与选项区新修订显示后再按id读库断言；原值保留/明确选择/零供应商调用断言保留，产品逻辑未动。定向连跑2次通过。
- 审计F030（提示词库JSON导入/导出）：复用纯契约`previewPromptImport`/`exportPrompts`，读写只走当前账号`WorkspaceClient`。导入：选文件→纯内存校验/预览→明确确认→逐条创建（每条预生成幂等键，同一批次重试replay不重复；部分失败明确标题并保留批次可重试）；超限/损坏/取消不写入。导出：选中条目→下载`AIWORK-prompts.json`（仅6展示字段，无密钥授权任务数据），无选中禁用并给原因，原内容不变；跨账号隔离。用例`cloud-library-transfer.spec.ts` 7条（F030三条、F031一条、F032三条）。
- 审计F031（应用到现有文字节点）：库使用对话框新增目标节点下拉（默认新建，不默认替换首项）与原/新正文对账；确认后按旧语义全量替换data（保留原referenceTokens+来源记录），走冻结命令身份（未知重试不重复），失败保留选择与变量，资源缺失/切账号明确拒绝；库条目与任务不动。
- 审计F032（画布文字节点两入口）：节点旁新增“保存为提示词”（正文经sessionStorage一次性携带到达库编辑器预填，失败不清原文字、不重复条目）与“在写作中打开”（先等画布保存成功，按`sourceProjectId/sourceNodeId/sourceRevision`创建明确新draft并`?draft=`定位，失败不建草稿不离开）；后续AI仍独立确认。定向验证：全正文与来源修订、刷新定位、失败保留输入与不跳页、零上游调用。
- F030/F031/F032后复验：`typecheck`/`lint` exit 0；`check-ui-identities` 0；`cloud-library-transfer` 7/7。
- 审计F033（项目批量边界）：同名导出键加短id防碰撞（外层各包独立完整）；列表回收站保留恢复/导出操作且回收站可切换视图；模板冻结项目身份，命令失败/未知重试沿用同一项目（重读revision+同key replay），不重建不删空项目。
- 审计F034（偏好/活动）：账号偏好重置仅外观布局播放字段（生成规格/模型/项目任务不动），云端revision保存，可恢复前值，失败保留输入；活动加项目/类型/日期筛选、回执详情、本地隐藏（localStorage显示态，服务端记录不可删，恢复显示后重现）；Z-02/Z-03永久删除明确为实际缺口（无purge服务，回收站恢复不等价，不删任何数据）。
- 审计F035剩余（刷新与切账号）：未决写作冻结按用户/项目/节点约束存localStorage（非匿名库），刷新后恢复沿用旧身份；成功/放弃按钮清除；切账号不一致丢弃。伪造他账号种子否定用例与刷新恢复用例通过。
- 审计F036剩余（重读清目标）：未决时重读按钮替换为锁定提示，目标项目/节点下拉禁用；关闭重开不清身份，指纹变化明确报错。失败后重读锁定、直接重试成功、两次POST字节相同、只增一条回执。
- 审计F038（写作布局）：中宽度改两主区+检查栏下置，折叠断行；1024/1100/1280/1440×两主题boundingBox验证（首屏+无横向溢出）通过。
- 审计F039（性能）：dev模式200节点未达标系React dev开销；生产构建50/200全过（pan/input 7.1/13.1ms内），按生产构建局部通过登记；已回退为此做的copy-on-write产品改动，不重构不上调门槛。
- 补充计划F040（云端永久删除Z-02/Z-03/D-19，已实现非缺口）：墓碑保留项目身份行（历史外键不断），删当前图/撤销历史/当前图资产引用，收缩描述标签；任务账务收据资产保留。预检（身份/revision/影响摘要/阻止原因）+确认（完整名称/revision/影响标识/confirmed/幂等键）两步协议；活跃未知任务保护fail-closed；并发同key锁后复查同一收据，跨项目同key冲突409；未知重试同key replay。UI单项/批量确认（逐项名称、部分失败保留重试、成功不重执行、单项跨刷新重放）。迁移008（旧7张不动）进三处装载清单与发布包。验证：服务端9项（拒绝/回滚/幂等/并发/收缩/缺态/绕过/确认拒绝）+全量26/278；e2e 7项（成功/取消/批量/未知重试/保护/刷新重试/批量重试）+全量；终态任务账务冻结不变，零上游调用。不删资产媒体，不清库，不碰生产数据。
- 审计F041（purge未决持久化剩余）：单项存完整请求body，刷新/取消重开经恢复横幅重试原动作，成功才清除；批量存完整请求与预检，失败保留原key重试，成功项标记不重执行；存储键含用户，跨用户不删不清错。e2e两条通过。
- 审计F042（purge批量状态剩余）：剩余按累计done+本轮成功计算，全成功关闭对话框并报告总数；发送前持久化完整body，成功逐项清除；新批量不合并旧待办，旧待办经独立恢复入口重建发送原请求。e2e 8项（成功/取消/批量/未知重试/保护/刷新重试/批量重试/刷新批量恢复）通过。
- 审计F043（purge预检重试与存储隔离）：单项/批量预检失败有明确重试入口，只重试失败项并保留名称；新批量只用当前列表选中项，打开/预检不覆盖旧存储，只有发送前持久化完整body；旧待办经独立恢复入口。e2e 10项通过。
- 审计F044（traceability云端登记一阶段）：新增云端登记管线（`build-cloud-executed-tests`从真实执行日志提127条passed结果，`build-cloud-trace-map`转313条登记，`check-traceability --cloud`检查并报告缺失）。sources三级绑定（旧anchor精确22→测试interaction-id反推201→文件级60，共260全绑；pages23全绑；dialogs标题28+文件2）。proofs只绑真实passed（260条normal），其余facet诚实pending（disabled/error/persistence各251、sideEffect260），条件未交付11条豁免非normal。旧匿名注册保留，coverage-report-cloud.json为当前真实报告（complete=false系诚实pending，非失败）。facets细化认领与人工anchor精化持续进行，不虚报。
- 审计F045（登记证据真实性修正）：删除静态回填生成器，results 直接消费 reporter 真实观测（assertion/action 位置为该测试实际执行行，network 缺失不回填零）；proofs 只取 reporter 行中确为 expect 调用的行；sources 只接受测试真实动作行提取的 target 在当前文件中的绑定，文件级绑定一律回到 pending。当前报告：assertion 绑定真实，剩余为诚实的 facet/action 缺失 pending，不伪装 complete。
- 审计F046（条目级精确登记一阶段）：家族候选与具体核验分离（candidates 仅参考，proofs/sources 只放手工精选，默认 pending）。Z-02（单项purge-open/commit+4条purge真实用例分认normal/sideEffect/disabled/error/persistence）与D19（两对话框标题+2条用例）self_check通过；Z-03差disabled（批量设计无禁用态，诚实pending）。其余条目保持 pending，不以家族填充，不虚报。
- 审计F047（设置文案/layout主题/Z-03子集）：设置说明去掉Welcome改真实入口；layout用例走UI切主题并断言colorScheme/背景后截屏；新增批量确认子集用例（仅命名项发送、未命名画布保留）并登记Z-03确认子集证据。
- 审计F048（已恢复12项精确登记一批）：L-09/10/11（导入/导出/应用模板）、T-05/06（画布节点入口）、PG02（应用到文字）、P22（写作页）、P-02（新建）、P-09（模板）、P-11（批量）、P-13（视图）、H-01/04（活动筛选/详情）按当前实现绑定真实控件与真实用例，normal已认，L-09/10另认sideEffect（network真实0）。P-10（导入包无用例操作）、S-06/D18（语义不明）保持pending，不硬映射。原始语义字节丢失处已注明按实现对应。
- 审计F049（登记语义纠正）：L-09改应用到当前文本（替换节点）、L-10改导入、L-11改导出；P-02改使用模板、P-09改选择、P-10改批量归档、P-11改批量导出（去混入）；H-04改清理显示（隐藏/恢复）、S-06改重置偏好、D18改重置快照可恢复（对话框+真实打开证据，通过）。另认L-09/L-10/P-10/S-06的error真实证据。T-06/PG02仅保留打开入口normal，AI优化确认等保持pending。
- 审计F050（D18/S-06/T-06/PG02证据补强）：D18改绑AccountPreferences实际Dialog；新增重置请求失败定向用例（对话框保持、前值保留）并登记S-06 error；T-06/PG02登记optimize真实确认/保留原文用例。无系统点击测试步骤变更，不改产品认证/证书。
- 审计F051（H行号/桥接/Z-03子集）：重跑活动reporter刷新全部proofs行号；新增节点→保存→打开→预览取消/确认→单次调用→刷新恢复→邻居保留的桥接用例并登记T-06/PG02 normal/sideEffect；transfer 15/15。Z-02/D18/D19保持通过。
- 审计F052（类型门/活动证据/PG02入口）：Ctx查询泛型化修复TEST-GATE-001，typecheck/lint双过；H-01/H-04改绑batch活动用例真实行（筛选/隐藏/恢复）；PG02改绑节点入口与优化确认控件。不把legacy coreWrites等同写操作，未覆盖facet保持pending。
- 审计F053第一批（L-09/10/11/T-05适用facet收敛）：L-09加error（未知重试）/sideEffect（network真实0，DB写为预期），L-11/T-05加sideEffect；disabled/persistence无对应测试，保持pending不硬凑。下一批入口：T-06/PG02/P22/P-02/09/10/11/13/S-06/D18/H-01/04及13用户问题。
- 审计F054第一批收敛完成：L-09（替换锁定disabled、画布确认persistence）、L-10（重开保留persistence）、L-11（取消禁用disabled、文件副本persistence）、T-05（空文禁用disabled、保存失败error、重开确认persistence）全部通过；L-10 disabled（导入无禁用态）、L-11 error（本地导出无失败路径）诚实pending。transfer 15/15。
- 审计F055第一批最终收敛：完整15条reporter（不用子集），按testId和当前源更新；L-10挂起限制（确认/取消/选文件busy禁用+单次提交）disabled通过，L-11下载故障（注入抛错→明确提示→保持→重试成功）因本地导出有try/catch而不写无失败路径，T-05重开核对正文persistence通过。L-09/L-10/T-05自检通过；L-11 error（本地导出无失败路径）诚实pending。transfer 16/16。
- 审计F056第二批（T-06/PG02/P-02/09/10/11/13/S-06/H-01/04适用facet收敛）：T-06/PG02 persistence（刷新恢复）通过，只剩disabled；P-02 error/sideEffect、P-10 sideEffect、P-11 persistence、P-13 persistence通过；P-09/S-06/H-01 persistence不适用（本地临时状态，给具体设计原因）。L-11 error同用例认领通过。剩余disabled等多无对应禁用设计，诚实pending不硬凑。
- 审计F057第二批收敛：完整batch10 reporter合并，refresh脚本加过期校验（mtime新于报告则跳过警告）；P-11 error（78/82/84真实行）通过；P-02 persistence（模板画布两节点）通过；P-10 persistence（归档刷新筛选）通过；P-13 sideEffect（偏好写入）通过；S-06移除错误豁免，persistence（重置刷新）通过；H-04 disabled（初始禁用）/sideEffect（DB收据）/persistence（刷新隐藏）通过。P-02自检通过；剩余disabled/error（无对应设计）诚实pending。batch 10/10。
- 审计F058（证据源校验/第二批收敛）：refresh改源hash密封（验证通过才更新，不补写未执行）；P-13 error通过；P-10/P-11 busy挂起、S-06恢复刷新、T-06/PG02确认禁用、H-04刷新验证全部通过；T-06/H-04自检通过。passed 9；剩余disabled（无禁用设计）诚实pending。batch 11/11。
- 审计F059第一批（reporter源hash/过期清理/重认领）：reporter记录执行时源hash；refresh三方一致才更新，过期清理旧proofs；P-10/P-11 busy挂起、S-06恢复刷新DB核对、T-06/PG02确认禁用、P-11 disabled认领。P-10/P-11自检通过；passed 7。verify/planning迁移与剩余登记持续进行。
- 审计F060第二批（P-09/H-01豁免修正/重跑）：sideEffect不可豁免，删错配豁免；P-09/H-01认领normal（真实断言），disabled/error给源码一致具体豁免（纯本地无设计），sideEffect保持pending；batch重跑更新reporter。P-09/H-01只剩sideEffect pending。passed 6。
- 审计F060第一批（证据源真修复/verify迁移）：reporter执行时记录源hash；refresh要求记录hash非空且三方一致，缺失一律stale；新增verify:cloud与cloud planning门（迁移清单一致、junction禁止、真实证据消费、人工门待决）4/4通过；S-06补规格/项目DB前后对比；P-11 disabled纠正为选择禁用（本地同步导出无挂起，不泛称busy）。提交后继续剩余登记。
- F033/F034/F035/F036/F037/F038后复验：`typecheck`/`lint`/服务端`typecheck` exit 0；`test:unit` 97文件699项 exit 0；服务端`workspace-commands` 14/14；`check-ui-identities` 0；`cloud-library-transfer` 11/11；`cloud-project-batch` 9/9；`cloud-writing-layout` 1/1；`vite build`+`check-bundle-budget` exit 0；云全量113 passed exit 0（`work/account-api-cloud/stage8-final3.log`，未截断）；`cloud-library-transfer`追加F035拒绝/F037未知连点/刷新恢复/跨项目保留/改文阻止/保存失败保留后14/14；最终云全量117 passed exit 0（`work/account-api-cloud/stage8-final4.log`，未截断）。
- 待完成（需授权，勿视作已交付）：真实模型验收（文字优化/纯文字视频/带参考视频/续写生成，需用户选定输入模型并确认费用，本轮零触发）；生产数据库/媒体/配置备份、兼容性检查与恢复演练、部署上线与同提交号线上复测（无生产变更授权，均未执行；用户此后写入内容不得覆盖）。
