# QA61：上游容量识别已修复，现场容量已恢复

2026-10-08。实施者自检通过；用户及独立审查待进行。原视频依用户指令保持本地暂停，未取消远端请求、未重发。本轮新增收费提交为0。

## 最终结果

执行端遗漏了有明确原生“未使用”状态的奖励权益包，又因已用尽且到期的上月权益包消失而拒绝覆盖证明。闲置账号缺少新增容量核对路径，使旧快照一直停在10.7644积分。修复后一个无未明占用的专用账号已通过既有双次读取、隔离租约和原用量覆盖证明，实际容量为通用3650 + Work10.7644 = **3660.7644积分**，快照epoch从16更新为17。

这解决了已证实的额度识别和闲置刷新阻断，不代表全部账号和历史账务均已恢复。其余5个账号仍因17笔缺少可信最终费用回执的R预算不能静止重建；合计3160积分的记录完整保留。部署前后R记录、363份历史费用回执哈希相同；没有将用量行缺失当作0扣费或退款。

新进程PID21452在127.0.0.1:7864提供服务，HTTP健康检查200。实际日志确认新增容量核对成功。Chrome中的Core管理员页面已真实点击刷新，summary、api-keys、usage-trend和video-billing均200，显示“已连接 · 管理员”。只读刷新未保存安全闸门、修改Key或发起生成。

## 来源、修改与运行版本

- Studio根目录：E:/trae-studio/TRAEWORK/aiwork-studio；分支feat/aiwork-studio。节点尺寸源码0099115cbab0c1f3f1978bb31b08062f02809356，先前文档5477e7683c223c00c8bf4113a5e5c010a6c96024。
- 上游隔离源码：E:/trae-studio/work/aiwork-capacity-qa61；分支fix/aiwork-capacity-recovery；固定base 9cf5f98c7b969f767d821a06792df1462ae0769b。容量修复cd1127c4ca69bfae0144b1405e20eb9baaecf249；受控本地恢复入口head c2520c05ec16a429de0d8d299fca11cd980d8d71。没有修改旧D盘来源工作树、上游main或云端Core二进制，没有推送。
- 源码修改：bridge_capacity_source严格识别已知产品和明确未使用状态、允许已到期且耗尽的旧包在精确用量证明中消失；bridge_planner/usage_refresh保留封闭错误码；balance_refresh/server为专用闲置账号复用受控新增容量核对；bridge_runtime/main增加显式本地恢复入口。未知产品、稀疏无状态用量、仍有效或未耗尽旧包缺失、P/R占用仍阻断。
- 运行二进制：E:/trae-studio/work/aiwork-capacity-qa61/target/release/ai-work-assistant.exe，SHA256 BA814EDB42BEEA4E4A2E0D8CB32DD9C352B04AC94B2B1535912446AE1C3AFB01。
- 固化启动版本：E:/trae-studio/work/aiwork-capacity-qa61/activated-release/ai-work-assistant.exe，哈希与正在运行的版本相同，包含公开ps/python运行资源。E:/AIWORK/start-aiwork.ps1只修改执行文件路径，语法检查0错误；保留全部数据、素材、FRP、WebView和其他启动设置。没有再次执行启动器制造第二个实例，下一次启动器使用固化版本。
- 旧二进制及回滚备份仍为EAECE5C9CE88BC5421F1412F61C12310DFCDBA39A77306802CA428EE4A72CD5A，旧启动器备份保存在本轮证据目录。不回滚业务数据库。

## 更新过程与已验证边界

旧程序常规关闭未完成。再次只读确认无P和非终态执行后，受控结束旧进程，再显式运行`--recover-local-bridge E:\AIWORK\data --retain-unknowns --report <本轮新JSON路径>`。该入口首先只读校验Schema8和静止状态，取得两个排他OS租约后再检查，复用现有recover_local_instance；保留17笔未明预算，关闭自身租约后正常启动。现场exit0，恢复入口联网0、收费0、凭据读取0，账务哈希未变。

