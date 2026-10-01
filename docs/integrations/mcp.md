# 本机画布 MCP 契约与核验范围

独立 companion 与旧 trae-maker-MCP 并存。没有修改来源仓库、旧视频工具或生产部署。仅已打开网页返回的当前项目、标签、写者 epoch 和有效授权可用；Core Key 始终留在网页内存，不进入 MCP 参数、响应、环境配置或上下文。

## 已实现的固定协议

固定 MCP 版本 `2025-03-26`，标准 stdio UTF-8 行消息、JSON-RPC 2.0、初始化/initialized、ping、tools/list、tools/call；最多16项 batch。不会宣称兼容全部宿主。依据官方 [stdio 传输](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)、[生命周期](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle) 和 [工具](https://modelcontextprotocol.io/specification/2025-03-26/server/tools) 规范实现该子集。未提供资源、任意文件读取、通用模型客户端或 Streamable HTTP MCP。

| 工具 | 行为 | 浏览器授权与执行边界 |
| --- | --- | --- |
| canvas_get_state | 当前授权节点和范围内连线、已保存修订 | 不返回 Run、最终请求、Key、Blob、全部素材库或越界节点 |
| canvas_get_selection | 授权范围内的当前选区 ID | 不扩大授权；组合子节点按范围裁剪 |
| canvas_propose_ops | 保存原项目/会话的结构化提案 | propose 权限；最多100操作/256KiB；不应用画布 |
| canvas_apply_proposal | 打开浏览器的原提案审阅入口 | 用户逐项或全部确认后走唯一事务命令入口；工具本身不写图 |
| canvas_request_run | 请求网页预检/生成确认单 | 原选区或节点范围；独立费用勾选和确认后走已有 approval/queue/submit；不直接提交 |

request_run 的 `requestId`、节点清单不可改写。同一会话中的并发重复请求共用一次预览；它不代表已批准、已建 Run、已收费或成功生成。确认单取消或失效后不得把原请求当成新尝试自动重发。撤权、失联、epoch 变化会拒绝旧会话操作与旧 Agent 确认单；普通页面操作另行显式预检。停止 Agent 对话不取消远端视频，不退款。

## 显式启动与配对

在 E 盘项目根使用 `scripts/use-local-toolchain.ps1`。`npm run companion:build` 生成两个本机入口。按 [连接通道说明](agent-relay.md) 明确启动回环 relay、打开网页并配对独立临时 token；在网页设置范围和 read/propose 权限。浏览器私有网络提示需由用户处理。

适配宿主的 stdio 命令为 E 盘 Node 22 执行本项目 `companion/dist/mcp.mjs`；工作目录是实际项目根。仅为该显式进程设置 `STUDIO_AGENT_ENDPOINT`（例如 `http://127.0.0.1:4181`）、`STUDIO_AGENT_TOKEN`（独立临时配对令牌）、`STUDIO_AGENT_SESSION`（网页显示的精确会话 ID）。这些不能填 Core Key；不要将 token 写入项目、导出或日志。不自动安装宿主配置，不自动启动模型。无需新依赖，使用 T03 锁定的 Node/Vite/Zod。

relay 内部 HTTP 使用 `/agent/tool` 请求与 nonce 保护的 `/canvas/poll`、`/canvas/reply`。只有当前网页能取出和回答其工具请求；外部 Agent 不能持配对 token 授予自身权限或替网页回复。精确 sessionId 必填；不自动选择最后一个项目。最多16待处理/100保留请求，单次8秒超时，已决定回执最多留在会话内60秒后可清理。网页串行处理，1秒间隔且无重叠；断开会撤销待处理请求。参数和响应限制256KiB、未知命令拒绝、stdout 仅协议 JSON。

## 已验证与未验证

已验证原生本机 HTTP、实际浏览器 IndexedDB 读写、原生 stdio 子进程握手与工具列表、越权拒绝、并发重复请求、撤权后的收费确认阻断；浏览器收费路径全部为本地 Mock 和假 Key。

真实模型宿主尚未配对，宿主兼容性、浏览器实际网络许可、真实 Core/收费、跨平台安装均未验收。不把合同测试称为真实 Agent 或模型回执。用户统一验收与独立审查待进行。环境未提供这些条件时门控真实接入，不伪装可用。
