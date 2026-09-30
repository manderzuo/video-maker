# 本批实际锁定工具链

项目：E:\trae-studio\TRAEWORK\aiwork-studio。运行时、缓存、下载和临时目录均在 E:\trae-studio\tools。

- Node22.23.3：E:\trae-studio\tools\node-v22.23.3-win-x64\node.exe；官方 Windows x64 zip 的 SHA256 已对照官方 SHASUMS256.txt。下载核验过程见 T03 证据与本机 work/node22-shasums.txt（工作产物，不声明为已提交文件）。
- npm11.6.2：E:\trae-studio\tools\npm-11.6.2；本机已装同版本作为只读来源复制到 E 盘，E:\trae-studio\tools\bin\npm.cmd 使用 E 盘 Node22。
- scripts/use-local-toolchain.ps1 只设置当前进程 PATH、E 盘 TEMP/TMP 与 npm cache；不变更全局运行时设置。
- package.json 的全部依赖为精确版本，package-lock.json 为实际生成并经过 npm ci 的安装锁，.node-version 与 engines 固定兼容范围。
- React/ReactDOM19.2.8、Zustand5.0.15、Zod4.3.6；TypeScript5.9.3、Vite7.3.6、React 插件5.2.0、Vitest4.1.11、Playwright1.58.2、ESLint10.11.0、typescript-eslint8.71.0、fake-indexeddb6.2.4；类型包以 package/lock 实际值为准。
- 浏览器验收使用本机 Edge 的隔离上下文；自动测试服务固定 loopback4179，reuseExistingServer=false。

npm10.9.9 对 Vitest4.1.11 的可选 peer 解析实际发生 Arborist edgesOut 崩溃，多次复现。诊断时短暂安装 Vitest4.0.18 能成功但 audit 报漏洞，已恢复修补版本4.1.11；改用 npm11.6.2 后同目标依赖成功安装与锁定，最后 npm ci exit0，npm audit --json 为 0 个已知漏洞。不使用 force/legacy-peer-deps 绕过，不把环境错误算行为红灯。

.github/workflows/verify.yml 已定义 Windows/Node22/npm11 的锁定安装与检查，尚未推送或远端执行。未来 runner 的 npm 安装不等于本机全局设置变更。规划来源审计依赖真实 E 盘来源快照，移到其他宿主须重新提供真实来源路径证据；不能用本机自检冒充远端 CI 通过。

预检查 T03-preflight.json 为当时未安装前的历史记录，最终结果以 package-lock、evidence/T03.json、logs/T03-ci-final.log 及 logs/BATCH-audit.json 为准。