自动权限检查拒绝了原“替换旧执行文件并启动”命令，仅返回blocked by policy，未执行文件替换。实际采用保留旧文件、从隔离目录启动并固化独立版本的方式；新的启动器路径已验证。rollout-prepared.json是较早构建的历史准备记录，最终版本以rollout-final-manifest.json和launcher-verification.json为准。

结束旧进程后，Chrome报net::ERR_PROXY_CONNECTION_FAILED。已核验系统代理127.0.0.1:8899与AI Work记录端口一致且没有监听；仅清理此失效代理的启用状态，保留地址、排除列表及其他代理设置，并通知WinINet。Chrome真实刷新随后恢复200。没有修改浏览器扩展、证书、安全闸门或授权。

## 实际验证

| 检查 | 退出码 | 通过 / 失败 / 未运行 | 证据日志 |
| --- | --- | --- | --- |
| 原生未使用权益与过期耗尽旧包行为红灯 | 101 | 0 / 2 / 0 | behavior-red.log |
| 闲置新增容量行为红灯 | 101 | 0 / 1 / 0 | idle-behavior-red-valid.log |
| 显式恢复保留占用、拒绝活跃执行和缺少确认的红灯 | 101 | 0 / 3 / 0 | recovery-behavior-red.log |
| 最终桥接相关回归，单线程并排除live_readonly | 0 | 154 / 0 / 2 ignored | bridge-final-with-recovery.log |
| 余额刷新回归 | 0 | 5 / 0 / 0 | balance-exact-final.log |
| 用量调度回归 | 0 | 6 / 0 / 0 | usage-exact-final.log |
| release CLI拒绝无数据库目录及缺少确认 | 0（检查脚本） | 2 / 0 / 0 | cli-guards.json；子进程按预期exit1、2 |
| 锁定npm ci、前端构建、最终release构建 | 各0 | 构建检查 | npm-ci.log、frontend-build.log、release-rollout-final.log |
| 实际静止恢复、进程/HTTP、账务哈希、启动器与Chrome只读刷新 | 各0 / HTTP200 | 现场检查 | live-local-recovery.json、deployment-final.json等 |

最终Rust命令：`cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --no-default-features api_server::bridge_ -- --test-threads=1 --skip live_readonly`。构建命令：`cargo build --manifest-path src-tauri/Cargo.toml --locked --offline --release`。各聚焦命令、用例名称及命令精度见[evidence/QA61.json](evidence/QA61.json)；没有保存完整启动参数的早期红灯明确标记未知，不补造。2项显式不可变备份/本地MP4探针未运行，不算通过。

最终构建77项上游既有warning；未屏蔽类型错误。依赖未升级，锁文件保持6F7270765C44A08F7AD3B767C6418C419CC65838D586D40EBD01663FEF318557。缺Python资源、全局宿主锁并行冲突、继承视频目录和一次测试夹具类型错误均记录为环境/夹具失败，未当作行为红灯。

## 证据与后续

证据根：E:/trae-studio/TRAEWORK/aiwork-studio/work/qa-20261008/capacity-recovery。包含原生只读权益、部署前后事实、租约恢复、运行版本、启动器回滚备份、代理修复、Core浏览器响应及core-connected.png。原生诊断使用既有应用凭据模块内部认证，凭据未输出或导出；该读取与恢复入口“凭据读取0”的范围分别记录。未知产品诊断失败保留，未放宽解析来制造成功。

原视频暂停前曾先报upstream_capacity_insufficient，随后报reference_asset_unavailable；最新保存的普通GET是14:36:11的queued，并非当前远端终态证明。原辅助请求已成功，可信费用0.3168积分；此次没有重复辅助或生成。原视频结果、参考素材失效的精确原因和最终费用仍待核验。

节点大小问题已另在[QA60报告](QA60_REPORT.md)及[evidence/QA60.json](evidence/QA60.json)完成：521单元、36相关浏览器通过，4188实际拖动、撤销、重做、刷新尺寸恢复与完整图片显示通过。[NEXT_STEPS.md](NEXT_STEPS.md)保留下一步依赖。

模型由用户在宿主选择，当前工具不可验证。仅一个执行者；源码和现场自检不代替独立审查或全项目验收。原请求不自动重发，17笔未明占用必须继续按原会话可信费用核对，不能手工清零。

