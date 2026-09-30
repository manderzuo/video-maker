// Selectively adapted from manderzuo/prompt-for-seedance-gptimage2.5
// d8ba7c104ba7c24e3d28b0c3bede8764544bea8b src/optimizer/videoRules.js, MIT.
// Full license retained in third-party/THIRD_PARTY_NOTICES.txt.
export type VideoScene={id:string;title:string;hint:string;guidance:string};
export const VIDEO_SCENES:readonly VideoScene[]=[
 {id:'text',title:'纯文本叙事',hint:'从创意组织主体、动作、场景和镜头。',guidance:'采用“主体描述 + 动作序列 + 环境与光影 + 镜头语言 + 风格”的顺序，先写清楚发生什么，再写怎么拍。'},
 {id:'consistency',title:'角色 / 商品一致性',hint:'说明参考素材的用途和连续性。',guidance:'每个参考素材都要说明用途，例如人物参考或场景参考，避免只罗列素材而不说明关系。'},
 {id:'camera',title:'运镜与动作复刻',hint:'说明参考中的运镜、动作和节奏。',guidance:'把参考视频拆成运镜、景别、动作、速度和节奏，明确哪些内容复刻、哪些内容替换。'},
 {id:'transition',title:'特效与转场复刻',hint:'描述起点、过程和终点。',guidance:'先描述转场或特效的起点、过程和终点，再指定需要替换的主体，避免只写“做得炫酷”。'},
 {id:'story',title:'剧情与对白',hint:'按时间顺序编排画面、台词、情绪和音效。',guidance:'按时间顺序拆分画面、对白、角色状态和声音；对白单独标注角色与情绪，避免台词混入动作描述。'},
 {id:'extension',title:'视频延长',hint:'围绕原视频结尾编写后续内容。',guidance:'先写上一段视频的结尾状态，再写新增片段；衔接点保持连续，分段上限须另行核验。'},
 {id:'sound',title:'声音设计',hint:'分别说明对白、旁白、环境声和音效。',guidance:'将对白、旁白、环境声、动作音效和音乐分别写清楚，并说明声音出现的时间和情绪。'},
 {id:'one-take',title:'一镜到底',hint:'规划连续空间和镜头路径。',guidance:'建立可连续行走的空间路径，明确镜头从哪里开始、经过哪里、如何转向和在哪里结束，全程不要切镜。'},
 {id:'edit',title:'视频编辑',hint:'仅编写原视频中的保留、替换和增减要求。',guidance:'明确原视频中保留的部分、替换的部分和新增的部分；涉及人物或商品时，写清楚新旧元素的对应关系。'},
 {id:'beat',title:'音乐卡点',hint:'让画面变化、动作和镜头节奏贴合音乐。',guidance:'先确定音乐的节拍或段落，再安排画面、动作重音和镜头变化；用户要求不切镜时保持镜头连续。'},
 {id:'product',title:'商品广告',hint:'强化产品展示、材质和品牌画面。',guidance:'优先呈现产品轮廓、材质、关键细节和使用方式，补充稳定的产品运动、光线和干净背景。'},
];
