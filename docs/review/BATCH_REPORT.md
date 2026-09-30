# T01–T06 执行交付（未完成批次）

实际目录：E:\trae-studio\TRAEWORK\aiwork-studio；分支feat/aiwork-studio；无remote、无推送、无部署。
基线：f811447b6867984b66e027de3b6326f479bb0f08；实施范围head：66ceb20400c2b9027383902392b7993d2d99a182。证据交接另有本地提交，最终HEAD由终端读取。
模型：由用户在宿主选择，当前工具不可验证；单执行者，无子代理，无独立审查已通过声明。

|任务|实际状态|
|---|---|
|T01|5项自检通过，来源/路径台账已提交，待主审；typecheck待T03|
|T02|23页30弹窗具体稿与171文档截图已准备，材料检查4通过，批准门槛1失败；待视觉/独立审查，125%/150%缩放未实测|
|T03|受阻，未开始|
|T04|受阻，未开始|
|T05|受阻，未开始|
|T06|受阻，未开始|

## 修改与功能

来源清单、五份固定树目录清单、10个候选/排除模块hash、复用台账、原文第三方声明、项目路径守卫及行为用例。
文档域视觉评审页和控件，深浅主题、1440/1280/1024、720只读样例，绘制关键收费/PG冲突/保存失败/未知提交状态。
产品领域层、数据库、租约与执行功能尚未实施；没有产品构建或可用网页创作功能声明。逐文件清单见changed-files.txt。

## 实际验证

|命令|退出码|通过/失败/跳过|
|---|---|---|
|node --test tests/planning/source-policy.test.mjs（最初红灯）|1|0/5/0|
|node --test tests/planning/source-policy.test.mjs（root守卫红灯）|1|4/1/0|
|node --test tests/planning/source-policy.test.mjs（最终）|0|5/0/0|
|node --test tests/planning/visual-baseline.test.mjs（最初红灯）|1|0/5/0|
|node scripts/capture-visual-review.mjs（初次）|1|选择框可访问名失败；CSP内联样式错误，不计通过|
|node scripts/capture-visual-review.mjs（修复后）|0|6个评审控件检查通过；171张截图；不是产品E2E|
|node --test tests/planning/visual-baseline.test.mjs（当前）|1|4/1/0；真实审批待定|
|node --test tests/planning/*.test.mjs|1|9/1/0；仅审批门槛失败|
|git diff --check|0|无空白错误|
|npm run typecheck / build / 产品unit / E2E|未执行|T03未建立，不假称跳过或通过|

失败记录全部说明在evidence/T01.json与T02.json。T01第一次绿色尝试的Windows junction清理失败日志被后续绿色日志覆盖，保留该事实，不补造日志。

## 日志与截图

绝对日志目录：E:\trae-studio\TRAEWORK\aiwork-studio\docs\review\logs。
实际文档截图目录：E:\trae-studio\TRAEWORK\aiwork-studio\docs\design\captures；全部映射见visual-manifest.json与T02-browser-check.json。
核心样例：P03-normal-1440-dark.png、P21-normal-1440-dark.png、prompt-conflict-1024-light.png、video-confirmation-1440-dark.png。
这些是实际渲染的评审文档截图，不是产品UI截图；产品保存/恢复尚未验收。

## 必须保留的限制

交接要求“主审检查后才进入依赖任务”；WP00要求人的视觉判断不能由截图替代。总体设计批准未取消这些门槛。
高缩放、许可前端标识、Core真实部署能力与真实请求均未验证。Core/maker/MCP无明确LICENSE/NOTICE记录，仅参考契约。
来源上游完整安全扫描、构建与bun测试未跑；来源只读、未修改业务工程。
下一步详见NEXT_STEPS.md，首先完成实际审查，再继续本轮T03–T06，仍不进入T07。
