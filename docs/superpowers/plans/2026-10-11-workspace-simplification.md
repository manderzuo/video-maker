# 工作区界面精简与操作记录

Goal: 落实用户本轮 11 项调整，交付可本地验收的工作区；不提交 Git、不推送、不部署。

Architecture: 保留账号云端工作区与现有自动保存、收费确认、幂等和尾帧上下文。复用同一个写作组件服务独立页和画布面板；插入采用云端命令成功后导航。活动使用服务器按账号保存的操作摘要，项目分类与分页读取。

Tech: React/TypeScript、Fastify、PostgreSQL、现有隔离浏览器验收工具。

Spec: 用户 2026-10-11 本轮消息的 11 项要求（以本文下面验收项完整记录）。

Global constraints: 不删除用户数据；不收费调用真实模型；不修改线上配置；不创建子代理；既有未提交的尾帧与修订修复保留。删掉入口后不能留下依赖该入口才能完成的新流程。

Review focus: 写作输入保存失败不能发起优化；正文人工修改在保存到库/插入前形成新版本；插入导航只在命令成功后进行；任务导航绑定自己的项目和节点；活动不能泄露其他账号或提示词、密钥。

## Task 1 — 工作区入口

- [x] AuthBoundary/navigation：删除命令、通知、顶部问号；回收站移入主导航并用垃圾桶 SVG；底部删除恢复、迁移、备份、偏好入口，设置区域提供账号偏好。
- [x] CanvasToolbar/CloudCanvasPage：删除选择 V、平移 H、保存详情；保留键盘/中键平移及自动/手动云端保存。
- [x] CloudProjectsPage：删除原创模板、导入云端项目包、重新加载项目按钮。

## Task 2 — 写作与提示词库

- [x] CloudPromptGeneratorPage：写作输入仅 AI 优化；优化前保存当前输入；写作结果仅复制、保存到库、插入到画布。尾帧/修订专用模式保留采用正文操作。
- [x] CloudApplyPromptDialog：点击插入选择项目并确认，创建文字节点，成功后导航对应画布并定位新节点；不默认覆盖旧文字。
- [x] CloudPromptsPage：默认列出所有生成结果全文；删除 JSON 导入状态、方法、按钮、弹窗。保存库条目仍可查看与编辑。
- [x] 两处共享写作面板一致。

## Task 3 — 任务与活动

- [x] CloudTasksPage：视频列表保留结果预览；详情按钮导航任务所属画布及节点。
- [x] 新 domain/activity + server/activity + migration：记录已认证写操作（成功与失败分类，不存原始请求/密钥），按账号读取、按项目筛选、分页；兼容历史命令摘要。
- [x] WorkspaceClient/CloudActivityPage：显示操作名称、结果、项目、时间；项目分类、加载后续记录。

## Task 4 — 验收

- [x] tests/e2e/cloud-workspace-simplification.spec.ts：真实隔离浏览器验证入口移除、两处写作精简、自动保存优化、全文库、插入跳转、任务定位、活动项目分类与分页。
- [x] server/tests/activity.test.ts：账号隔离、操作记录、隐私字段、分页。
- [x] 必要 typecheck/lint/build、对应浏览器及服务器定向验收；尾帧/修订既有关键路径回归。
- [x] 留本地报告，明确无提交、无部署。
