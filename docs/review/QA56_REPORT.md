# QA56：用户照片真实图生视频测试

日期：2026-10-05。工作目录 E:/trae-studio/TRAEWORK/aiwork-studio，分支 feat/aiwork-studio，测试基准 a2b7695f20f68b91f4896c529799d5c67528803b。模型由用户在宿主选择，当前工具不可验证。状态：真实测试完成，生成被上游拒绝，待用户／独立审查。

## 实际操作与结果

使用 Chrome 3 的用户原标签页 1796004813、4188 的 tutu 项目。预览确认用户照片后，在画布复制原素材、提示词、视频三个节点及其两条连线；只修改测试副本。原素材文件复用，不修改照片。原任务仍为 failed_confirmed，updatedAt 保持 1791173752486；最终原节点快照已保存。未采集整个画布操作前哈希，不能声称全图不变。

先通过当前标签页的 CoreClient.testConnection() 检查健康和模型目录，使用现有授权；这是等价的只读连通检查，不是 aiwork doctor CLI 的执行记录。按 AI Work Seedance 技能只提交一次，失败后没有自动重试。

规格：seedance、5 秒、480p、9:16。提示词为自然眨眼、轻微微笑、轻轻转头后回正，保持外貌、衣服、背景一致、固定镜头，不新增人物、对白、字幕或水印。没有调用文字优化模型。

真实网络：1 次 POST /v1/assets，HTTP 200；1 次 POST /v1/videos/generations，HTTP 202；随后 15 次原任务 GET 查询，HTTP 200。收到 202 只表示接受。47.479 秒后最终为 failed_confirmed / idle / not_ready / pending_reconciliation。

- Run：1d03f53b-d675-4448-9b6d-435abef0e191。
- Core 任务：request_9s_RxREtgDvKejBCYSCDMA。
- 显示编号：视频-20261005-135934-1D03F5。
- 公共错误码：video_execution_failed。
- 脱敏公开回执明确报告上游 3003、HTTP 400，输入图片 content[1] 可能包含真人（may contain real person）。具体上游机器错误码已隐藏，不能补造。

此结果证明本次输入被图片准入拒绝；不能证明人物真实身份，也不能证明所有人像或所有提示词都失败。没有生成视频，无预览／下载结果；实际扣点与退款仍未知，失败不等于免费或退款。

## 证据

原始证据保存在被 Git 忽略的 work/qa-20261005/photo-live/：source-photo.png、confirmation.png、result.png、network.json、run-snapshot.json、run-final.json、public-error-detail.json、failure-public-fields.json。截图是真实运行页面。网络记录仅保存方法、路径、状态和请求编号；未保存 Key、授权头或照片 Base64。含照片截图与用户详细记录不提交 Git。

本轮业务生成用例：1 项执行、0 成功、1 失败、0 跳过。没有源码修改，没有运行单元、构建、Lint 或完整 verify，不沿用 QA55 数量宣称本轮通过。CDP 请求捕获已关闭。该业务结果没有 shell 退出码，证据中记 null。

## 发现与后续

parseCoreTask 只保留稳定错误码，video_execution_failed 文案声称未提供具体原因；实际回执 message 已有明确原因。这是 UI 信息损失，修复时应转成经过验证的稳定分类与中文说明，不能直接展示／持久化任意上游原文。

当前 buildVideoRequestBody 只发送普通 image_asset_ids，现有 uploadCoreAsset 是普通上传映射，不是官方真人授权入库；代码没有 first_frame 或 asset:// 透传实现。官方可行路径及提示词见 PORTRAIT_GENERATION_RESEARCH.md；下一步见 QA56_NEXT_STEPS.md。本轮没有推送、部署、更换供应商或修改 Core。
