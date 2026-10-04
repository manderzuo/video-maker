# AI WORK Studio

AI WORK Studio 是独立浏览器创作工作台，支持项目与素材管理、可编辑画布、提示词整理和生成、视频任务跟踪、结果审片及受控 Agent 提案。

本仓库为开发与验收版本。主要功能已经实现并经过本地回归和部分真实服务验证，人工视觉、独立审查及部分服务能力仍待验收；上传源码不代表正式发布。

## 功能

- **项目与素材**：新建、重命名、复制、归档、回收站恢复、素材导入与预览。
- **创作画布**：文本、素材、视频草稿及固定结果节点；移动、连线、复制、组合、布局、缩放、定位及撤销／重做。
- **提示词**：本地规则整理、模板与来源管理、独立生成页面和画布面板；点击“AI优化”直接使用设置中的文字模型，合格结果自动填入正文；旧请求结果未知时需核对重复收费风险。
- **视频生成**：节点上的“生成视频”、顶栏“生成选中视频”和“批量生成视频”；生成前展示最终输入与费用确认。
- **任务与审片**：独立保存执行、查询、交付和账务状态；轮询、播放、版本比较、结果引用回画布及下载。
- **本地数据**：IndexedDB 事务保存、恢复日志、多标签写者租约、任务单飞、备份导出与校验导入。
- **Agent 协作**：选择上下文、明确授权、生成修改提案、审阅后应用与撤销；本机 Companion 和线上文字模型分别连接。

### 画布连线

按需添加节点，从节点右侧的输出圆点拖到视频草稿左侧的同类型输入圆点。文字、图片、视频用不同颜色和文字标识；拖动时显示预览线并提示兼容输入。也可依次点击两个端口，键盘 Enter／空格操作同样可用。放到空白处或按 Escape 取消。

点击连线后按 Delete／Backspace，或右键选择“断开连接”，会同时解除该输入关联并保留两端节点；需要改接时先断开，再连接新的输入。同一段文字可以连接多个视频草稿，断开其中一条不会影响其他连接。连线变更支持撤销、重做及保存恢复；只读画布和锁定的视频节点不能修改连接。

连线只组织下次生成的输入，不触发 AI 调用。已经提交的任务继续使用原先保存的快照，删线不会取消任务或改写历史结果。素材类型和执行数量仍按当前服务契约校验，未核验的服务能力不开放生成。

## 架构与边界

```text
浏览器画布／提示词生成
  ├─ 独立文字 API → 经本机受限代理访问文字模型
  └─ Trae-core 公开用户 API → AI Work 执行网关
```

Core 负责授权、作用域、准入、任务归属和账务。Studio 保存创作数据、素材、草稿与执行记录，不访问 Core 财务数据库，也不提供账号池、充值或独立计费系统。

本地提示词整理不联网。创建流程、插入画布、应用提示词或接受 Agent 提案不等于授权收费生成。图片／音频生成、远端取消、作业改版／续写，以及未核验的作业读取和幂等重放能力保持门控。

## 环境

基准工具链：**Node.js 22.23.3、npm 11.6.2**。依赖版本由 `package-lock.json` 锁定，使用 `npm ci`，不要改用 `@latest`。

`scripts/use-local-toolchain.ps1` 是原实施机器的辅助脚本，包含该机器的 E 盘路径；其他机器直接使用自己的 Node/npm 环境即可。

## 安装与启动

```sh
git clone --branch feat/aiwork-studio https://github.com/manderzuo/video-maker.git
cd video-maker
npm ci
npm run build
node --experimental-strip-types scripts/serve-local.mjs --root dist --port 4188
```

打开 <http://127.0.0.1:4188/projects>。默认仅监听本机，初次启动没有 API 授权；可以先创建项目和整理提示词。

开发模式：

```sh
npm run dev -- --port 4178
```

Vite 开发服务主要用于 UI 和本地 Mock 开发。需要通过设置连接真实 API 时，使用上面的生产构建加 `serve-local.mjs`，以提供受限代理与连接登记接口。

**保持相同浏览器、协议、主机和端口。** `127.0.0.1` 与 `localhost`，或不同端口，是不同的数据来源；切换后不会自动看到原 IndexedDB 项目。先导出并核验备份，不要清空原浏览器数据。

