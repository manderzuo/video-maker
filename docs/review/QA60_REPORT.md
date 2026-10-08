# QA60：节点尺寸调整与原任务排查

2026-10-08。实际项目 E:\trae-studio\TRAEWORK\aiwork-studio，分支 feat/aiwork-studio。基准 849526739c2350022e6e9ba988b671f64802b0bb；源码提交 0099115cbab0c1f3f1978bb31b08062f02809356。执行模型：由用户在宿主选择，当前工具不可验证。实施者自检通过，独立审查待进行。

## 已完成的本地修复

文本、素材、视频草稿和结果节点选中后提供右边、下边和右下角尺寸手柄；可拖动或使用方向键微调，Shift 加快，Escape 取消。尺寸经过 Schema 和命令限制，复用 IndexedDB 事务、日志、撤销/重做；锁定和只读不能修改。分组继续按成员边界包围。

素材预览随节点剩余高度扩展，使用 contain 展示完整图片。端口、预览和素材详情保留，尺寸修改不改提示词、参考绑定、Run 或收费请求。

真实 Chrome 的4188页面新建并保留“QA60 节点大小验收 · 2026-10-08”，使用用户现有资产卡素材；实际观察的初始469×544，经鼠标拖动变成619×664。撤销回469×544，重做回619×664，刷新后仍为619×664。预览高度从337扩至457像素。项目1565101b-d8a4-4ff4-9f44-ed472481034d，节点7b80c4a4-a92c-42c2-b9a4-3bd777f1d66b。

4188返回新版 index-BvJRxfrj.js，HTTP200；原篮球任务标签页未刷新，以保留原授权。旧版严格客户端对新增可选size字段不保证兼容，使用本次或更新客户端读取已调整尺寸的项目。

## 实际验证

日志根目录：work/qa-20261008/node-resize。

| 命令或验证 | 退出码 | 通过 / 失败 / 跳过 | 日志 |
| --- | --- | --- | --- |
| 新尺寸单元行为红灯 | 1 | 2 / 4 / 0 | unit-red.log |
| 实际页面缺少尺寸手柄红灯 | 1 | 0 / 1 / 0 | browser-red-retry.log |
| 写者租约失效期间取消尺寸操作红灯 | 1 | 0 / 1 / 0 | lease-behavior-red.log |
| npm run test:unit | 0 | 521 / 0 / 0，76个文件 | unit-final.log |
| npx playwright test tests/e2e/canvas-resize.spec.ts tests/e2e/canvas-connections.spec.ts tests/e2e/canvas-alt-wheel.spec.ts tests/e2e/canvas-video-play.spec.ts tests/e2e/typed-nodes.spec.ts --reporter=list,json --output work/qa-20261008/node-resize/browser-verified | 0 | 36 / 0 / 0 | browser-verified.log、browser-verified.json |
| npm run typecheck | 0 | 不适用 | typecheck-verified.log |
| npx eslint（本次8个TS/TSX修改文件） | 0 | 不适用 | lint-verified.log |
| npm run build | 0 | 不适用 | build.log |
| npm run test:bundle | 0 | 单块500000字节门槛通过 | bundle.log、bundle-budget.json |

首次页面加载超时和错误租约测试消息结构不算有效红灯，分别保留在browser-red.log、lease-red.log。中间相关回归35通过、1失败，原因是素材编号可见内容被压缩掉；恢复原编号后原断言通过，没有删除或修改原测试断言。

本轮测试未调用真实生成接口，没有新增依赖或修改lock。实际截图为work/qa-20261008/node-resize/live-node-resize-detail.png；完整截图与拖动、撤销/重做、刷新尺寸证据分别为live-node-resize.png、live-resize-proof.json。

## 原视频任务仍有服务阻塞

视频-20261008-131915-772C62，Core请求request_muEQqrv76WDxXdsioYVNwg。13:48、13:49真实日志反复upstream_capacity_insufficient；14:31日志已变成reference_asset_unavailable。14:36原任务GET仍HTTP200/queued，没有错误、阶段、账务字段或成片。不能沿用早期容量错误作为唯一最新状态，也不能认定此次参考图已通过或被审核拒绝。

Core服务active/running。运行二进制SHA256 aec2447b2dffdd5e68b5613235c2c0630366daf81b27e462916cd1bea3180df4，与QA32历史部署记录一致；未冒充核验其所有源码。只读日志命令退出码0，保存于work/qa-20261008/manual-task-131915/core-request-diagnostic.txt、core-build-diagnostic.txt、core-request-final-diagnostic.txt。

用户随后要求暂停该任务，已真实点击“停止本地查询”，界面已显示“已停止本地查询”。暂停证据为manual-task-131915/user-paused-query.txt及user-paused-query.png。这不是远端取消或退款。依用户最新指令，容量根因与回执恢复另由QA61继续，原请求不重发。

本轮没有新发付费请求、改Core财务数据库、清零持有或宣告退款。真实任务生成未通过；整体项目独立审计与全部历史按钮验收也不由本次尺寸回归代替。
