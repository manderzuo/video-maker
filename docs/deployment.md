# 独立本机启动与离线审阅包

当前是供统一验收的离线构建。尚未发布，用户视觉/人工输入法与键盘验收、独立审查、前端标识授权和真实 Core 联调均待完成。

开发使用锁定 Node22.23.3/npm11.6.2。打包入口仅依赖 Node22.x 内置功能，启动门槛设为22.18.0或更高22.x，实际只核验当前22.23.3。无需安装前端开发依赖即可运行解压后的静态站和已打包 companion。

1. 把离线审阅 ZIP 解压到自己选定的 E 盘目录，保留全部版权文件；检查旁边的 SHA256 文件。
2. 在解压目录执行 `powershell -File ./scripts/start-canvas.ps1`，打开 `http://127.0.0.1:4188`。停止该终端即可停止服务。端口冲突会失败，不自动选择其他网卡/端口。
3. 默认运行配置没有 Core 目标、账号或 Key；可离线创作、保存和备份。网络生成保持未连接/待核验。
4. 需要已授权的本机 Agent 时另行手动运行 `scripts/start-companion.ps1`；临时配对 token 只显示在该终端，不写配置/日志/项目。网页配对、scope和写者epoch仍需显式授权。MCP使用 `node companion/dist/mcp.mjs`，完整契约见 `docs/integrations/mcp.md`；发行包不配置模型执行宿主，不能称为已验证完整自主Agent服务。

本机 Node 服务只提供静态文件和固定注册目标代理，不保存项目、建立账号或处理计费。仅绑定127.0.0.1，严格Host/Origin，禁止路径穿越/符号链接出根、未知Core路径、跳转跟随和自动请求重试；浏览器仍通过同源公开用户API。请求仅传Authorization、JSON类型和幂等头，不传Cookie；源Key只来自当前请求，不写日志/文件。普通POST上限8MiB、素材POST46MiB。Core继续负责授权、scope、准入、归属和账务。

`deploy/canvas-runtime.example.json` 默认空注册。经另行授权后才可建立非秘密运行配置：`connections`是T24已有的profile+deployment contract；`coreTargets`每项只含`proxyBase`、完全匹配profile.originSnapshot的固定`origin`和默认false的`allowWrites`。不得放任何Key/Token/Cookie。能力声明必须来自已核验部署证据，不填写虚构live_verified。启动命令可用 `-Runtime <配置路径>`；同源公开的studio-deployment.json仅返回connections，不返回凭据。

生产静态服务使用现有HTTPS Web服务器；Nginx示例是未部署的准备文件，默认离线且只监听本机8080。固定目标、证书信任链、实际Host/Origin和资产/普通请求体限制需按部署环境核验；本机未安装或运行Nginx，不声称该示例已通过nginx -t或生产验证。不要把vite preview当生产服务，不启用通用URL代理或财务/admin接口。真实业务、付费、推送和部署需额外明确批准。

构建把合法版权文本放入仅数据的legal-notices代码块，通过“第三方许可与来源”手动查看；旧包格式标识仅在legacy-migration块作显式本地迁移匹配。品牌扫描分别列出这些可审查例外，不删除权利声明。运行依赖六份MIT许可、原始来源许可及前端标识例外均随包保存；去标识授权仍未澄清，正式发布扫描保持阻断。

开发检查：`npm run test:distribution`使用实际dist和本机静态启动器；普通开发浏览器套件单独运行。`npm run companion:build`把所需Zod一并打入本机入口，ZIP不包含node_modules、用户配置、开发测试、生产数据、Core数据库、Key或source maps。`node scripts/package-release.mjs --offline-review`生成离线审阅ZIP及逐文件/整包SHA256；带未提交源修改的包明确标dirtySources，供开发自检，不冒充审查commit一致的正式发行。最终交接再生成绑定实际已提交源码的审阅包。
