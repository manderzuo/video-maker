# 下一步与恢复点

用户已授权按原计划继续T07–T50，全部实现后统一测试验收。此前T01–T06检查点说明已被此授权替代；实施者自检不代表独立审查或视觉认可。

真实项目：E:\trae-studio\TRAEWORK\aiwork-studio。模型由用户在宿主选择，当前工具不可验证。恢复时读取 IMPLEMENTATION_AUTHORIZATION.md、IMPLEMENTATION_STATUS.json、EXECUTION_PROGRESS.md、当前任务原分计划及对应证据，再核验Git状态；保留现有更改。

- 已实施到T36，当前分支feat/aiwork-studio。T32真实执行仍要求部署与完整父版本规格证明，固定Core公开GET未返回加密规格快照，禁止以本地requestedSpec替代或回退普通生成。下一顺序执行T37连接/存储/偏好设置、T38恢复与活动。Agent分支仅到对应T39阶段创建。逐项最新证据以IMPLEMENTATION_STATUS.json为准。
- 每任务先实际行为红灯，再实现/目标及相关回归，记录退出码、数量、日志和实际截图；用户统一验收放在末尾，独立审查仍待用户或安排者。
- T02仅字号认可，全视觉/125%与150%真实缩放/前端标识许可待核验；verify中的规划批准门槛不应改成已通过。
- 真实Core、上游、付费联调、生产迁移、远端推送、main合并、部署均未授权。T48条件live应记未验证/待授权，继续其余可做的本地收尾；不得把Mock称为真实回执。
- 密集编辑、慢存储、恢复、租约、未知提交、权限、诊断脱敏和全量UI在T45–T47收敛，不提前宣称全50项完成。

恢复工具链：在项目目录运行 . ./scripts/use-local-toolchain.ps1（Node22.23.3/npm11.6.2）；已有lock使用npm ci。自动浏览器测试使用独占4179和本地网络守卫；Chromium位于E盘，设置STUDIO_TEST_BROWSER=chromium。所有代码/依赖/日志/截图留在E盘。
