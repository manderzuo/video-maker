# AI WORK Studio 执行代理交接

## 本轮用户指令
目标相对目录：`TRAEWORK/aiwork-studio`。
执行者：**1个代理，用户指定显示名GPT6.1 sol high，high推理档位**。不要沿用其他项目的Luna配置。
设计基线1.0和提示词生成增补1.1已获用户认可；当前交付正式实施计划。产品代码、生产部署和真实费用授权分别处理。

## 首次启动必须留下的事实
1. 用宿主工作区工具确定TRAEWORK的实际根位置与可写性，记录当前工作目录和Git状态。没有工具证据不假定磁盘路径，不在任意既有仓库启动。
2. 调度器确认实际模型id和推理档位。此处display name不是可直接粘贴到API的model id；不可用则报告真实限制，不替换模型、不假称已启动。
3. 阅读两份spec、总计划、shared-contracts和本次包；加载该任务依赖的验收证据。
4. 只能在新项目及明确允许的来源只读副本中工作。既有Trae-core、trae-maker、trae-maker-MCP和提示词仓库main不变。
5. 默认阻断真实业务网络。测试使用假Key和本地Mock；只有T48明确审批后才允许限制范围live。
6. 分支创建/推送遭403或本地不可写，保留命令与错误，不用伪造结果或改另一仓库替代。

## 第一个批次
T01→T02→T03→T04→T05→T06。先基线、来源、视觉门槛，再工程工具链与可靠事务/锁。不能先把整张效果图转成假按钮。
之后T07–T17完成本地画布，T18–T22在feat/prompt-generation完成本地规则、冲突、草稿和插入。
后续按总计划依赖图顺序执行，不越过持久化与确认直接接收费API。

## 每任务工作协议
- 建失败用例并实际观察失败；环境坏不是有效红灯。
- 实现该任务规定的接口，不增第二套模型API、存储或计费。
- 运行目标测试及模块回归，记录exit code、case数和跳过数。
- 检查diff与对应交互ID；截取真实运行UI，不拿设计图代替。
- 只提交任务范围内文件；写入docs/review/evidence/Txx.json。
- 主审检查后才进入依赖任务。修改失败保留现场，不删除已发run，不改原幂等身份重发。
- 原软件标识去除与第三方版权保留分别验收；未知来源授权阻止不合规发布。
- 逐阶段交付可用软件，不因后续条件能力未开而造假显示。

## 不能声称的事
未运行不称测试通过；Mock不称真实视频成功；未收到调度回执不称代理已启动；
未写入用户工作区不称已放进TRAEWORK；浏览器下载不称Downloads已落盘；
停止等待不称取消或退款；设计通过不称已构建；模型列表可读不称所有scope可用。

## 交付记录最小格式
taskId、baseCommit、headCommit、actualModel、reasoningMode、files、
commands[{command,exitCode,passed,failed,skipped,logPath}]、
interactionIds、screenshots、networkMode(mock/live)、knownLimitations、reviewDecision。

这是一份可交给执行宿主的指令，不是本会话已创建或运行代理的证明。
