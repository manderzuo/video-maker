# 手机网页版适配实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:executing-plans 在当前会话逐项执行。遵循用户的协作偏好，不自动创建子代理。步骤使用复选框跟踪。计划阶段仅设计；用户随后授权实施，当前实现及模拟验收已推进，正式手机发布仍须真机验收。

**Goal:** 手机可完成提示词写作、素材选择、视频生成、结果修改与续写，同时现有桌面 Web 的页面、交互、数据契约和使用入口通过回归验收。

**Architecture:** 在同一站点增加显式 `/m/` 入口，采用独立手机页面容器、作用域样式与按需加载模块，复用现有会话、WorkspaceClient、领域校验和云端数据。桌面入口继续渲染现有 AccountShell；共享组件的手机扩展均为显式参数，默认输出保持桌面行为。手机访问记录和画布观察视角保存在当前设备，不覆盖账号中的桌面启动页或云端画布视角。

**Tech Stack:** 沿用 React 19、TypeScript、Vite、现有 WorkspaceClient、Vitest 和 Playwright；第一阶段不新增 UI 框架，不改变服务端 API 或数据库结构。

**Spec:** 本文件的“设计范围与边界”和“Global Constraints”是本计划的设计依据。来自用户 2026-10-11 的手机适配需求及“不能影响我们的 web 端”约束；完整创作流程作为首期范围实施；验收进展见 docs/review/mobile-web-acceptance-20261011.md。

## Global Constraints

- 现有桌面地址、导航、鼠标与键盘操作、布局、主题和浏览器缩放行为保持现状；屏幕变窄不能自动进入手机工作区。
- `/m/` 是显式手机入口；不按 User-Agent 重定向，不替换现有 `/projects`、`/canvas`、`/prompt-generator` 等页面。
- 手机代码按需加载；手机 CSS 选择器只作用于 `.mobile-workspace` 或明确标记的 `.mobile-dialog`，禁止修改全局元素样式、全局令牌或原有媒体查询来实现手机布局。
- 手机导航不写入账号级 `lastVisitedPage`；手机平移、缩放、小地图操作不提交云端视角、节点坐标或尺寸变化。
- 复用现有账号隔离、CSRF、修订号、冲突处理、幂等提交、付费确认和任务查询契约；不得为手机另建一套数据结构。
- 同一账号的主动内容编辑正常同步到电脑；“不影响桌面”指体验与行为不回退，不意味着手机编辑的数据与电脑隔离。
- 第一阶段不增加数据库迁移，不更改生成服务、提示词校验规则或计费逻辑，不升级现有依赖。
- 移动功能构建开关命名 `STUDIO_MOBILE_ENABLED`，仅接受 `0`、`1` 或未设置（默认关闭），通过明确的布尔构建常量 `__STUDIO_MOBILE_ENABLED__` 注入；关闭构建和启用构建都必须通过桌面回归。保持发布脚本禁止个人 `VITE_*` 配置的现有保护，不放宽该检查。
- 手机首期范围包含完整创作流程与画布查看、节点正文编辑；自由拖动布局、手工连线、多选批处理、PWA 和离线编辑列为后续独立任务。
- 无关的本地文档、图片、验收记录和用户修改保持原样；提交只列出本任务拥有的具体路径。
- 计划阶段仅交付计划。用户随后明确授权按计划实施；当前可交付明确标注限制的预览，正式手机发布继续遵守真机门槛。

## 设计范围与边界

### 手机入口和页面

手机首期独立地址为 `/m/projects`。路由集合：`/m/login`、`/m/register`、`/m/projects`、`/m/projects/:id/video?node=:id`、`/m/projects/:id/canvas`、`/m/projects/:id/results`、`/m/prompt-generator?draft=:id`、`/m/assets`、`/m/tasks`、`/m/me`、`/m/settings/connections`。`/m` 跳转到 `/m/projects`，未知地址显示手机内的未找到页面。

