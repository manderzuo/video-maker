# 本机 Agent 通道 v1

这项通道只连接同机已经打开、拥有有效写者租约的画布和显式配置的外部 Agent。它不是生成后端，不读取 Core Key、历史配置、DPAPI、生产数据库，不自动安装或启动模型宿主。

在项目根目录使用 E 盘工具链，运行 `npm run companion:build`。明确启动时设置 `STUDIO_ORIGIN` 为实际 Studio 页面的完整 origin（例如本地测试 `http://127.0.0.1:4179`），可设置 `STUDIO_AGENT_PORT`，默认4181，再运行 `npm run companion:start`。服务仅监听127.0.0.1，控制台在此次显式启动时显示临时配对 token 一次。该 token 独立于 Core Key；不写入文件、项目包或设置导出。关闭进程后失效。浏览器的本地网络权限提示由用户处理，不关闭浏览器安全。

所有连接/授权/心跳/断开请求只接受固定回环 Host、登记的精确网页 Origin，以及 `Authorization: Bearer studio-agent-…`。token 不能放URL。浏览器授权还需要仅握手网页持有的独立随机 nonce；外部 Agent 不能凭配对 token 改授权限。默认只读、选区为空、有效期30分钟；没有显式用户续授不延长。网页心跳失联15秒后通道拒绝操作，写者epoch改变时网页立即撤权。

协议路径：`POST /canvas/connect`、`POST /canvas/authorize`、`POST /canvas/heartbeat`、`POST /canvas/disconnect`；`GET /agent/state?sessionId=…` 只返回非秘密会话元数据。不存在网页时返回 `canvas_not_connected`。授权限定projectId、tabId、epoch、选区/节点/项目范围及read/propose。运行始终另走浏览器确认，不随提案批准授权费用。HTTP输入/响应限制256KiB。

当前仅核验了本机 HTTP 协议及本地测试客户端，`/health` 明确报告外部模型宿主未配置。MCP工具在T41接入，实际外部宿主兼容性仍需核验；不宣称兼容所有宿主，也不把Mock当作真实模型回执。既有 trae-maker-MCP 视频工具保持独立，没有修改其代码或部署。

固定只读参考：infinite-canvas `dab19adc0847e32e39b7fc8ff90cb392561fb826` 的 `canvas-agent/src/canvas/session.ts`（SHA256 `4b150c8ae7215c39facab1b4446c0e192f98c5bd4fc3077283a6acb8c1f26003`）与 `canvas-agent/src/server/http.ts`（SHA256 `49ea671e8bc6da5da3fbcfe76905940863b2326cc47beaa6e7941d17c58a82dd`）的协议/状态定义。没有迁移其通用模型客户端、任意技能管理、查询token、持久化配置或远程执行接口。
