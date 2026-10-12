# studio.gemstory.cn 部署记录

## 2026-10-09 07:12（UTC+8）失败原因展示修复

按用户明确要求“把我们的改动部署和推送”，沿用原有本地构建、SCP、SSH 发布流程。可运行工作台的前端来源为本地提交 `6bc1e50ed7321181971b0485b4c65164c2c4ede1`，已合入原项目 `feat/aiwork-studio`。新目录 `/opt/aiwork-studio/releases/20261009-f0-6bc1e50`，入口 `/assets/index-ELLHqoyJ.js`。具体失败原因、上游错误码和独立账务状态在任务详情、画布队列及刷新恢复后保留。

原 QA62 目录及旧静态资源保留，实际备份在 `/opt/aiwork-studio/backups/20261009-f0/`，包括前版归档、本站服务/代理/运行配置和原版本指针。先经独立回环端口4190核验，再原子切换 current；本次沿用原服务 bundle 和运行配置，PID及本站/其他站点配置哈希保持一致。激活脚本有失败回退，未主动执行生产回退演练。

本轮实际核验：相关单元测试79/79，任务中心/画布浏览器用例2/2，类型检查和生产构建退出0；49项公网新资源哈希、6项前版入口资源和动态运行配置读取通过，HTTPS证书校验保持开启。全部证据位于 `work/deploy-20261009-f0/`，发布报告见 `docs/review/F0_DEPLOYMENT_20261009.md`。本轮没有收费生成，不代表全项目验收。

账号/API云端开发分支仍需接完工作台、持久文件与完整迁移，当前入口包含占位页，未作为本站线上入口发布；其本地实现和未完成状态另行推送保留。

## 2026-10-08 17:41（UTC+8）连接修复补丁

用户明确授权“部署”后，已上线 QA62 两处修复：新增文字连接刷新登记缓存、设置页恢复默认选择时保留视频授权。当前发布目录 `/opt/aiwork-studio/releases/20261008-qa62-ca7e248`，页面入口 `/assets/index-D4hvJqM8.js`。构建以原线上源码 `2e61b9f` 加 `ca7e248` 中三个相关源文件为基础；未将后续画布等功能一起发布。

保留原版 `/opt/aiwork-studio/releases/20261008-4231f4e`，原子切换 current，原服务进程 PID 2724795、运行配置和其他站点配置保持不变。新目录保留旧静态资源，未刷新页面仍可读取原资源。回退记录：`/opt/aiwork-studio/backups/20261008-qa62/`；准确来源见当前 deployment-manifest.json，首发清单保存在 base-deployment-manifest.json。

发布基线相关浏览器 7/7 通过；公网 48 项新静态资源哈希及 6 项旧入口资源检查通过。用户当前 Chrome 连续两次刷新、手动文字检测及随后两轮自动检测通过，文字与视频指示灯均绿色，原视频授权绑定保留。本轮没有收费生成。完整证据见 `docs/review/QA62_TEXT_CONNECTION.md`、`docs/review/evidence/QA62.json` 和 `work/qa-20261008/deploy-qa62/`。

## 首次部署记录

2026-10-08，按用户本次明确指令部署到自有腾讯云服务器。访问入口：https://studio.gemstory.cn 。这是当前开发版本的服务器部署，不代表独立审查、全部业务验收或第三方前端标识许可已经完成。

## 部署位置

| 项目 | 配置 |
| --- | --- |
| 服务器 | 腾讯云北京 Ubuntu 24.04，49.232.128.118 |
| DNS | studio A → 49.232.128.118，TTL 600 |
| 当前版本 | /opt/aiwork-studio/releases/20261008-4231f4e |
| 版本入口 | /opt/aiwork-studio/current |
| 服务 | aiwork-studio.service，www-data 用户，开机启动 |
| 服务端口 | 127.0.0.1:4189，仅本机监听 |
| Node | /opt/aiwork-studio/runtime/node-v22.23.3-linux-x64/bin/node |
| 非秘密运行配置 | /etc/aiwork-studio/runtime.json |
| Nginx | /etc/nginx/conf.d/aiwork-studio.conf |
| 证书 | /etc/letsencrypt/live/studio.gemstory.cn/ |
| 首张证书到期 | 2027-01-06 11:10:38（北京时间） |
| 原站点备份 | /opt/aiwork-studio/backups/20261008/ |

Node 22.23.3 从 nodejs.org 官方下载，归档 SHA256 为 `df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de`，安装前核对一致。没有替换服务器其他应用使用的 /usr/bin/node。

## 使用与数据

新域名和原来的 http://127.0.0.1:4188 是不同的浏览器存储来源。旧项目、素材、执行记录和 Key 不会自动出现在新域名。旧站点和浏览器数据保留。需要作品时，在原站点导出包含素材的项目备份，再在新站点导入；不能以旧包覆盖执行记录或恢复旧任务的收费授权。