## 连接文字和视频 API

在“设置 → 连接与授权”中分别配置：

| 连接 | 填写内容 | 用途 |
| --- | --- | --- |
| 独立文字 API | 服务名称、兼容 Chat Completions 的基础／完整接口地址、文字 Key、模型 | 提示词优化和线上 Agent 文字提案 |
| 视频执行网关 | Trae-core 服务地址、普通用户 Key、已核验的视频模型 | 视频提交、查询与结果获取 |

目前使用过的文字接口形式为 `https://opencode.ai/zen/go/v1/chat/completions`，文字模型为 `deepseek-v4.1-flash`。地址处理保留 OpenCode 的 `/zen/go/v1` 前缀，代理转发经校验的会话标识及应用身份。实际模型可用性以自己的服务与模型目录为准。

Seedance 视频通过 Trae-core 连接。服务名称、模型目录读取、当前标签页授权、模型选择和真实生成验证是不同状态；“只读连接成功”不代表已经生成或获得收费许可。

普通 Key 只保存在当前标签页内存，刷新后需重新输入。不要把 Key 写入源码、运行配置、项目包、诊断或 Git 提交。`deploy/canvas-runtime.example.json` 是无凭据示例，本机实际配置放在忽略的 `deploy/local/` 中。

从已有提示词生成视频：

1. 在文本节点点击“从文本创建视频流程”。
2. 检查视频草稿的模型、时长、比例与参考素材。
3. 点击视频节点的“生成视频”或顶栏“生成选中视频”。
4. 审核确认单并明确确认费用后提交，在任务中心跟踪结果。

提交前保存最终请求和幂等键；发送后冻结请求。结果不明时保留原身份，不自动换键重发。下载失败只重试下载；停止轮询不表示取消任务或退款。

## Agent 协作

“提案”是模型建议的画布修改，需要先审阅再应用。线上文字模型可提出受限文字与位置修改；本机 Companion 提供明确配对的工具通道，不自动启动外部模型宿主。

可选本机 Companion（PowerShell）：

```powershell
npm run companion:build
$env:STUDIO_ORIGIN = 'http://127.0.0.1:4188'
npm run companion:start
```

按终端提示在画布的 Agent 面板配对。临时配对令牌独立于 Core Key，只授予需要的上下文和权限。完整外部 LLM 宿主仍待验收。

## 开发与验证

自动测试使用本地 Mock 与假 Key，默认不调用真实业务接口。

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
npm run test:security
npm run test:coverage
npm run build
npm run test:acceptance
npm run companion:build
npm run test:distribution
```

浏览器测试默认在本机使用 Edge；需要 Chromium 时，先安装锁定 Playwright 对应浏览器，并设置变量。例如 PowerShell：

```powershell
npx playwright install chromium
$env:STUDIO_TEST_BROWSER = 'chromium'
npm run test:e2e
```

其他检查：`npm run test:performance`、`npm run test:bundle`、`npm run test:trace`。`npm run verify` 组合执行主要门槛；当前 `T02-G02` 人工视觉签收尚未完成，规划检查可能因此非零退出，不能将其绕过或宣称完整验收全绿。

真实调用需要另行明确授权、费用范围和服务条件；`test:live` 的授权检查本身不是实际生成通过记录。上传源码不会触发真实生成。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/domain/` | 领域类型、Schema、提示词规则及状态机 |
| `src/application/` | 项目命令、提示词与视频执行流程 |
| `src/features/` | 页面、画布、任务、设置及 Agent UI |
| `src/adapters/` | Core 与独立文字 API 适配 |
| `src/infrastructure/` | IndexedDB、租约及部署登记 |
| `src/security/` | 会话凭据、脱敏及诊断边界 |
| `companion/` | 本机 Agent 通道与 MCP 适配 |
| `scripts/` | 本机服务、检查与离线审阅打包 |
| `tests/` | 单元、浏览器、网络安全与性能测试 |
| `docs/superpowers/` | 已批准设计和分阶段实施计划 |
| `third-party/` | 来源、版权声明和许可证 |

## 验收状态与限制