底部导航使用“项目 / 创作 / 素材 / 任务 / 我的”。手机的窄屏布局在 768 CSS 像素以下使用单栏，768 及以上适应平板横屏；这组规则仅作用于 `/m/`，不改变桌面原有断点。进入 `/m/` 后旋转屏幕或改变窗口大小不能卸载正在编辑的表单。

写作页使用“输入 / 结果 / 历史”切换，表单状态在切换时保留。时长、画幅和清晰度集中展示，清晰度继续为 480P / 720p。视频结果优先展示播放、修改再生成和尾帧续写；素材页支持现有文件上传、选择、进度和失败重试能力。上传到云端与模型可使用的素材范围仍按现有契约处理。

视频创作页用表单选择现有或新建的视频草稿，复用文字来源编辑器与生成确认面板；自动创建流程继续使用现有应用提示词能力。创建、修改或续写草稿后跳转到手机视频页的指定节点，不依赖自由画布编辑完成生成。项目内容的主动创建会同步到桌面，这是预期行为；已有节点不能因手机屏幕尺寸被重新排版。

键盘适配只测量手机视图，使用 `visualViewport`（不可用时回退布局视口）、安全区内边距和可滚动内容区，确保正在输入的位置与必要操作可见。按钮主要点击区域至少 44 × 44 CSS 像素。保留浏览器原生页面缩放。

### 共享代码与隔离边界

- `AuthBoundary.tsx` 只增加明确的手机路径分支和手机登录后返回路径；桌面分支及其页面记忆语义保持原样。
- 手机 UI 位于 `src/features/mobile/`，依赖现有领域类型和 `WorkspaceClient`。手机模块不加入桌面常规渲染树。
- 复用页面确需手机差异时，仅增加默认值为 `desktop` 的 `presentation` 参数；不大规模抽取或重写现有保存与生成控制逻辑。
- 页面内部跳转增加可选 `navigation` 适配参数；缺省适配器使用现有 `navigate` 和原始路径。手机适配器只转换已知工作区路径，保留查询参数，不修改全局 `navigate` 的行为。
- 现有 `Dialog` 通过 Portal 挂载到 `document.body`。增加可选 `className` 参数，默认输出完全保持原样；仅手机调用传入 `mobile-dialog`，不得用全局 `body` 类名污染其他页面。
- 新移动页面允许复用业务服务与纯渲染组件；禁止复制一套自动保存、计费或提交协议。若发现必须重构共享业务控制器，拆成单独兼容性任务，先证明桌面行为等价再继续。

### 画布首期

提供只观察布局的手机画布与节点列表两种查看方式。单指空白处平移、双指以中点缩放、点击节点进入正文编辑；小地图固定在手机画布容器右下角，可拖动定位和收起。只在画布手势区域接管触控，不拦截表单、弹窗和页面滚动。

节点正文修改通过现有带修订号的命令保存，保持其他节点、坐标、尺寸和连线不变。手机临时视角按 `账号上下文 + 项目 ID + mobile` 存在设备内；桌面打开同一项目保持它自己的视角和布局。事件取消、第二根手指加入、旋转屏幕均应释放旧手势，避免突然跳动或误修改节点。

## Review Focus

1. 手机访问记录污染账号启动页，导致电脑下次登录进入手机路径：由任务 2 验证。
2. Portal 弹窗样式、残留 CSS 和事件监听影响从手机返回后的桌面页面：由任务 2、3、6 验证。
3. 中文输入、自动保存和软键盘变化同时发生，造成焦点、光标或新输入丢失：由任务 3 验证。
4. 弱网、切后台、重复点击以及修订冲突造成重复任务或覆盖电脑编辑：由任务 3、4 验证。
5. 手机观察画布提交布局或视角变更，影响电脑项目；多指手势误触生成：由任务 5 验证。

## 文件责任划分

