# T46 本机性能与界面自检记录

设备：Windows 10 专业版 10.0.19045，Intel i5-12400F（6 核/12 线程），系统可见内存 33388044 KiB。Node 22.23.3 / 锁定 Playwright Chromium；本地开发页面、假 Key、隔离存储。宿主模型：由用户在宿主选择，当前工具不可验证。

| 实测 | p50 ms | p95 ms | 计划 p95 上限 ms |
|---|---:|---:|---:|
| 50 节点平移 | 6.9 | 7.1 | 33 |
| 50 节点输入到下一帧 | 2.6 | 3.6 | 100 |
| 200 节点平移 | 7.0 | 13.9 | 33 |
| 200 节点输入到下一帧 | 3.6 | 14.4 | 100 |
| 原生事务保存 1MiB 元数据 | 8.1 | 17.4 | 500 |

200 节点通过真实鼠标平移、requestAnimationFrame 帧间隔和 36 次真实键盘输入采样；1MiB 保存包括规范 Schema、写者租约、修订校验和原生 IndexedDB 事务完成回执，2 次预热后测量 20 次。全部网络收费计数为零。原始样本在 T46-canvas-performance.json / T46-50-node-performance.json / T46-native-save-performance.json。

初次 200 节点平移 p95=34.8ms 失败，节点树对仅视口变化采用 memo 后通过。最终采样仍有一次平移阶段 129ms 长任务；输入阶段未记录长任务，不声称每帧均达标或完全没有停顿。本结果是当前 Windows 设备、开发构建和测试夹具的实测，不代表所有设备/生产负载。

深浅主题 × 1440/1280/1024/720 的 23 页/面板共 184 份实际运行截图；布局、16px 字号、弹窗边界与零收费检查通过。没有已认可的完整像素基线，所以没有自动更新或声称视觉 diff 获认可。截图和键盘录像供用户统一验收；人工键盘、操作系统输入法与独立审查待进行。

125%/150% 使用隔离测试浏览器的原生 chrome.tabs.setZoom/getZoom，校验实际 CSS 视口、DPR、面板边界，并实际关闭面板。Playwright 截图在原生缩放下发生裁切；非 surface 截图在 headless 返回黑色。最终使用原生 Page.captureScreenshot(fromSurface=true,captureBeyondViewport=false) 的物理像素截图，校验尺寸和非空像素；异常截图仅作为工具限制附件。

IME 使用 Chromium CDP imeSetComposition + insertText，真实 compositionstart 为 trusted=true，但此 API 的 compositionend 为 trusted=false。组合期间不保存、快捷键不误触发，提交中文/emoji 与 65536/65539 UTF8 字节边界已验证；这不替代操作系统输入法人工验收。

按需加载页面后入口约 66.30kB，最大块约 192.36kB。500000 字节代码块检查沿用原 Vite 警告阈值并纳入 verify，属于本地工程限制；构建成功不替代交互验收。

完整浏览器回归实际 406 项通过、0 失败/跳过，严格交互覆盖 260/23/30、缺口0；结果写入 T46.json。规划门槛当前 26 通过/1 失败，失败为 T02 视觉批准仍 pending，保留原断言。用户验收与独立审查均未发生。
