/* Document-only visual review. Every business control is disabled. */
const data=window.REVIEW_DATA;
const params=new URLSearchParams(location.search);
let currentPage=params.get('page')||'P03';
let currentState=params.get('state')||'normal';
let currentTheme=params.get('theme')||'dark';
let currentDialog=params.get('dialog')||'';
if(params.get('capture')==='1') document.body.classList.add('capture');
const escapeText=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(text,primary=false)=>`<button data-business disabled title="静态视觉评审稿，尚未实施业务操作" class="${primary?'primary':''}">${escapeText(text)}</button>`;
const pill=(text,type='')=>`<span class="pill ${type}">${escapeText(text)}</span>`;
const input=(label,value='',type='text')=>`<label>${escapeText(label)}<input type="${type}" value="${escapeText(value)}" readonly aria-label="${escapeText(label)}"></label>`;
const textarea=(label,value)=>`<label>${escapeText(label)}<textarea rows="5" readonly aria-label="${escapeText(label)}">${escapeText(value)}</textarea></label>`;
const status=(text,type='warn',actions='')=>`<div role="status" class="status ${type}"><span>${type==='error'?'!':'ⓘ'}</span><div class="copy">${text}</div>${actions}</div>`;
const request='为「星链咖啡」拍摄5秒竖屏广告，9:16，一位店员将咖啡递给顾客。保留品牌汉字；对白：“早上好”。全程一镜到底。';
const prompt='5秒，9:16竖屏。一位店员站在咖啡吧台后，将一杯咖啡平稳递给镜头前的顾客。镜头从杯身上的“星链咖啡”字样缓慢上移至人物面部。店员轻声说：“早上好”。全程一镜到底，保留品牌汉字，不新增人物、字幕或转场。';
const offline=()=>status('未连接Core · 可以先整理项目，连接并核验能力后再生成。','warn');
function empty(message='还没有内容',action='新建本地项目') {return `<div class="empty"><div><div class="symbol">＋</div><h2>${message}</h2><p class="muted">内容保存在当前浏览器，整理与编辑无需生成授权。</p>${button(action,true)}</div></div>`;}
function loading(){return `<div role="status" class="cards">${[1,2,3].map(()=>'<div class="card"><div class="cover">正在加载本地记录…</div><div class="card-body"><div class="skeleton"></div><div class="skeleton short"></div></div></div>').join('')}</div>`;}
function failure(page){return status(`${page.id==='P21'?'本次草稿':'本次修改'}尚未保存。请先重试保存或导出草稿。新收费提交已禁用。`,'error',button('重试保存')+button('导出草稿'));}
function headings(page,action=''){return `<div class="heading"><div><h1>${escapeText(page.title)}</h1><p class="muted">${escapeText(page.goal)}</p></div><div class="actions">${action}</div></div>`;}
function cards(kind='project'){return `<div class="cards">${['咖啡品牌 · 竖屏短片','新品发布 · 镜头草案','城市漫步 · 参考整理'].map((title,i)=>`<article class="card"><div class="cover"><div class="abstract">${kind==='asset'?['图片','视频','音频'][i]:'镜头 '+(i+1)}</div></div><div class="card-body"><h3>${title}</h3><p class="muted">${kind==='asset'?'原创示例占位 · 本地素材 · 未上传':'静态示例项目 · 最近修改 14:20'}</p><div class="meta">${pill(kind==='asset'?'本地可用':'示例保存状态','accent')}<small>${kind==='asset'?'规格待检查':(i+2)+'个节点'}</small></div></div></article>`).join('')}</div>`;}
function canvas(page){
 return `<div class="canvas-work"><aside class="assets-side"><div class="tabs"><span>素材</span><span>提示词</span><span>节点</span></div>${button('导入本地素材')}<p class="muted">选择文件不会上传Core</p><div class="ref"><div class="cover mini-cover">原创占位 · 参考图片</div><p>杯身品牌文字参考</p>${pill('未分析素材')}</div><div class="ref">人物动作说明<br><small>本地文本 · 不含授权</small></div></aside><section class="canvas"><div class="canvas-message">${currentState==='error'?failure(page):currentState==='readonly'?status('此项目正在其他标签页编辑。当前只读；接管后需重载最新revision。','warn'):currentState==='loading'?status('正在读取项目图、素材引用与任务记录…'):offline()}<div class="mobile-warning">窄屏只读预览 · 批量编排与收费快捷键已关闭</div></div>${currentState==='empty'?empty('把参考素材拖到这里，或先添加一段提示词。','添加文本节点'):currentState==='loading'?'':`<div class="nodes"><article class="node"><header>文本提示词</header><div class="content"><p>${escapeText(prompt)}</p>${pill('保留品牌汉字','accent')}</div><footer>文本输出 · 本地草稿</footer><span class="port"></span></article><div class="connector"></div><article class="node generation"><header>视频配置 · 示例草稿</header><div class="content">${input('目标时长（秒）','5')}${input('目标画幅','9:16')}<p class="muted">当前服务能力待核验；这些是创意要求，尚不能执行。</p>${button('检查并确认生成',true)}</div><footer>待能力确认 · 无自动提交</footer><span class="port in"></span></article></div>`}<div class="canvas-tools">${button('选择 V')}${button('平移 H')}${button('−')}${pill('100%')}${button('＋')}${button('适配全部')}</div><div class="task-strip">任务 0　 <span class="muted">本地整理不会创建视频任务</span></div></section><aside class="inspector"><div class="tabs"><span>${page.id==='P22'?'提示词生成':'参数'}</span><span>输入</span><span>版本</span></div><h3>${page.id==='P22'?'同一草稿 draft-demo':'视频生成草稿'}</h3>${textarea('原始需求',request)}${input('创作方向','商品广告')}${input('锁定要求','5秒 · 9:16 · 保留品牌汉字')}${button(page.id==='P22'?'本地整理':'预检',true)}<p class="muted">${page.id==='P22'?'默认插入新节点；应用当前节点须比较版本。':'真实能力未核验，无法提交。'}</p>${button(page.id==='P22'?'展开工作台':'查看输入快照')}</aside></div>`;
}
function generator(page){
 const noResult=currentState==='empty'||currentState==='loading';
 return `<div class="editor"><section class="panel"><h3>创作需求</h3>${textarea('原始创意',currentState==='empty'?'':request)}${input('创作方向','商品广告')}${input('时长目标（秒）','5')}${input('画幅目标','9:16')}${input('声音策略','对白 + 环境声')}<div class="ref">锁定要求<br>${pill('品牌汉字')}${pill('1位店员')}${pill('不切镜')}</div><p class="muted">参考说明未分析；无绑定素材不会伪造@图片1。</p></section><section class="panel prompt-result"><div class="tabs"><span>最终提示词</span><span>镜头草案</span><span>改动说明</span></div>${currentState==='error'?failure(page):currentState==='conflict'?status('发现明确要求冲突：原始需求5秒9:16，表单示例15秒16:9。未解决前无法AI提交。','error'):status('规则整理为纯本地操作。AI优化与视频提交分别确认。')} ${noResult?empty(currentState==='loading'?'正在读取草稿…':'写下创意，开始本地整理','本地整理'):textarea('规则整理草稿 · 待检查',prompt)}<div class="bottom-actions">${button('本地整理',true)}${button('AI优化')}${button('复制')}${button('保存到库')}${button('插入画布')}</div><p class="muted">静态控件 · 插入、应用和建流程不表示付费生成授权。</p></section><section class="panel checks"><h3>要求与检查</h3>${pill('规则版本 · 待实施')}<div class="row">视频能力<span class="muted">尚未核验</span></div><div class="row">目标规格<span>5秒 / 9:16</span></div><div class="row">引用映射<span>无已绑定素材</span></div><div class="row">校验状态<span class="muted">待检查</span></div><h3 class="space-top">草稿历史</h3><div class="ref">v2 人工修订<br><small>恢复创建新草稿，不恢复Key</small></div><div class="ref">v1 本地整理<br><small>原始需求快照只读</small></div>${button('历史审阅')}</section></div>`;
}
function tasks(){return `<table class="table"><thead><tr><th>类型 / 项目</th><th>执行</th><th>查询</th><th>文件交付</th><th>账务</th><th>安全下一步</th></tr></thead><tbody><tr><td>视频 · 咖啡品牌<br><small>示例 run-a</small></td><td>${pill('提交待确认','warning')}</td><td>已中断</td><td>未就绪</td><td>未提供</td><td>${button('查看原记录')}</td></tr><tr><td>视频 · 城市漫步<br><small>示例 run-b</small></td><td>${pill('结果就绪','accent')}</td><td>暂停查询</td><td>获取失败</td><td>待核对</td><td>${button('重新下载')}</td></tr><tr><td>文字 · 草稿优化<br><small>示例 prompt-run-c</small></td><td>停止等待</td><td>不适用</td><td>保留旧草稿</td><td>未提供</td><td>${button('查看脱敏快照')}</td></tr></tbody></table><p class="muted">四个状态维度独立展示；停止等待不表示取消或退款。所有编号是视觉样例。</p>`;}
function media(page){return page.id==='P08'?`<div class="compare">${['A · 原版本','B · 人工选定版本'].map(v=>`<div class="panel"><h3>${v}</h3><div class="player"><div class="play">▷</div><p>原创占位 · 未加载媒体</p></div><p>5秒 / 9:16 · 固定run引用</p>${button('播放')}${button('选为后续输入')}</div>`).join('')}</div><div class="panel space-top"><h3>参数差异</h3><div class="row">镜头运动<span>A 缓慢上移 / B 固定机位</span></div><p class="muted">近似同步用于对照；不生成新文件。</p></div>`:`<div class="cols"><div class="player"><div class="play">▷</div><p>原创占位 · 非生成视频</p><p class="muted">加载媒体失败时仍保留原任务来源</p></div><div class="panel"><h3>结果来源</h3><div class="row">执行<span>示例结果就绪</span></div><div class="row">文件<span>获取待授权</span></div><div class="row">账务<span>未提供</span></div><p>${escapeText(prompt)}</p>${button('下载原视频')}${button('比较版本')}</div></div>`;}
function settings(page){
 const contents={
 P10:`${input('连接档案名称','自有Core服务')}${input('同源业务通道','/core-api')}${input('普通Key（仅当前标签页内存）','','password')}<p class="muted">只记住地址。刷新后需重新输入Key。旧任务保留原授权绑定。</p>${button('测试只读连接')}${button('保存连接档案')}`,
 P11:`<h3>已验证能力</h3>${['文字模型','视频生成','图片生成','音频生成','远端取消','续写'].map(v=>`<div class="row">${v}${pill('尚未核验','warning')}</div>`).join('')}<p class="muted">图片、音频、远端取消执行入口不开放；没有自动收费试探。</p>`,
 P12:`<div class="row">主题<span>深色 / 浅色 / 跟随系统</span></div><div class="row">自动播放<span>关闭</span></div><div class="row">减少动画<span>跟随系统</span></div><div class="row">快捷键<span>输入法组合优先</span></div>${button('查看快捷键')}${button('重置偏好')}`,
 P13:`<h3>浏览器本地数据</h3><div class="row">剩余容量<span>未知 · 尚未统计</span></div><div class="row">持久存储<span>未请求</span></div><p>持久存储不代替备份；仅清理可重建缩略图。</p>${button('导出项目包',true)}${button('请求持久存储')}${button('清理缩略图')}`,
 P14:`<div class="tabs"><span>1 文件检查</span><span>2 内容预览</span><span>3 冲突策略</span><span>4 结果</span></div>${input('导入文件','咖啡品牌.awstudio.zip')}<div class="row">格式版本<span>示例 schema 1</span></div><div class="row">资源完整性<span>待核验</span></div><div class="row">导入策略<span>另存为新项目</span></div><p class="muted">拒绝路径穿越、脚本与超限包；不会执行历史任务。</p>${button('校验并预览',true)}`,
 P16:`<h3>AI WORK Studio</h3><p>独立浏览器创作工作台 · 当前为视觉评审稿</p><div class="row">项目schema<span>尚未实施</span></div><div class="row">真实Core联调<span>未授权、未验证</span></div>${button('本地帮助')}${button('第三方许可')}`,
 P18:`<h3>扩展媒体能力</h3><p>图片、音频、远端取消尚无已核验的部署契约，执行入口未开放。</p><div class="row">本地媒体预览<span>后续本地功能</span></div><div class="row">生成能力<span>当前受限</span></div>`,
 P19:`<h3>可选WebDAV备份</h3><p>默认关闭；不是实时多人协作。</p>${input('端点','尚未配置')}${input('备份路径','尚未配置')}<p class="muted">需部署授权后开放固定端点传输。冲突另存，不自动覆盖。</p>`,
 P20:`<h3>恢复与冲突</h3>${status('旧标签租约失效。请先重载最新revision，再决定接管。','warn')}${button('只读打开')}${button('保存冲突副本')}${button('导出紧急草稿')}<div class="row">未知提交<span>保留原幂等身份</span></div><div class="row">凭据缺失<span>重新提供原授权</span></div>`
 };
 return `<div class="cols"><section class="panel">${contents[page.id]||'<h3>本地记录</h3><p>示例数据 · 尚未实施</p>'}</section><aside class="panel"><h3>使用说明</h3><p>${escapeText(page.goal)}</p><p class="muted">${escapeText(page.requiredStates)}</p>${pill('本地模式')}<p class="muted">当前页面仅供视觉评审，控件不会读写项目或调用服务。</p></aside></div>`;
}
function content(page){
 if(['P03','P22'].includes(page.id))return canvas(page);
 if(['P21','P23'].includes(page.id))return generator(page);
 if(page.id==='P01')return `<div class="welcome panel"><div class="logo">AI WORK Studio</div><h1>开始你的创作项目</h1><p class="muted">画布保存在当前浏览器，生成任务由Core处理。</p><div class="welcome-grid"><aside><div class="step">1 连接服务</div><div class="step">2 测试权限</div><div class="step">3 创建项目</div></aside><section>${input('连接档案','自有Core服务')}${input('同源地址','/core-api')}${input('普通Key','','password')}${currentState==='error'?status('连接未通过鉴权；无需生成测试。','error'):status(currentState==='loading'?'只读连接测试中…':'无需Key也能先整理项目。')}${button('测试连接')}${button('进入本地模式',true)}</section></div></div>`;
 let body=headings(page,button(['P04','P05'].includes(page.id)?'本地导入':'新建 / 查看',true));
 if(currentState==='error')body+=failure(page);
 if(currentState==='readonly')body+=status('当前只读；可查看、比较和导出，写入与收费提交禁用。');
 if(currentState==='unknown')body+=status('提交结果暂未确认，请查询原任务，不要重复生成。','warn');
 if(currentState==='conflict')body+=status('项目revision已变化。比较差异或另存副本，不能静默覆盖。','error');
 if(currentState==='empty')return `<div class="body">${body}${empty(page.id==='P06'?'还没有本客户端任务':'还没有本地记录')}</div>`;
 if(currentState==='loading')return `<div class="body">${body}${loading()}</div>`;
 if(['P02','P04','P17'].includes(page.id))body+=`<div class="filters"><input readonly aria-label="搜索本地记录" placeholder="搜索本地名称"><span class="pill">全部</span><span class="pill">最近修改</span><span class="pill">收藏</span></div>${cards(page.id==='P04'?'asset':'project')}${page.id==='P17'?status('活动或未知任务的唯一追踪记录不可永久删除。'):''}`;
 else if(page.id==='P05')body+=`<div class="cols"><section class="panel"><div class="tabs"><span>全部提示词</span><span>收藏</span><span>本地模板</span></div><div class="ref"><h3>商品广告 · 原创样例</h3><p>${escapeText(prompt)}</p>${pill('商品')}${pill('一镜到底')}<p class="muted">自有示例 · 无远端自动源</p></div></section><section class="panel">${input('标题','商品广告草稿')}${textarea('正文',prompt)}${input('标签','商品，一镜到底')}${button('保存到库',true)}${button('送往生成器编辑')}</section></div>`;
 else if(page.id==='P06')body+=tasks();
 else if(['P07','P08'].includes(page.id))body+=media(page);
 else if(page.id==='P09')body+=`<div class="cols"><section class="panel"><h3>Agent修改提案</h3>${status('尚未连接本机Agent；默认只读，不授予付费执行。')}<div class="diff"><div><h3>原revision 7</h3><p>文本节点：咖啡广告</p></div><div><h3>提案基于revision 7</h3><p>修改提示词，不包含运行批准。</p></div></div>${button('查看上下文')}${button('应用选中修改',true)}</section><aside class="panel"><h3>授权范围</h3>${input('上下文','当前选区')}${input('权限','只读')}<p class="muted">浏览器关闭后不承诺继续运行。</p></aside></div>`;
 else if(page.id==='P15')body+=`<section class="panel"><h3>本地操作时间线</h3><div class="row"><span>14:20 · 保存项目</span>${pill('示例记录')}</div><div class="row"><span>14:18 · 请求状态未知</span>${pill('待核对','warning')}</div><p class="muted">诊断排除Key、提示词全文和临时下载token；不是Core财务审计。</p>${button('导出脱敏诊断')}</section>`;
 else body+=settings(page);
 return `<div class="body">${body}</div>`;
}
function dialogContent(d){
 if(d.id==='D05')return `${status('确认本次视频提交可能产生费用；报价未知，具体以Core结算为准。')}<div class="row">本次节点数量<span>1项 · 不包含未来下游</span></div><div class="row">视频模型<span>未核验 · 无可执行模型</span></div><div class="row">目标规格<span>5秒 / 9:16</span></div><div class="row">参考素材<span>无 · 纯文字草稿</span></div><div class="row">连接与授权<span>未连接 · 当前标签页无Key</span></div>${textarea('将发送的提示词（示例）',prompt)}${status('缺少已核验能力、会话授权与成功持久化证据，确认提交不可用。','error')}`;
 if(d.id==='PGD02')return `${status('可能产生文字调用费用，具体以Core结算为准。视频生成需要另一轮确认。')}<div class="row">文字模型<span>尚未确认 · 禁止视频别名</span></div><div class="row">内容范围<span>文字需求 / 锁定要求 / 参考说明</span></div>${textarea('将发送的原始文字',request)}<p class="muted">不发送媒体二进制；确认前保存PromptRun、最终快照与幂等键。</p>${status('当前无已核验文字能力，确认按钮禁用。','error')}`;
 if(d.id==='PGD03')return `${status('请明确选择；未解决冲突前不能AI提交或生成。','error')}<div class="diff"><div><h3>原始需求 · 原文保留</h3><p>5秒 / 9:16</p><p>品牌“星链咖啡” · 对白“早上好”</p>${button('采用原始需求')}</div><div><h3>表单示例 · 存在冲突</h3><p>15秒 / 16:9</p><p>与明确要求不一致</p>${button('采用表单值')}</div></div><p class="muted">没有预选值，不将4:5自动改为9:16；锁定人物、品牌、对白和不切镜要求。</p>`;
 if(['D15','D14','PGD04'].includes(d.id))return `<div class="diff"><div><h3>来源revision 7</h3><p>${escapeText(prompt)}</p></div><div><h3>当前revision 8</h3><p>人物动作已被人工修改。</p></div></div>${status('提案版本已落后。需要重读比较或另存新节点，不覆盖人工编辑。','error')}<p>修改批准与生成批准分别处理。</p>`;
 if(['D20','D23'].includes(d.id))return `${status('本次修改尚未保存。新收费提交已阻止，内存草稿保留。','error')}<div class="row">错误分类<span>示例 QuotaExceededError</span></div><div class="row">项目revision<span>持久7 / 内存8</span></div><p>可以重试保存、清理可重建缓存或紧急导出草稿；不清空任务记录。</p>`;
 if(['D21','PGD06'].includes(d.id))return `${status('响应结果不明，保留原请求身份与快照。不得自动新键重发。','warn')}<div class="row">本地run<span>示例 run-unknown</span></div><div class="row">幂等键<span>示例 key-fixed-001</span></div><div class="row">请求快照<span>已冻结 · 禁止改body</span></div><div class="row">账务<span>未提供</span></div><p>停止等待不等于取消或退款；没有已验证的恢复接口时留待人工核对。</p>`;
 if(d.id==='D24')return `${status('另一个标签页持有写者租约，当前以只读方式打开。')}<div class="row">当前项目<span>咖啡品牌</span></div><div class="row">最近写者活动<span>示例 14:20</span></div><div class="row">当前revision<span>8</span></div><p>显式接管后重新加载最新图；旧epoch失效。接管不会重新提交已发送run，也不传递旧Key。</p>`;
 if(['D01','D02','D09','PGD01'].includes(d.id))return `${input('名称（1–60字符）','咖啡品牌 · 草稿')}${textarea(d.id==='D09'?'提示词正文':'说明（0–500字符）',d.id==='D09'?prompt:'原创示例内容，不包含真实素材或凭据。')}<p class="muted">${escapeText(d.rule)}</p>`;
 if(d.id==='D12')return `${input('原服务档案','自有Core服务')}${input('原任务授权绑定','binding-demo')}${input('普通Key（当前标签页内存）','','password')}<p>新Key不改写历史任务归属；只验证原任务读取，不自动重新生成。</p>`;
 if(['D19','D03'].includes(d.id))return `${status('存在1个示例未知任务，永久删除被阻止。','error')}<div class="row">项目<span>咖啡品牌</span></div><div class="row">共享素材<span>2个 · 保留</span></div><div class="row">活动/未知追踪<span>1个 · 不可擦除</span></div>${input('确认词','')}<p>${escapeText(d.rule)}</p>`;
 if(['D04','D17','D16','D22'].includes(d.id))return `<div class="tabs"><span>检查</span><span>预览</span><span>确认</span></div><div class="row">示例文件<span>咖啡品牌.awstudio.zip</span></div><div class="row">完整性<span>待校验 · 不报告成功</span></div><div class="row">凭据 / 脚本<span>排除且不执行</span></div><p>${escapeText(d.fields)}</p>${status(escapeText(d.rule))}`;
 if(['D10','D11'].includes(d.id))return `<div class="player"><div class="play">▷</div><p>原创占位 · 无媒体请求</p></div><p>${escapeText(d.fields)}</p><p class="muted">${escapeText(d.rule)}</p>`;
 return `<section class="panel"><h3>本次内容与范围</h3>${d.fields.split(/[；、]/).map(field=>`<div class="row"><span>${escapeText(field)}</span><span class="muted">静态待确认</span></div>`).join('')}</section>${status(escapeText(d.rule))}`;
}
function renderDialog(){
 document.querySelector('.backdrop')?.remove();
 const d=data.dialogs.find(d=>d.id===currentDialog);if(!d)return;
 const div=document.createElement('div');div.className='backdrop';
 div.innerHTML=`<section class="dialog width-${d.width}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-head"><small>${d.id} · 静态评审</small><h2 id="dialog-title">${escapeText(d.title)}</h2></header><div class="dialog-body">${dialogContent(d)}</div><footer class="dialog-footer">${button('取消 / 返回')}${button(d.actions.split(/[；/]/)[0].trim(),true)}</footer></section>`;
 document.body.append(div);
}
function render(){
 const page=data.pages.find(p=>p.id===currentPage)||data.pages[2];
 document.documentElement.dataset.theme=currentTheme;
 const active=page.id==='P21'?'提示词生成':page.id==='P06'?'任务':page.id==='P04'?'素材':'项目';
 const save=currentState==='error'?'尚未保存 · 收费提交禁用':currentState==='loading'?'读取中':currentState==='readonly'?'只读 · 其他标签正在编辑':'静态保存状态样例';
 document.getElementById('stage').innerHTML=`<div class="shell"><aside class="rail" aria-label="产品导航静态示意"><div class="logo">AW</div>${['项目','素材','提示词生成','提示词库','任务','活动','设置','帮助'].map(title=>`<div class="item ${title===active?'active':''}">${title}</div>`).join('')}</aside><main class="main"><header class="topbar"><div class="title">${escapeText(page.id+' · '+page.title)}　${pill(save,currentState==='error'?'warning':'')}</div><div class="actions">${pill('未连接')}${button('撤销')}${button('导出草稿')}</div></header>${content(page)}</main></div>`;
 renderDialog();
 for(const [id,value] of [['review-page',page.id],['review-state',currentState],['review-theme',currentTheme],['review-dialog',currentDialog]])document.getElementById(id).value=value;
 document.body.dataset.page=page.id;document.body.dataset.state=currentState;
}
for(const page of data.pages)document.getElementById('review-page').add(new Option(page.id+' '+page.title,page.id));
for(const dialog of data.dialogs)document.getElementById('review-dialog').add(new Option(dialog.id+' '+dialog.title,dialog.id));
function change(){currentPage=document.getElementById('review-page').value;currentState=document.getElementById('review-state').value;currentTheme=document.getElementById('review-theme').value;currentDialog=document.getElementById('review-dialog').value;render();}
for(const id of ['review-page','review-state','review-theme','review-dialog'])document.getElementById(id).addEventListener('change',change);
document.getElementById('review-open-dialog').addEventListener('click',()=>{if(!currentDialog)currentDialog='D05';renderDialog();});
document.getElementById('review-close-dialog').addEventListener('click',()=>{currentDialog='';document.getElementById('review-dialog').value='';renderDialog();document.getElementById('review-open-dialog').focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&currentDialog){currentDialog='';renderDialog();document.getElementById('review-dialog').value='';document.getElementById('review-open-dialog').focus();}});
render();