| 文件或目录 | 计划责任 |
| --- | --- |
| `src/features/mobile/MobileWorkspace.tsx` | 手机路由与页面装配、独立 WorkspaceClient 生命周期 |
| `src/features/mobile/MobileShell.tsx`、`mobile.css` | 手机顶部、底部导航、内容区及作用域样式 |
| `src/features/mobile/mobile-routes.ts` | 手机路径识别、受限路径映射、桌面返回地址 |
| `src/features/mobile/mobile-release.ts` | 构建开关读取，关闭时回到对应桌面地址 |
| `vite.config.ts`、`scripts/package-account-cloud.mjs` | 明确注入布尔开关，保持原有发布环境检查 |
| `src/features/mobile/use-mobile-viewport.ts` | 手机可视区域与键盘避让；卸载时清理监听 |
| `src/features/mobile/MobileVideoPage.tsx` | 手机视频草稿表单，复用现有云端图模型、输入编辑器和生成面板 |
| `src/features/mobile/MobileCanvasPage.tsx`、`mobile-canvas-gestures.ts` | 手机只观察布局的画布和独立手势状态 |
| `src/features/workspace/workspace-navigation.ts` | 可选页面导航适配器；默认桌面行为 |
| `src/features/auth/AuthBoundary.tsx` | 显式手机路由和登录返回分支 |
| `src/ui/Dialog.tsx` | 可选手机弹窗样式类，默认不变 |
| `CloudProjectsPage.tsx`、`CloudAssetsPage.tsx`、`CloudTasksPage.tsx` | 必要的可选导航参数，主体业务保持现状 |
| `src/features/workspace/CloudPromptGeneratorPage.tsx`、`CloudResultsPage.tsx`、`CloudApplyPromptDialog.tsx`、`CloudVideoRunPanel.tsx` | 手机展示参数、导航及弹窗标记（同目录） |
| `tests/e2e/mobile-*.spec.ts`、`tests/unit/mobile-*.test.ts` | 手机与隔离边界专项验证 |
| `playwright.mobile-ui.config.ts`、`playwright.desktop-guard.config.ts` | 独立验收矩阵，复用已有真实隔离后端夹具 |

## Task 1：冻结桌面基线

**Files:** 新增 `tests/e2e/mobile-desktop-guard.spec.ts`、`playwright.desktop-guard.config.ts`；证据写入忽略目录 `work/mobile-adaptation/`。

**Interfaces:** 消费当前已发布版本和 `tests/helpers/cloud-workspace-ui-fixture.ts`；产出桌面页面截图、交互断言、构建体积和关键路由清单，后续任务使用同一基线。

- [x] 核对实施开始时的源码与线上版本；规划时基线为 `ec0973a223096faab5165f813c21d84999c17514`，若期间更新则先重新固定基线。
- [ ] 在独立分支/工作区记录桌面验收基线：1024×768、1280×900、1440×900、1920×1080，深浅主题，浏览器 125% 与 150% 缩放；另外保护现有 720 像素窄窗口，不自动跳手机版。
- [x] 桌面保护配置继承原云端 UI 配置；全套现有用例使用原 1280×900 项目运行一次，新增保护用例使用尺寸/主题矩阵。配置显式启动 4310 端口 Vite，退出时关闭，禁止复用来源不明的旧服务。
- [ ] 固定数据和时间后记录项目、画布、写作、素材、任务、结果、设置与重要弹窗；只遮罩明确的时间戳、视频帧等动态区域。
- [x] 写桌面保护用例：相同数据的布局截图、鼠标缩放拖动、连线、快捷键、弹窗焦点、自动保存及视频确认行为。
- [x] 运行现有云端 UI 验收，记录既有失败；未解释的失败不得作为后续默认豁免。
- [x] 仅提交新增的保护用例与配置，保持产品代码不变。

**Exit:** 基线可重复产生，截图差异阈值固定为 `maxDiffPixelRatio: 0.001`；任何导航、尺寸、文本、可用操作的实质差异都需人工检查，禁止直接更新截图接受变化。

## Task 2：建立隔离的手机入口

**Files:** 新增上述手机 Shell、路由、开关文件和 `workspace-navigation.ts`；修改 `AuthBoundary.tsx`、`vite.config.ts`、`scripts/package-account-cloud.mjs`；新增 `tests/unit/mobile-routes.test.ts`、`tests/e2e/mobile-shell.spec.ts`、`playwright.mobile-ui.config.ts`。