用户当前 Chrome 中已保存视频网关地址 `https://api.gemstory.cn`，需要用户在新站点设置中填写普通用户 Key。文字 API 对应 `https://opencode.ai/zen/go/v1`；文字 Key、模型选择与启用仍在浏览器中完成。部署没有读取或搬运旧 Key，没有把凭据写入服务器配置，没有执行收费生成。其他浏览器也要独立设置连接。

项目仍保存在各浏览器本地；本次部署没有增加云端项目同步、登录账号或多人协作数据库。本机 Companion 在 HTTPS 页面下的配对行为未验证。

## 公网适配

`scripts/serve-local.mjs` 新增可选 `allowedRegistrationTargets` 和 `--allowed-targets`。本机默认行为保留；服务器通过 `deploy/hosted-allowed-targets.json` 只准许登记指定的 Core 和文字服务。未登记地址、本机目标、变更服务种类等返回 403；不能利用连接设置把服务器变成任意代理。

Nginx 只接收本站 Origin 或无 Origin 的读取请求，再转换为原本机服务要求的 Host/Origin。缺少 Origin 的设置写入仍被拒绝。Cookie 不转发，管理路径被拒绝，收费路径保留幂等键要求和禁用自动重试的行为。每次调用的 API Key 由浏览器提供，服务自身不持有共享用户 Key。

HTTPS 签发首次因一个验证节点连接超时失败；确认其他验证节点成功读取后，第二次签发成功。证书通过现有 certbot.timer 续期；新增仅针对本站证书的 deploy hook，续期后检查并重载 Nginx。已检查 timer 开启、hook 语法正确；未执行续期模拟。

首次服务启动因绝对软链接路径与模块入口判定不一致而正常退出。systemd 改为在 WorkingDirectory 内用相对 `server.mjs` 启动，实际服务已确认运行。Nginx 平滑重载后的即时探测曾取得旧证书，随后重新检查服务器与本机访问均通过证书校验；没有关闭 TLS 校验。

## 本次实际检查

- Vite 生产构建退出 0，输出放入独立 work 目录，未覆盖当前本机 dist。
- 连接登记边界检查 9/9 通过，含 2 项新增公网目标限制用例；新增用例先观察到失败，再实施限制。
- 线上检查 11/11 通过：HTTP 跳转、HTTPS 页面及初始资源、登记数据、Core 健康、无 Key 拒绝、跨来源拒绝、管理路由拒绝、任意目标拒绝、缺少 Origin 的写入拒绝、指定服务登记、配置和源码不可公开读取。
- 浏览器成功创建部署验收项目，画布显示已保存，刷新后相同项目恢复；设置页可保存视频网关地址。没有生成任务。
- 系统服务启用并运行，只监听 127.0.0.1:4189。现有 api 与 filmcrew 的 Nginx 文件哈希保持一致，原 API 健康正常。
- 公共页面构建与服务包没有匹配明文 Key/私钥标记；运行配置经过已有无凭据校验。此扫描不能替代全面审计。

未运行全项目 verify、收费视频/文字生成、生产数据迁移或独立审查。原文档中的人工视觉签收和前端标识授权待办没有因此消除。合法版权文本保留在界面和部署包。

本机证据：`work/deploy-20261008/`。其中 live-checks.json 为实际线上检查；registration-checks.log、https-check.log、install-runtime.log、dns-record.jpg、studio-canvas-restored.jpg 为对应记录。

## 更新与恢复

本次上传归档 `aiwork-studio-20261008.tar.gz` 的 SHA256：`9afbfc1313190909b3405ea127f4383efda0dd381b9db87a128154e8eb6e2d77`。源基准为 `4231f4edc7bca9c53c948283c1060b07a9700954`，另含本次 serve-local 的目标限制修改；完整发布文件哈希在 deployment-manifest.json，不把基准提交误写为完全相同的源码树。

后续在仓库根目录构建到新的空目录，再执行：

```sh
npm run build -- --outDir work/<release>/dist
node --experimental-strip-types scripts/package-hosted.mjs --output work/<release> --runtime deploy/local/<reviewed-runtime>.json
```

该打包命令要求已有 dist，生成服务 bundle、允许目标清单、无凭据 runtime、版权文本和文件哈希。打包产物不包含浏览器数据或 Key。运行依赖全部打入 bundle，服务器无需安装 npm 项目依赖。

上传到新的 /opt/aiwork-studio/releases/<release> 后先用独立回环端口检查，再切换 current，重启 aiwork-studio 并验证 HTTPS 与健康。保留前一版目录。回退时将 current 指回兼容的前一版并重启服务；不得删除浏览器库或用旧备份覆盖执行状态。

本次为该域名首个版本，没有更早的 Studio 线上版本可回退。需要撤下时可停用 aiwork-studio 并移出本站 Nginx 配置，经 nginx -t 后平滑重载；原站点配置和备份保留。上述恢复步骤是操作记录，未执行破坏性回退演练。