当前开发状态、实际验证口径与待验收项见 [仓库状态](docs/review/REPOSITORY_STATUS.md)。原计划材料见 [设计文档](docs/superpowers/specs/AIWORK_Studio_Design_v1.md)、[提示词设计](docs/superpowers/specs/AIWORK_Studio_Prompt_Generation_Design_v1.1.md) 和 [升级／恢复操作单](docs/release-runbook.md)。

本机原始验收数据、用户作品、下载结果、浏览器配置文件、临时配对令牌和真实凭据不随此次上传。历史计划与测试证据按各自日期理解，不替代当前用户签收或独立审查。

本轮不包含视频拼接、完整剪辑器、多人云协作、任意远程脚本或插件商城。正式部署、生产迁移及最终发布需要完成相应门槛。

## 第三方来源与版权

选择性参考／复用 `infinite-canvas` 的画布逻辑和 `prompt-for-seedance-gptimage2.5` 的视频提示词规则；Trae-core、trae-maker 和 trae-maker-MCP 为固定版本的接口与边界参考。自有 UI、Core 适配、创作数据边界与发布配置另行组织。

完整权利声明见 [THIRD_PARTY_NOTICES](third-party/THIRD_PARTY_NOTICES.txt)、[许可证目录](third-party/licenses/) 和 [来源台账](docs/review/source-manifest.json)。第三方版权与许可证保留，前端标识授权尚未澄清；不能据此宣称完全自研或正式发布已获许可。本仓库尚未另行指定自有代码的开源许可证。

## 视频结果与尾帧续写

结果页以大幅视频预览为主，常驻“下载”“加入素材库”“尾帧续写”。任务编号、请求快照、结果引用操作和版本比较保留在折叠详情。已有结果可以直接下载；加入素材库会确保本地缓存可用，重复操作不会复制同一素材。

尾帧续写在本地提取末尾可解码画面，预览后填写下一段内容，再创建连接好图片参考、提示词和视频参数的画布草稿。原视频和原任务保持不变，草稿可以撤销；创建草稿不提交生成、不消耗生成积分。后续生成仍走现有服务能力校验和提交确认。当前使用普通图片参考，不保证严格首帧锁定，不调用未核验的续写接口，不自动拼接。


### 续写润色与执行参数

尾帧续写或素材继续生成的文本节点、视频节点均支持“AI润色”。先在设置启用独立文字API，视频节点会按连线读取提示词，优化结果写入面板正文；使用“应用到源节点”保留素材连线。刷新页面后需要重新输入文字Key。

视频界面选择的时长、画幅和清晰度决定最终执行规格，提示词中的旧规格不会覆盖选择。支持范围以服务登记为准。Seedance固定Core源码审阅范围为2–15秒、6种比例及480p/720p/1080p/4K；仅5秒、16:9、480p已验证真实成片，其他组合仍需实际生成验收。

既有本机网关可以通过 `node --experimental-strip-types scripts/apply-seedance-spec-review.mjs <runtime.json> <固定Core源码的user_routes.rs>` 应用参数清单；脚本核验源码哈希，不改变服务目标、原授权、路由或写入许可。详情见 [调整记录](docs/superpowers/specs/AIWORK_Studio_Continuation_Polish_2026-10-04.md)。

图片参考需要网关提供 `/v1/assets`、普通用户 `assets:write` 权限和 `image_asset_ids` 视频请求字段。本机单图参考登记见 [契约记录](deploy/seedance-image-reference-review.json)；对既有网关可运行 `node --experimental-strip-types scripts/apply-seedance-image-reference-review.mjs <runtime.json> <固定Core源码src目录>`，源码哈希不符会拒绝应用。脚本保留服务/授权身份、视频规格与写入许可，仅登记单张图片和32 MiB上传上限；视频参考、远端续写和取消继续门控。当前图参考不保证严格首帧锁定，也不自动拼接。

2026-10-04 已在用户原项目实际完成一次尾帧 PNG 上传及 Seedance 图片参考生成，5秒/16:9/480p 请求成功、成片本地缓存并播放。实际媒体为5.088秒、864×496，账务响应未提供扣点信息；其他规格没有因此获得真实验证。结果证据见 `docs/review/evidence/QA45.json`。