**Interfaces:** `isMobilePath(path: string): boolean`；`toMobilePath(path: string): string`；`toDesktopPath(path: string): string`。导航类型 `WorkspaceNavigation = {href(path: string): string; go(path: string): void}`，默认对象透传 href 并调用现有 navigate。`MobileWorkspace({path}: {path: string})` 由手机路径分支按需加载。

- [x] 写用例：`/m` 与 `/m/...` 才进入手机分支；`/models` 等前缀不误判；查询参数保留；协议相对地址被拒绝；未知路由有明确提示。
- [x] 写登录/退出/会话过期用例，断言手机内部安全返回路径保留，同时不写入账号 `lastVisitedPage`；桌面登录返回逻辑与基线一致。
- [x] 运行新增用例确认其因功能尚未实现而失败。
- [x] 实现显式路由分支、默认关闭的构建开关与按需加载；入口关闭时仅对 `/m` 请求提供对应桌面入口，不影响桌面路由。
- [x] 构建与打包分别核验 `STUDIO_MOBILE_ENABLED=0`、`1`、未设置与非法值；前三者按契约注入布尔常量，非法值失败退出，个人 `VITE_*` 配置仍被拒绝。手机 Playwright 配置单独启动启用手机开关的 4310 服务。
- [x] 实现手机底部导航和独立样式；手机“返回桌面版”使用现有导航守卫，编辑中不得静默丢弃内容。
- [x] 验证桌面页面网络请求不加载手机模块；访问手机再返回桌面后，DOM、样式和事件行为与基线一致。
- [x] 通过本任务与桌面保护用例后，仅提交本任务路径。

**Exit:** 手机独立登录与浏览路径可用；桌面默认入口、云端启动页和页面样式无回退。首期通过直接链接试用，不在桌面添加自动跳转或提示条。

## Task 3：手机写作、键盘和弹窗

**Files:** 新增 `use-mobile-viewport.ts`；修改 `CloudPromptGeneratorPage.tsx`、`CloudApplyPromptDialog.tsx`、`Dialog.tsx` 的可选展示参数及手机 CSS；新增 `tests/e2e/mobile-writing.spec.ts`。

**Interfaces:** 共享页面接收 `presentation?: 'desktop' | 'mobile'` 与 `navigation?: WorkspaceNavigation`，默认 `desktop` 和透传导航。`Dialog` 增加 `className?: string`，默认空字符串。手机页把展示差异传入现有写作控制流程，保存协议与数据类型不变。

- [x] 写失败用例：输入/结果/历史切换不丢草稿；480p、720p 和时长、比例刷新后保留；长正文可编辑；手机弹窗完整可滚动。
- [x] 为慢保存、新输入、IME 合成事件、409 修订冲突与保存失败重试编写针对性用例；断言新输入和焦点保留，冲突不自动覆盖服务端内容。
- [x] 运行新增用例，确认失败原因属于缺失的手机体验。
- [x] 增加手机展示分支、可视区域监听、44 像素主要触控区域与安全区内边距；输入元素身份稳定，不因保存或旋转重建。
- [x] 为所有手机打开的 Portal 弹窗显式标记手机样式；卸载清理监听、临时状态和焦点约束。
- [x] 运行手机写作与现有写作专项回归；覆盖本次已经修复的输入焦点、清晰度和时间轴误判案例。
- [x] 通过后提交本任务路径；保留桌面原来的按钮顺序、文案、三栏/侧栏结构。

**Exit:** 手机完成写作、AI 预检查与确认、结果编辑和版本查看；桌面同一流程通过原有用例。模拟键盘事件不计为真实软键盘验收，留到任务 6 实机核验。

## Task 4：完成素材、生成与结果闭环

**Files:** 新增 `src/features/mobile/MobileVideoPage.tsx`；修改共享项目、素材、任务、结果页面、`CloudVideoRunPanel.tsx` 的可选导航/展示参数；手机路由装配；新增 `tests/e2e/mobile-creation-journey.spec.ts`。