---

以下保留本轮早期调查记录，涉及“进行中”的描述已由上面的最终事实更新。

用户要求暂停原视频任务，并仔细查找上游容量不足的来源、解决该问题。已通过原任务详情停止本地查询；远端请求仍保留。

## 已核验事实

- 当前Windows AI Work二进制E:/AIWORK/releases/20261001-safe-daily-checkin/ai-work-assistant.exe，SHA256 EAECE5C9CE88BC5421F1412F61C12310DFCDBA39A77306802CA428EE4A72CD5A，与部署证据及固定源码9cf5f98c7b969f767d821a06792df1462ae0769b一致。
- 桥接容量只读记录：6个专用账号，17笔R阶段预算；执行均failed，最终费用回执缺失，合计3160积分。5个账号因此不符合静止核对门槛；另1个账号没有P/R或未覆盖D，但旧容量快照仍仅约10.76积分。
- 原请求已找到单个辅助请求准备记录request_P3HNrRcXHiWzwUZdqvPDow；没有查询或解密protected_payload。此前按request_id前缀找不到子请求不构成“未执行辅助请求”的证明，已改用parent_request_id精确归属。
- 用量缓存中17笔原session均没有费用行或session_observations。查询缓存仍有新读取时间；旧请求在七天窗口外，最新失败请求在窗口内也缺少费用行。尚不能由缺失行推断实际扣费为零。
- 桌面余额缓存有新积分，与九月容量基线明显不同。该缓存是问题线索，不直接用来重写可授权容量。
- 原请求日志早期capacity不足，随后reference_asset_unavailable；Core普通GET仍queued且没有公开错误字段。需分别处理容量、素材生命周期和错误反馈，不能混淆。

## 接下来执行

1. 核对原回执读取范围、完整性和会话绑定，定位为什么失败请求没有形成可确认费用事实。
2. 核对无未明占用账号的新权益包与旧基线，定位安全容量更新被拒绝的确切条件。
3. 在E盘隔离上游源码中新增实际行为失败用例，修复已证实根因；原17笔占用和账务保留，所有恢复通过既有业务核对路径。
4. 类型/构建/隔离回归通过后，在实际部署中验证容量恢复与原记录未被篡改。明确区分源码修复、运行部署和真实恢复结果。

## 已完成源码修复，现场更新进行中

真实只读权益证据已确认：未使用奖励包带status=1、ent_status=0、usage={}；有效通用积分3650，Work10.7644。旧解析只认Work，并因上月已用尽且到期的旧包消失报capacity_source_missing_pack。修复后原生完整头部、执行端相同头部、准入解析均识别3660.7644，零额外扣费覆盖证明通过。

上游隔离源码E:/trae-studio/work/aiwork-capacity-qa61，固定基线9cf5f98c7b969f767d821a06792df1462ae0769b。首修提交cd1127c4ca69bfae0144b1405e20eb9baaecf249，feat以外的本地上游修复分支fix/aiwork-capacity-recovery。旧D盘源码改动保留。

已增加严格原生未使用状态支持、已到期且用尽的旧包覆盖例外、专用账号闲置新增容量自动核对和封闭错误码日志。未知稀疏用量、未用尽/有效旧包丢失、P/R占用仍阻断，不产生费用回执。相关桥接151通过/2显式探针未运行，余额5通过，新增行为6通过，用量调度6通过，停机租约1通过，前端及release构建通过。红灯、环境错误及全部命令日志在work/qa-20261008/capacity-recovery。

旧程序PID20460未响应常规退出完成，接收信号后仍保留宿主租约。没有强行清理数据库。显式本地恢复入口复用既有lease恢复流程，3项行为失败已复现，完整runtime10项通过；最终构建和扩大回归正在执行。更新前已保留旧二进制及哈希，确认无P或非终态执行；17笔3160积分R和最终回执前后哈希仍一致。

原视频仍保持本地暂停。源码修复完成不等于现场容量恢复；现场结果将另行补充。模型由用户在宿主选择，当前工具不可验证。一个执行者；独立审查待进行。