**Interfaces:** 沿用 WorkspaceClient 的草稿、素材、项目命令、videoPreview、任务提交与查询接口；手机模块通过 `WorkspaceNavigation` 保持在 `/m/` 内。生成确认的规格、风险提示与幂等键语义沿用现有实现。

`MobileVideoPage({client, projectId, nodeId}: {client: WorkspaceClient; projectId: string; nodeId?: string})` 复用 `createCloudCanvasModel`、`CloudVideoInputEditor` 和 `CloudVideoRunPanel`，通过表单准备并保存图上的视频草稿。手机创建/应用/续写完成回调跳到 `/m/projects/:id/video?node=:id`；普通画布导航仍映射到 `/m/projects/:id/canvas`。

- [x] 写失败旅程：空项目 → 写作 → 上传/选择素材 → 设置 5 秒、9:16、480p/720p → 确认生成 → 任务 → 播放 → 修改 → 尾帧续写。
- [x] 增加快速连点、请求超时后查询、切后台返回、网络恢复和旧修订冲突用例；断言一次确认不产生重复任务，不自动再次收费调用。
- [x] 实现手机内的项目、素材、任务、结果布局和必要的生成确认适配，保证错误说明及重试入口可见。
- [x] 测试同账号双页面：手机主动保存内容后桌面重新读取可见；双方并发修改触发现有修订冲突处理，不覆盖另一端新内容。
- [x] 使用隔离数据库与假模型上游运行完整旅程；断言不存在真实付费模型请求。
- [x] 跑相关桌面生成、结果操作和素材回归，通过后提交。

**Exit:** 用户可在手机完成完整创作闭环。上传不中断、系统保存到相册和后台持续执行等能力必须按真实浏览器行为描述，不作未验证承诺。

## Task 5：手机画布查看与正文编辑

**Files:** 新增 `MobileCanvasPage.tsx`、`mobile-canvas-gestures.ts`、`tests/unit/mobile-canvas-gestures.test.ts`、`tests/e2e/mobile-canvas.spec.ts`；手机 CSS 和路由装配。

**Interfaces:** 消费现有 `Graph`、`Viewport`、`WorkspaceClient.readGraph` 与项目命令接口。`MobileCanvasPage({client, projectId}: {client: WorkspaceClient; projectId: string})` 自持观察视角；节点正文保存只提交指定节点的数据变更，不提交视角或几何属性。

- [x] 写失败用例：单指平移、双指缩放锚点、小地图拖动、手势取消、缩放后点击节点；断言过程中无项目写入或模型请求。
- [x] 实现手机独立手势状态和画布观察布局，复用纯几何工具；不改动 `CloudCanvasSurface.tsx` 的桌面事件处理。
- [x] 增加节点列表和全屏正文编辑，复用现有校验与保存命令；正文编辑保留输入焦点、修订冲突反馈。
- [x] 检查手机操作前后的服务端图数据：观察操作完全一致；正文保存仅指定内容与合理修订变化，位置、尺寸、边和云端视角一致。
- [x] 用桌面重新打开同一项目验证布局、视角、小地图拖动、文字节点填充空间及鼠标快捷键。
- [x] 通过后提交本任务路径。

**Exit:** 手机可浏览画布与修改正文，桌面布局不被手机观察行为改写。自由排版与连线不属于首期发布声明。

## Task 6：双端验收、试用与发布回滚

**Files:** 新增 `docs/review/mobile-web-acceptance-20261011.md`；完善移动测试配置；验证 `scripts/package-account-cloud.mjs` 的路由静态资源与哈希清单兼容新模块。

**Interfaces:** 输入任务 1 基线、任务 2–5 功能和发布包；输出可追溯到提交的双端报告、包哈希、试用地址与上一版本回滚目标。

- [x] 在手机开关关闭和开启的两种构建下运行桌面保护集；现有云端 UI 集完整运行一次，任何共享代码修复后重跑相关受影响检查。
- [x] 运行手机 360×800、390×844、430×932 与横屏矩阵；平板 768×1024、1024×768。覆盖 Chromium 触控模拟与 WebKit；模拟结果单独标注。
- [ ] 在真实 iPhone Safari 与安卓 Chrome 进行中文输入、键盘展开收起、旋转、相册/文件选择、播放下载、切后台与弱网恢复验收；没有实机证据时不得标注手机正式验收通过。
- [x] 运行前端类型检查、lint、单元测试、构建与包体积检查；共享协议如发生意外变化，先恢复边界并补服务端验证，不扩大本次改造。
- [x] 对比桌面生产构建的首屏 JS 请求：手机模块不得进入桌面加载集合，桌面初始 JS 总字节增量上限 5%；任一 JS 文件继续遵守仓库现有 500000 字节预算。
- [x] 提供预览入口 `/m/projects`；桌面沿用原地址，预览使用独立索引。代码、包和配置备份可追溯，详见验收记录。
- [ ] 真机验收及所有正式发布阻断项关闭后，将同一验证包作为手机适配正式版发布，并保持显式手机入口。
- [x] 发布前记录配置备份、上一版目录和切换步骤；预览脚本的健康检查和自动恢复实际执行过，不做数据库迁移。
- [x] 发布后核验桌面索引/窄窗口匿名入口、`/m/` 深链接刷新、HTTPS、全部静态资源哈希及匿名会话边界；登录后的核心功能在隔离环境验收，不使用用户正式项目试写。
- [x] 独立预览回滚通过恢复备份配置并重载 Nginx，桌面完整发布目录不切换；正式版本整体切换继续沿用原回滚脚本。构建开关关闭须重新构建发布；回滚不倒退数据库或已写入的兼容内容。

**Exit:** 手机实机关键流程与桌面保护集全部通过、视觉差异有结论、回滚路径可执行，才发布“手机适配版”。若只完成模拟环境验证，只能交付预览版及明确的待验收项。

## 执行时使用的验证命令

以下命令已在授权实施后执行，具体结果见手机预览验收记录。使用仓库固定 Node 22 运行环境；新增 Playwright 配置各自用 `webServer` 启动 4310 端口 Vite，复用原隔离后端夹具，避免混用另一个 4179 测试启动器。两份配置顺序执行；桌面配置包含原有云端 UI 全集和新增保护集，手机配置包含手机专项集。

```powershell
npm run typecheck
npm run lint
npm run test:unit
node node_modules/@playwright/test/cli.js test --config playwright.desktop-guard.config.ts
node node_modules/@playwright/test/cli.js test --config playwright.mobile-ui.config.ts
npm run build
```

包体积检查将报告输出至本任务目录，避免覆盖既有验收证据：

```powershell
$env:STUDIO_BUNDLE_REPORT = 'work/mobile-adaptation/bundle-budget.json'
npm run test:bundle
Remove-Item Env:STUDIO_BUNDLE_REPORT
```

## 发布阻断条件

- 桌面现有关键流程出现新增失败，或截图差异未解释。
- 手机 CSS/模块被无故加载到桌面入口，或返回桌面后残留手机布局、手势、焦点限制。
- 手机观察行为改变桌面启动页、画布视角或节点布局。
- 自动保存丢输入、并发覆盖内容、重复生成或跳过付费确认。
- 关键弹窗在手机不可操作，或软键盘遮挡导致流程无法完成。
- 手机实机关键流程无证据、发布包无法追溯或回滚目标未经核对。

## 计划自检

- 首期范围覆盖入口、账号、写作、素材、生成、结果、修改、续写与基本画布操作。
- “桌面不回退”同时落实为路由、CSS、共享组件默认值、数据副作用、资源加载和验收门槛。
- 任务间接口统一使用 `WorkspaceNavigation` 和可选 `presentation`；桌面默认行为不变。
- 五类高风险条件均分配到对应任务，并有具体可观察的通过标准。
- 本计划随后获授权实施，Task 2–5 已实现；正式发布与真机、原生缩放待验收项保持未完成标记。
