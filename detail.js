/* 详情页统一渲染：day / place / topic / route / plans。
   事实只来自 site-data.js（索引）＋ data/js/<类型>_<id>.js（单页切片）。
   渲染层只做两件事：去掉内部口径与过程痕迹；把长段落拆成「结论句 ＋ 依据」。 */

/* ══ 文本层 ══════════════════════════════════════════════════════ */
/* 括号里只要出现这些内部口径词，整段删掉：读者不需要看到复核、简报、ASR、模块引用等字样 */
const CLEAN_PAREN = /性质|口径|按人|按车|作者|截图|OCR|图内文字|画面文字|视频口述|图注|字幕|自述|攻略卡|广告牌|广告帖|宣传帖|引流标题|非商家|E\s?推算|商家\s*[A-F]|原文|非来源|来源直给|评论|正文|复核|未标|转述|私信|图证|底库|核验|简报|内部|生成|版本|样本|对照|执行卡|读数|底线|基线|两步路|KML|Codex|handoff|攻略整理|校准|ASR|模块|素材|白名单|待核|硬约束|裁决|不影响结论|自主加价|无强证据|无人回答|没人回答|不涉及|性质＝|性质=|算式|折算|两源|单源|独立源|源一致|负面参照|正面参照|参照|采集|整理|笔记|见\s*0\d|见\s*[a-z_]|[A-F]\s?\d|[A-F]\s*级|→\s*[A-F]|[一二三四五六七八九十\d]\s*版|图\s?\d/;

/* 采集笔记里的第一人称叙事与原帖长句：数据层不动，渲染层统一改成第三人称结论。
   只保留能直接用的现场事实，不保留作者口吻、论文式铺陈和搬运痕迹。 */
const NARRATIVE_REWRITE = [
  [/山下禾木村热闹非凡[^。！？]*?我们(?:俩|两个|两个人|两)?却在天黑之后上山睡觉/g,
   '天黑后上山住宿，能避开山下夜间人流，睡得更安静。'],
  [/禾木是中国边境地带[^。！？]*?深山老林里面的一个孤独的小村子[^。！？]*?进出就一条路[^。！？]*?民宿就那么几家/g,
   '禾木村位置偏远，进出主要靠一条路，可选住宿不多，旺季要提前订。']
];
function cleanText(v, noDigest) {
  if (v == null) return '';
  let t = String(v);
  NARRATIVE_REWRITE.forEach(function (r) { t = t.replace(r[0], r[1]); });
  /* 0a · 原帖口吻的长引号段：正文不直接贴原句，压成一句可读的提炼；
     原帖本身只保留在每页文末的「代表原帖」入口。 */
  if (!noDigest) t = t.replace(/[“「『]([^”」』]{20,})[”」』]/g, function (m, inner) {
    return digestOf(inner, 34);
  });
  t = t.replace(/[“”"'‘’「」]/g, '');
  /* 0 · 先把括号里的出处标记（作者＋日期）剥掉，同一个括号里的里程、价格等事实要保留 */
  t = t.replace(/(?:作者|楼主|发布人)\s*\d{4}(?:[-/年.]\d{1,2})?(?:[-/月.]\d{1,2})?日?\s*[，、]?/g, '');
  t = t.replace(/(?:亲测|实测|实拍)\s*\d{4}(?:[-/年.]\d{1,2})?(?:[-/月.]\d{1,2})?日?/g, '');
  t = t.replace(/\d{4}(?:[-/年.]\d{1,2})?(?:[-/月.]\d{1,2})?日?\s*(?:亲测|实测|实拍)/g, '');
  t = t.replace(/(?:作者|楼主|发布人)\s*[，、]?/g, '');
  /* 0b · 搬运／采集痕迹：正文、原文、图内文字、视频画面文字、评论、回复、商家文案等，
     读者不需要看到原帖的载体与栏目名；只在这类词“独立成标记”时删，不碰正文里的同形词。 */
  /* 标记词分两组：无歧义的直接删（后面可紧接正文），有歧义的只在“独立成标记”时删 */
  const SEP = '[；;、，。！？/／＋+|｜→＞>—–\\-\\s：:]';
  /* “图内公示牌”保留现场含义，改成读者能懂的词；其余“图内文字／图内”是采集痕迹，删掉 */
  t = t.replace(/图内公示牌/g, '现场公示牌');
  t = t.replace(new RegExp('(^|' + SEP + ')[＋+]?\\s*[/／]?\\s*(?:正文|原文|图内文字|图内|附图|画面文字|视频画面文字|视频口述|图注|字幕|截图|OCR|ASR)(?:\\s*[（(][^（）()]{0,30}[）)])?', 'g'), '$1');
  t = t.replace(new RegExp('(^|' + SEP + ')[＋+]?\\s*[/／]?\\s*(?:照片|评论(?!区|员|量)|回复(?!私)|作者回复|商家文案|商家广告|商家帖|软文|自述|实录|口述)(?:\\s*[（(][^（）()]{0,30}[）)])?(?=' + SEP + '|$)', 'g'), '$1');
  /* 单独成段的纯日期括号（2025-09）是采集时间戳 */
  t = t.replace(/(^|[；;、，。！？：:｜|＋+\s])[（(]\s*(?:19|20)\d{2}(?:[-/年.]\d{1,2})?(?:[-/月.]\d{1,2})?日?\s*[）)]\s*/g, '$1');
  /* 图号（图00／图04）只是原帖配图索引 */
  t = t.replace(/(^|[^0-9A-Za-z])图\s?\d{1,2}(?![0-9.．])/g, '$1');
  /* 方括号里的联网核验、抓取时间戳等内部记录整块删除 */
  t = t.replace(/[\[【][^\[\]【】]{0,70}(?:联网核验|核验|底库|台账|抓取)[^\[\]【】]{0,70}[\]】]/g, '');
  t = t.replace(/[（(]\s+/g, '（');
  t = t.replace(/\s+[）)]/g, '）');
  /* 1 · 括号内出现内部口径词 → 整个括号删掉 */
  t = t.replace(/[（(]([^（）()]{0,300})[）)]/g, (m, inner) => CLEAN_PAREN.test(inner) ? '' : m);
  /* 括号里整段只是“文案／宣传／引流”这类搬运来源的说明，也一并删掉 */
  t = t.replace(/[（(]\s*[^（）()]{0,50}(?:文案|宣传|引流标题|软文|广告帖|宣传帖|商家帖)[^（）()]{0,50}[）)]/g, '');
  /* 2 · 模块／页面引用：见 ahe_road、详见 haden_view 模块、见tierekeiti alternatives */
  t = t.replace(/(?:详见|参见|见)\s*[a-z_][a-z0-9_]{1,}(?:\s*[/／]\s*[a-z_][a-z0-9_]*)*(?:\s*(?:[a-z_][a-z0-9_]*|模块|页面|段))?/g, '');
  t = t.replace(/[a-z_]{3,}\s*(?:模块|页面|段)/g, '相关攻略');
  t = t.replace(/(?:本|该|此)\s*模块/g, '这一站');
  /* 3 · 台账／简报／底库／正式版／版本号等内部出处，连同后面的编号一起删 */
  t = t.replace(/(?:根据|按|见|出自|来自)?\s*(?:简报|台账|底库|正式版|旧稿|旧口径|旧采用值|过程稿)\s*(?:§|第)?\s*[\d.一二三四五六七八九十]*[^，。；！？）)]{0,24}/g, '');
  t = t.replace(/§\s*[\d.]+[^，。；！？）)]{0,22}/g, '');
  t = t.replace(/(?:详见|参见|见)\s*0\d(?:\s*§\s*[一二三四五六七八九十\d.]+)?(?:\s*[/／]\s*\d+)?[^，。；！？）)]{0,6}/g, '');
  /* 4 · 坐标白名单这类内部核验句：整句删（是内部 QA 口径，不是旅行事实） */
  t = t.replace(/[^，。；！？]*白名单[^，。；！？]*/g, '');
  t = t.replace(/(?:已核验|已核|版本号|生成器|生成日期|切片数据|本站|本页|本文|内部代号|等级码|项核验|待补充|待核验|待核实|素材内|素材中|素材里|素材)\s*v?\d*\s*/g, '');
  /* 原帖配图号与「楼中楼」这类版内指代，读者看不到原帖时没有意义 */
  t = t.replace(/(?:作者)?楼中楼[:：]?\s*/g, '');
  t = t.replace(/(^|[^A-Za-z0-9])P\d{1,2}(?![0-9A-Za-z])的?[是为]?/g, '$1');
  t = t.replace(/无法从\s*KML\s*切出/g, '无法精确切出');
  t = t.replace(/(?:KML|kml)\s*/g, '');
  /* 5 · 内部评级码：A—F 等级码、D5／F2 这类腿号与冲突码 */
  t = t.replace(/(^|[^A-Za-z0-9])[A-F]\d{1,2}(?![0-9A-Za-z])的?/g, '$1');
  t = t.replace(/(?:根据|依据)?\s*基线\s*v?\d+(?:\.\d+)?[^，。；！？）)]{0,22}/g, '');
  /* 含版本号的整句是过程痕迹（曾判／改判），整句删掉，避免留下“曾判…改…”的断裂句 */
  t = t.replace(/(^|[；;。！？])\s*[^；;。！？]*[vV]\d+(?:\.\d+)?[^；;。！？]*/g, '$1');
  t = t.replace(/(^|[^A-Za-z0-9_])[vV]\d+(?:\.\d+)?(?![0-9])/g, '$1');
  t = t.replace(/[A-F]\s*冲突/g, '');
  t = t.replace(/(^|[^0-9A-Za-z])[A-F]\s*级[^，。；！？）)]{0,12}/g, '$1');
  t = t.replace(/(?:存在)?定\s*[A-F](?![A-Za-z0-9])/g, '');
  t = t.replace(/[→>-]\s*(?:金额|等级|定性|参数|推算)\s*[A-F](?![A-Za-z0-9])/g, '');
  t = t.replace(/(?:为|是|定为|列为)\s*[A-F](?![A-Za-z0-9])/g, '');
  t = t.replace(/[→>-]\s*[A-F](?![A-Za-z0-9])/g, '');
  t = t.replace(/[，、；]\s*[A-F]\s*(?=[，。；、）)]|$)/g, '');
  t = t.replace(/L\d+[a-z]?(?:\s*[—\-－]\s*L?\d+[a-z]?)?/g, '相关路段');
  /* 5b · 价格基价／计价单位：内部简写改成读者语言 */
  t = t.replace(/([（(]?)\s*按人\s*([）)]?)/g, '每人');
  t = t.replace(/([（(]?)\s*按车\s*([）)]?)/g, '每车');
  t = t.replace(/([（(]?)\s*按趟\s*([）)]?)/g, '每趟');
  t = t.replace(/([（(]?)\s*按晚\s*([）)]?)/g, '每晚');
  t = t.replace(/([（(]?)\s*按间\s*([）)]?)/g, '每间');
  t = t.replace(/([（(]?)\s*按天\s*([）)]?)/g, '每天');
  t = t.replace(/([（(]?)\s*按次\s*([）)]?)/g, '每次');
  /* 依据串里的内部核验结论、来源编号、团费口径，整段删掉 */
  t = t.replace(/(^|[；;。！？])\s*按(?:人|车|趟|晚|间|天|次)(?:未明说|不明)?\s*(?=[；;。！？]|$)/g, '$1');
  t = t.replace(/(?:金额|价格|时长|里程|时间|总数)?\s*与?\s*(?:时长|金额|价格|里程|总数)?\s*[两双][源篇]?(?:独立)?(?:一致|互证)[^；;。！？]{0,14}[；;]?/g, '');
  t = t.replace(/(?:^|[；;。！？])\s*(?:不涉及|不含|含)门票?\s*[（(][^（）()]{0,10}[）)]\s*(?=[；;。！？]|$)/g, '');
  t = t.replace(/[（(]\s*[A-F]\s*(?:算式|折算)?[：:，,]?\s*/g, '（');
  /* 7b · 残留的引用尾巴、孤立括号、内部口径短语 */
  t = t.replace(/[（(][^（）()]*$/g, '');          /* 只有左括号开头、没有收口的尾巴 */
  t = t.replace(/^[^（()]*[）)]\s*/g, '');          /* 只有右括号收口、没有开头的尾巴 */
  t = t.replace(/无人回答|没人回答/g, '需现场确认');
  /* 段落内部代号：B（提前下撤）、D（误区间车）、E：推算 这类腿码只留说明文字 */
  t = t.replace(/(^|[；;。！？，、])\s*[A-F]\s*[（(]([^（）()]{0,24})[）)]\s*[：:]?\s*/g, '$1$2：');
  t = t.replace(/(^|[；;。！？，、])\s*[A-F]\s*[：:]\s*/g, '$1');
  t = t.replace(/多篇独立亲测/g, '多篇亲测');
  /* “评论牌子上写…”这类：把来源词变成引导词，信息不丢 */
  t = t.replace(new RegExp('(^|' + SEP + ')(评论)(?!区|员|量)(?=[\\u4e00-\\u9fa5])', 'g'), '$1$2：');
  /* 会留在正文里的采集词，换成读者语言 */
  t = t.replace(/商家文案/g, '商家说法');
  t = t.replace(/商家帖/g, '商家信息');
  t = t.replace(/商家广告/g, '商家信息');
  t = t.replace(/未标年份|未标/g, '未注明');
  t = t.replace(/(^|[｜|，,；;、\s])[/／]\s*[A-F](?![A-Za-z0-9])/g, '$1');
  t = t.replace(/多篇独立/g, '多篇亲测');
  /* 内部段落指代（“只进本节”）去掉后保留其后的事实 */
  t = t.replace(/[^，。；！？]{0,20}(?:只进本(?:节|模块|页|章))\s*[：:，,]?\s*/g, '');
  t = t.replace(/(需现场确认)(?:[，、]\s*需现场确认)+/g, '$1');
  t = t.replace(/[，、]?\s*(?:未知|不明|不清楚|没问到)[，、]?\s*(?:需现场确认|需复核|待复核|待核验|待核实|待核|需核|未核)\s*[，、]?/g, '需现场确认');
  t = t.replace(/(?:回复私|私信回复|私信)\s*[→>\-]*\s*(?:无|未回复|未答|未知)?[，、]?/g, '需现场确认');
  t = t.replace(/(需现场确认)([，、]?\s*需现场确认)+/g, '$1');
  t = t.replace(/无强证据|无证据|没有证据|无营业证据/g, '没有可靠来源');
  t = t.replace(/证据照/g, '打卡照');
  t = t.replace(/证据/g, '记录');
  t = t.replace(/两步路/g, '轨迹记录');
  t = t.replace(/其它?模块/g, '其他点位');
  t = t.replace(/须?由\s*Codex\s*主方案决定/g, '由路线方案统一决定');
  t = t.replace(/Codex|codex/g, '');
  t = t.replace(/验收用\s*/g, '最紧按 ');
  t = t.replace(/需现场确认确认/g, '需现场确认');
  t = t.replace(/楼中楼/g, '');
  t = t.replace(/素材(?:内|中|里)?无记录/g, '没有明确记录');
  t = t.replace(/素材(?:内|中|里)/g, '');
  /* 6 · 内部说法改成对外说法 */
  t = t.replace(/需复核|待复核/g, '需现场确认');
  t = t.replace(/复核/g, '现场确认');
  t = t.replace(/待核验|待核实|待核/g, '需现场确认');
  t = t.replace(/口径不明|口径待核/g, '');
  t = t.replace(/口径/g, '');
  t = t.replace(/(?:[→>-]\s*)?不明\s*(?=[，。；、）)]|$)/g, '未确认');
  t = t.replace(/＋\s*双独立一致|＋\s*单源|单源\s*[→>-]?|两源独立一致/g, '');
  t = t.replace(/\s*[＋+]?\s*两独立(?:一致)?/g, '');
  t = t.replace(/[一两三四五]\s*[篇处个]?\s*(?:独立(?:一致|同向)?|卡片|来源)/g, '');
  t = t.replace(/(?:已标|标注|标为|标)\s*[A-F](?![A-Za-z0-9])\s*/g, '');
  t = t.replace(/第[一二三四五六七八九十\d]+轮(?:文档|简报|稿|底稿)/g, '');
  t = t.replace(/\s*[＝=]\s*/g, '：');
  t = t.replace(/[（(]\s*[）)]/g, '');
  /* 6b · 人称与来源口吻：详情页统一第三人称，不再出现「我们／我俩」 */
  t = t.replace(/我们(?:俩|两个人|两个|两)?|咱们|我俩/g, '同行者');
  t = t.replace(/(^|[，。；：、！？\s])我(?=[^们])/g, '$1同行者');
  /* 7 · 版面清理 */
  /* 括号被整段删掉后可能留下悬空标点：断首“），”“）”，或“（，” */
  t = t.replace(/^[）)]\s*[，、。；：＋+]?\s*/g, '');
  t = t.replace(/[＋+]\s*([；;])/g, '$1');
  t = t.replace(/[＋+]\s*(?=[；;、，。｜|]|$)/g, '');
  t = t.replace(/([｜|])\s*[，、；:：]\s*/g, '$1');
  t = t.replace(/[→>]+\s*$/g, '');
  /* 说明文字里的采集散件：OCR／ASR 字样、附图、只进某模块、性质＝ */
  t = t.replace(/\b(?:OCR|ASR)\b/g, '');
  t = t.replace(/附图/g, '');
  t = t.replace(/性质\s*[＝=：:]?\s*/g, '');
  t = t.replace(/自述|转述/g, '');
  t = t.replace(/(\d{4}(?:[-/年.]\d{1,2})?(?:[-/月.]\d{1,2})?日?)\s*(?:自述|口述)/g, '$1');
  t = t.replace(/[（(]\s*[＋+]\s*/g, '（');
  t = t.replace(/只进\s*[a-z_]+[，、]?/g, '');
  t = t.replace(/\s*[＋+]\s*[＋+]\s*vs\s*[＋+]*\s*/g, ' vs ');
  t = t.replace(/[＋+]{2,}/g, '、');
  t = t.replace(/[＋+]+\s*(?=[｜|]|$)/g, '');
  t = t.replace(/[（(]\s*[，、；：]+/g, '');
  t = t.replace(/([，。；：、]|^)\s*[→>-]\s*(?=[\u4e00-\u9fa5])/g, '$1');
  t = t.replace(/([，。；：、]|^)\s*[—－-]{1,2}\s*(?=[\u4e00-\u9fa5])/g, '$1');
  t = t.replace(/([）)])\s*[→>-]{1,2}\s*(?=[\u4e00-\u9fa5\d])/g, '$1，');
  t = t.replace(/([\u4e00-\u9fa5）)])\s*[→>-]+\s*(?=[\u4e00-\u9fa5\d])/g, '$1→');
  t = t.replace(/[（(]\s*[，、；]+/g, '（');
  t = t.replace(/[，、；]+\s*[）)]/g, '）');
  t = t.replace(/[，；、]\s*([。！？])/g, '$1');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\s+([，。；：、）!?])/g, '$1');
  t = t.replace(/([，；、])\1+/g, '$1');
  t = t.replace(/[，；、]\s*[，；、]/g, '，');
  /* 只在句首去掉标点／箭头。注意不能写成 [→>-—－]：中间那个连字符会被当成
     U+003E–U+2014 的字符区间，把 K9752、G219、B1000 这类字母＋数字的首字母吃掉。 */
  t = t.replace(/^[，；、。：＋+\s→＞>—–－\-]+/, '');
  t = t.replace(/[，；、]\s*$/, '');
  /* 8 · 依据串逐段过滤：以「；」分段的内部核验串，只留读者能用的部分 */
  if (/[；;]/.test(t)) {
    const META = /(?:源一致|两源|单源|独立源|已核验|已核|待核|核验通过|定[A-F](?![A-Za-z0-9])|性质＝|性质=|等级码|裁决|样本|口径|算式|折算|台账|底库|过程稿|验收|基线)/;
    const keep = t.split(/[；;]/).map(function (seg) {
      const x = seg.trim().replace(/^[，、。]+/, '').replace(/[，、]+$/, '');
      if (!x || META.test(x)) return '';
      if (/^(?:按人|按车|按趟|按晚|按间|按天|按次|含门票|不含门票|不涉及门票|得多|一般|正常)$/.test(x)) return '';
      if (x.length <= 3 && !/^\d/.test(x)) return '';
      return x;
    }).filter(Boolean);
    if (keep.length) t = keep.join('；');
  }
  t = t.replace(/^(?:见|详见|参见|依据|来源)[，、：:\s]*/g, '');
  t = t.replace(/[，、；：]+\s*$/g, '');
  /* 9 · 收尾：前面步骤删掉的散件可能留下悬空符号 */
  t = t.replace(/\b(?:OCR|ASR)\b/g, '');
  t = t.replace(/附图/g, '');
  t = t.replace(/性质\s*[＝=：:]?\s*/g, '');
  t = t.replace(/自述|转述/g, '');
  t = t.replace(/(\d{4}(?:[-/年.]\d{1,2})?(?:[-/月.]\d{1,2})?日?)\s*(?:自述|口述)/g, '$1');
  t = t.replace(/[（(]\s*[＋+]\s*/g, '（');
  t = t.replace(/[＋+]\s*(?=[；;、，。｜|→>]|$)/g, '');
  t = t.replace(/(^|[；;。！？｜|])\s*[＋+]\s*/g, '$1');
  t = t.replace(/^[，、。；：＋+\s]+/, '');
  return t.trim();
}

function cleanList(arr) { return (arr || []).map(cleanText).filter(Boolean); }

/* 提炼：把原帖口吻的长句压成一句读者能直接用的结论。
   只做两件事——按标点（必要时按空格）切成分句，挑带数字与关键信息的；
   不走 cleanText 的引号提炼分支，避免递归。 */
const DIGEST_KEY = /(公里|km|米|小时|分钟|门票|免费|停车|住宿|民宿|客栈|青旅|露营|帐篷|热水|充电|卫生间|厕所|区间车|接驳|摆渡|班车|排队|司机|价格|元|难走|陡|土路|石子|风景|日出|日落|晨雾|秋色|叶子|步道|观景台|换乘|信号|加油|距离|往返|单程|爬升|海拔|超市|亭子|提前|必须|不能|不要)/;
function digestOf(raw, cap) {
  const t = cleanText(raw, true);
  const c = Math.max(20, cap || 40);
  if (!t || t.length <= c) return t;
  /* 短摘录先按句读就近断句：宁可少说一点，也不把一句话切在半截。 */
  if (c <= 80) {
    let cut = c;
    while (cut > 12 && !/[。！？；，]/.test(t.charAt(cut - 1))) cut -= 1;
    if (cut > 12) {
      let head = t.slice(0, cut).replace(/[，、；：]+$/, '');
      if (head.length >= c * 0.55) return head + '…';
    }
  }
  let parts = t.split(/[，。；、！？]+/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 3) parts = t.split(/[，。；、！？\s]+/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return t.slice(0, c).replace(/[，、；：]$/, '') + '…';
  const scored = [];
  parts.forEach(function (x, i) {
    let sc = 0;
    if (/\d/.test(x)) sc += 3;
    if (DIGEST_KEY.test(x)) sc += 2;
    if (x.length >= 6 && x.length <= 28) sc += 1;
    if (x.length > 34) sc -= 2;
    if (/^(我|我们|你|你们|咱们|他们|他|她|这|那|所以|但是|因为|就是|真的)/.test(x)) sc -= 1;
    scored.push({ x: x, i: i, s: sc });
  });
  const pick = scored.filter(o => o.s > 0).sort((a, b) => (b.s - a.s) || (a.i - b.i));
  const keep = [];
  let len = 0;
  pick.forEach(function (o) {
    if (keep.length && len + o.x.length + 1 > c) return;
    keep.push(o); len += o.x.length + 1;
  });
  keep.sort((a, b) => a.i - b.i);
  let out = keep.map(o => o.x).join('；').replace(/[，、；：]+$/, '');
  if (!out) out = t.slice(0, c).replace(/[，、；：]$/, '');
  if (out.length > c) {
    let cut = c;
    while (cut > 12 && !/[。！？；，]/.test(t.charAt(cut - 1))) cut -= 1;
    out = (cut > 12 ? t.slice(0, cut) : out).replace(/[，、；：]+$/, '');
  }
  return out + '…';
}

function sents(t) {
  const m = String(t == null ? '' : t).match(/[^。！？；]+[。！？；]?/g) || [];
  return m.map(x => x.trim()).filter(Boolean);
}
function splitLead(first) {
  if (first.length <= 96) return [first, ''];
  let cut = first.lastIndexOf('，', 88);
  if (cut < 30) cut = first.lastIndexOf('、', 88);
  if (cut < 30) cut = 88;
  return [first.slice(0, cut + 1), first.slice(cut + 1)];
}
/* 摘要：字数是硬上限（默认 90），超长句在标点处断开，不再靠 88 字的固定切点 */
function leadOf(t, cap) {
  const first = sents(t)[0] || '';
  if (!first) return '';
  const c = Math.max(14, cap || 90);
  if (first.length <= c) return first;
  let cut = -1;
  ['，', '、', '；', '：', '（'].forEach(ch => { const i = first.lastIndexOf(ch, c); if (i > cut) cut = i; });
  if (cut < Math.floor(c * 0.45)) cut = c - 1;
  return first.slice(0, cut + 1).replace(/[，、；：]$/, '').replace(/[（(][^（）()]*$/, '') + '…';
}
function chunks(t, max) {
  const out = []; let buf = '';
  sents(t).forEach(s => {
    if (buf && buf.length + s.length > max) { out.push(buf); buf = ''; }
    buf += s;
  });
  if (buf) out.push(buf);
  return out;
}
/* 结论先行：首句加粗，其余按 118 字分组为小字依据 */
function paraHTML(text, cls) {
  const t = cleanText(text);
  if (!t) return '';
  const s = sents(t);
  const first = s.shift() || '';
  const parts = splitLead(first);
  let out = '<p class="p-lead">' + esc(parts[0]) + '</p>';
  chunks(parts[1] + s.join(''), 118).forEach(c => { out += '<p class="p-body">' + esc(c) + '</p>'; });
  return '<div class="paras ' + (cls || '') + '">' + out + '</div>';
}
function itemHTML(raw) {
  const t = cleanText(raw);
  if (!t) return '';
  const m = /^([^：:]{1,14})[：:]\s*([\s\S]+)$/.exec(t);
  const head = m ? m[1] : '';
  const body = m ? m[2] : t;
  const s = sents(body);
  const first = s.shift() || '';
  const parts = splitLead(first);
  const rest = parts[1] + s.join('');
  return '<li><b>' + esc(head || parts[0]) + '</b>'
    + (head ? '<span class="li-body">' + esc(parts[0]) + '</span>' : '')
    + (rest ? '<span class="li-ev">' + esc(rest) + '</span>' : '') + '</li>';
}
function ulHTML(arr, cls) {
  const items = (arr || []).filter(Boolean).map(itemHTML).filter(Boolean).join('');
  return items ? '<ul class="detail-list ' + (cls || '') + '">' + items + '</ul>' : '';
}
function withUnit(v, unit){              /* 字段缺失时不留 undefined */
  if (v == null || v === '') return '';
  return String(v) + (unit || '');
}
function isNum(v){                       /* 只给纯数字单元格右对齐，长句一律左对齐 */
  const t = String(v == null ? '' : v).replace(/\s+/g, '');
  if (!/\d/.test(t)) return false;
  return /^[¥￥\d.,%+\-–—~/]+(元|人|天|晚|件|公里|km|小时|分钟|米)?(\/人|\/件)?$/.test(t);
}
function rowsHTML(rows, cols, cls) {
  const body = (rows || []).filter(Boolean);
  if (!body.length) return '';
  return '<div class="wrap-tbl ' + (cls || '') + '"><table><thead><tr>'
    + cols.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>'
    + body.map(r => '<tr>' + r.map((c, i) => '<td'
      + (i ? (isNum(c) ? ' class="num"' : '') : ' class="lead-cell"') + '>'
      + esc(cleanText(c)) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table></div>';
}
/* ─ 设施与服务：先给结论，原始记录折叠在下面 ─────────────────── */
const FAC_TOKENS = ['厕所', '卫生间', '洗手间', '热水', '电源', '充电', '加油', '停车', '信号', '网络',
  '补给', '餐饮', '吃饭', '商店', '门票', '区间车', '行李', '寄存', '住宿', '露营', '边防证'];
const FAC_LONG = { lodging: '住哪', camp: '露营', supply: '吃住与补给', luggage: '行李寄存',
  ticket: '门票与区间车', food: '吃饭' };
function stripParen(s) { return String(s || '').replace(/[（(][^（）()]{0,120}[）)]/g, ''); }
function firstClause(t) {
  let s = stripParen(cleanText(t));
  s = s.split(/——|—{1,2}|--/)[0];
  s = s.split(/[①②③④⑤⑥⑦⑧⑨⑩]/)[0];
  return s.replace(/\s*[：:]\s*$/, '').trim();
}
function verdictOf(v) {
  let s = stripParen(String(v || '')).split(/——|—{1,2}/)[0];
  s = s.split(/[，。；、：:＋+→>①②③④⑤⑥⑦⑨⑩]/)[0].replace(/^[\s：:\-]+/, '').trim();
  s = s.replace(/^(作者|亲测|实测|楼主)(置顶|记录|口径)?\s*/, '').trim();
  if (!s) return '未核实';
  if (/^[A-F]$/.test(s)) return '多篇说法不一';
  if (/无记录|无证据|无素材|无条目|未知|未证实|待核|不明|^无$/.test(s)) return '未核实';
  if (s.length <= 2 && !/^(有|无|是|否|免费)/.test(s)) return '仅一处提及';
  if (s.length > 10) s = s.slice(0, 9) + '…';
  return s;
}
function facChips(raw) {
  const t = cleanText(raw);
  const out = [];
  FAC_TOKENS.forEach(function (k) {
    if (out.some(o => o[0] === k)) return;
    const m = new RegExp(k + '\\s*[：:]\\s*([^。；①②③④⑤⑥⑦⑧⑨⑩]{1,40})').exec(t);
    if (!m) return;
    out.push([k, verdictOf(m[1])]);
  });
  return out.slice(0, 8);
}
function moneyNums(t) {
  return (String(t).match(/(?:^|[^\d])(\d{2,4})(?!\d)/g) || [])
    .map(x => parseInt(String(x).replace(/\D/g, ''), 10))
    .filter(n => n >= 100 && n <= 4000 && !(n >= 1900 && n <= 2100));
}
function facCard(head, raw) {
  const t = cleanText(raw);
  if (!t) return '';
  const chips = facChips(t);
  const nums = moneyNums(t);
  const marks = (t.match(/[①②③④⑤⑥⑦⑧⑨]/g) || []).length;
  let note = '';
  if (/住|宿/.test(head || '') && nums.length >= 2) {
    note = '历史价 ' + Math.min.apply(null, nums) + '–' + Math.max.apply(null, nums) + ' 元/晚 · 2026 国庆待报';
  } else if (/露营/.test(head || '') && marks >= 2) {
    note = '已有点位 ' + marks + ' 处';
  }
  if (!chips.length) note = note || leadOf(firstClause(t), 66);
  const chipsHTML = chips.length ? '<div class="fac-chips">' + chips.map(c =>
    '<span class="fc"><i>' + esc(c[0]) + '</i>' + esc(c[1]) + '</span>').join('') + '</div>' : '';
  return '<div class="fac-card">'
    + (head ? '<div class="fac-head"><b>' + esc(head) + '</b>'
        + (note ? '<span>' + esc(note) + '</span>' : '') + '</div>' : '')
    + chipsHTML
    + '</div>';
}
function facBlock(fac) {
  const keys = Object.keys(fac || {});
  if (!keys.length) return '';
  return '<div class="fac-wrap">' + keys.map(k => facCard(FAC_LONG[k] || k, fac[k])).join('') + '</div>';
}
function facBlockList(pairs) {
  const list = (pairs || []).filter(x => x && x[1]);
  if (!list.length) return '';
  return '<div class="fac-wrap">' + list.map(x => facCard(x[0], x[1])).join('') + '</div>';
}

/* ─ 费用：项目 / 金额 / 口径 三列，原始记录折叠 ────────────────── */
const BASIS_TOKEN = /(按人|按车|按趟|按晚|按间|按天|按次|整包|含餐|不含餐|含早|含门票|不含门票|含等待|不含等待|含区间车|不含区间车|已成交|未成交|问价|自报|免费|往返|单程|接送|不进预算|现场价)/g;
function basisOf(s) {
  const t = cleanText(s);
  const out = [];
  (t.match(BASIS_TOKEN) || []).forEach(x => { if (out.indexOf(x) < 0) out.push(x); });
  return out.slice(0, 6);
}
function moneyTbl(rows) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return '';
  const parsed = list.map(function (r) {
    const head = cleanText(r[0]);
    const whole = cleanText(r[1]);
    const wholeRaw = cleanText(r[1], true);
    const parts = whole.split(/[｜|]/).map(x => x.trim()).filter(Boolean);
    let what = '', amount = '', tail = '';
    if (parts.length >= 2) {
      what = parts[0]; amount = stripParen(parts[1]).trim(); tail = parts.slice(2).join('；');
    } else {
      what = parts[0] || head; tail = whole;
      const m = /(\d[\d,.]*)\s*(?:元|块)(?:\s*[／/]\s*(?:人|车|趟|晚|间))?/.exec(whole);
      amount = m ? m[0] : '';
    }
    if (!amount || /^(未给价|未给|无报价|未给报价|待询价|待确认)$/.test(amount)) {
      const m2 = /(\d[\d,.]*)\s*(?:元|块)(?:\s*[／/]\s*(?:人|车|趟|晚|间))?/.exec(whole);
      amount = m2 ? m2[0] : '待报价';
    }
    if (/免费/.test(amount)) amount = '免费';
    let basis = basisOf(tail || whole);
    if (!basis.length) basis = basisOf(whole);
    return { head: head, what: what, amount: amount, basis: basis, raw: whole, rawFull: wholeRaw };
  });
  const body = parsed.map(function (p) {
    let label = [p.head, p.what].filter(Boolean);
    label = label.filter(function (v, i) { return label.indexOf(v) === i; }).join(' · ');
    return '<tr><td class="lead-cell">' + esc(label) + '</td>'
      + '<td class="num">' + esc(p.amount) + '</td>'
      + '<td>' + (p.basis.length
          ? p.basis.map(b => '<span class="bs">' + esc(b) + '</span>').join('')
          : '<span class="bs muted">待确认</span>') + '</td></tr>';
  }).join('');
  const raw = '';
  return '<div class="wrap-tbl money"><table><thead><tr><th>项目</th><th>金额</th><th>依据</th></tr></thead>'
    + '<tbody>' + body + '</tbody></table></div>' + raw;
}

/* ─ 速查：并进正文顶部横条，不再占右侧一栏 ───────────────────── */
function factStrip(rows, nav) {
  const body = (rows || []).filter(r => r && r[1])
    .map(r => '<div class="fs-item"><small>' + esc(r[0]) + '</small><b>' + r[1] + '</b></div>').join('');
  if (!body && !nav) return '';
  return '<div class="fact-strip">' + body + (nav || '') + '</div>';
}

function tagOf(note) {
  const n = (note && typeof note === 'object') ? note : {};
  const raw = String(n.nature || n.label || '');
  if (/商家|老板|报价|民宿|司机/.test(raw)) return '商家信息';
  if (/评论/.test(raw)) return '评论经验';
  if (/多篇|互证|两篇|两源|独立一致/.test(raw)) return '多篇亲测';
  if (/官方|景区|游客中心|站牌/.test(raw)) return '官方信息';
  return '单篇亲测';
}
function dupWith(body, b) {
  const x = cleanText(body).replace(/\s/g, ''), y = cleanText(b).replace(/\s/g, '');
  if (x.length < 8 || y.length < 8) return false;
  const n = Math.min(12, x.length, y.length);
  return x.indexOf(y.slice(0, n)) >= 0 || y.indexOf(x.slice(0, n)) >= 0;
}
function basisHTML(tip, body) {
  const b = cleanText(tip && tip.basis);
  if (!b) return '';
  if (body && dupWith(body, b)) return '';
  return '<p class="li-ev basis"><span class="ev">' + tagOf(tip) + '</span>'
    + esc(digestOf(tip && tip.basis, 130)) + '</p>';
}
function quoteHTML(q, name) {
  const one = digestOf(q && q.text, 46);
  const tag = (q && q.label && !/临行确认|B\b/.test(q.label)) ? q.label : tagOf(q);
  return '<figure class="quote"><blockquote>' + esc(one) + '</blockquote><figcaption>'
    + '<span class="qtag">' + esc(tag) + '</span>'
    + (name ? '<span class="qplace">' + esc(name) + '</span>' : '')
    + (q && q.note ? Trip.noteLink(q.note) : '') + '</figcaption></figure>';
}
/* 官方导览图交互与首页同一套：单击切换说明，双击打开大图。
   触摸端不能双击，保留卡片内的「全屏查看官方全图」按钮兜底。 */
function bindGuides(root) {
  (root || document).querySelectorAll('[data-guide]').forEach(function (b) {
    const g = (TRIP.guides || []).filter(x => x.id === b.dataset.guide)[0];
    if (!g) return;
    if (!b.classList.contains('guide-fig')) {
      b.addEventListener('click', function () { Guide.open(g.file, g.name, guideFacts(g)); });
      return;
    }
    let timer = null;
    b.addEventListener('click', function () {
      if (timer) {
        clearTimeout(timer); timer = null;
        Guide.open(g.file, g.name, guideFacts(g));
        return;
      }
      timer = setTimeout(function () {
        timer = null;
        const w = b.closest('.guide-inline');
        if (w) w.classList.toggle('folded');
      }, 200);
    });
  });
}
/* 官方导览图：先给一句「这张图只用来看什么」，再按换乘／补给／现场要点分组。
   数据里的 facility_lines 与 points 是同一批文字，只用 points，避免同一句话出现两遍。 */
function guideCols(g) {
  if (g.points && g.points.length) {
    return g.points.map(x => [x.h, (x.items || [])]).filter(c => (c[1] || []).length);
  }
  const a = [], b = [], c = [];
  (g.facility_lines || []).forEach(function (l) {
    const t = String(l);
    if (/换乘|班次|班车|区间车|接驳|摆渡/.test(t)) a.push(t);
    else if (/寄存|行李|转运|充电|补给|餐饮/.test(t)) b.push(t);
    else c.push(t);
  });
  return [['换乘与班车', a], ['生活与补给', b], ['现场要点', c]].filter(x => (x[1] || []).length);
}
function guideFacts(g) {
  const out = [];
  (g.points || []).forEach(p => (p.items || []).forEach(x => out.push(x)));
  return out.length ? out : (g.facility_lines || []);
}
function guideHTML(g, alt) {
  if (!g) return '';
  const lead = cleanText(g.headline) || cleanText(g.use);
  const cols = guideCols(g);
  return '<div class="guide-inline">'
    + '<button class="guide-fig" data-guide="' + esc(g.id) + '" aria-label="官方导览图：单击看说明，双击看大图">'
    + '<img src="' + esc(g.file) + '" alt="' + esc(alt || g.name) + '" loading="lazy"></button>'
    + '<div class="guide-text">'
    + (lead ? '<p class="offp-key">' + esc(leadOf(lead, 150)) + '</p>' : '')
    + (cols.length ? '<div class="offp-cols">' + cols.map(c =>
        '<div class="offp-col"><p class="offp-h">' + esc(c[0]) + '</p><ul>'
        + c[1].slice(0, 6).map(x => '<li>' + esc(leadOf(cleanText(x), 96)) + '</li>').join('')
        + '</ul></div>').join('') + '</div>' : '')
    + '<button class="text-link" data-guide="' + esc(g.id) + '">全屏查看官方全图</button>'
    + '</div></div>';
}
function galleryHTML(ph, name) {
  if (!ph || !ph.length) return '';
  return '<div class="shot-grid">' + ph.map(x =>
    '<figure class="shot"><img src="' + esc(x.file) + '" alt="' + esc(name || '实景') + '" loading="lazy"'
    + (x.w ? ' width="' + x.w + '" height="' + x.h + '"' : '')
    + '><figcaption>' + esc(Trip.caption(x, name)) + '</figcaption></figure>').join('') + '</div>';
}
function evidenceHTML(p) {
  const ev = (p.evidence_photos || []);
  if (!ev.length) return '';
  return '<details class="fold tight"><summary>现场照片与价目表 ' + ev.length + ' 张</summary>'
    + '<div class="shot-grid ev">' + ev.map(e => '<figure class="shot"><img src="' + esc(e.file)
      + '" alt="' + esc(e.caption || '现场照片') + '" loading="lazy"><figcaption>'
      + esc(cleanText(e.caption)) + '</figcaption></figure>').join('') + '</div></details>';
}
function identityNote(v) {
  const t = cleanText(v);
  if (!t) return '';
  if (/两步路|图层|KML|kml|转弯提示|假里程|导航线片段|逐点累加/.test(String(v))) {
    return '轨迹由导航线生成：逐点累加会把提示点算进里程，本文只采用官方统计值。';
  }
  return t;
}
function sec(title, inner, lead) {
  if (!inner) return '';
  return '<section class="detail-section"><h2>' + esc(title) + '</h2>'
    + (lead ? '<p class="sec-lead">' + esc(lead) + '</p>' : '') + inner + '</section>';
}
function factsHTML(rows, tail) {
  const body = (rows || []).filter(x => x && x[1]).map(x => '<div class="fact"><small>' + esc(x[0])
    + '</small><b>' + x[1] + '</b></div>').join('');
  return (body || tail) ? body + (tail || '') : '';
}
function noteLinksHTML(list, n) {
  const uniq = (list || []).filter((v, i, a) => v != null && a.indexOf(v) === i).slice(0, n || 8);
  if (!uniq.length) return '';
  return '<div class="note-list">' + uniq.map(i => Trip.noteLink(i)).join('') + '</div>';
}
/* route.html 没有预载路网几何：按需补上 data/roads.js 再渲染，避免轨迹图是个空盒 */
function ensureRoads(cb) {
  if (window.ROADS) { if (cb) cb(); return; }
  const s = document.createElement('script');
  s.src = 'data/roads.js';
  s.onload = function () { if (cb) cb(); };
  s.onerror = function () { if (cb) cb(); };
  document.head.appendChild(s);
}
/* plans.html 只加载到 ui.js，缺 roads.js/geomap.js 时按需补上 */
function loadGeoMap(done) {
  if (window.GeoMap) { if (done) done(); return; }
  const wait = window.__geoWait || (window.__geoWait = []);
  wait.push(done);
  if (wait.length > 1) return;
  const flush = () => { const q = window.__geoWait || []; window.__geoWait = []; q.forEach(f => { try { f && f(); } catch (e) {} }); };
  const s1 = document.createElement('script');
  s1.src = 'data/roads.js';
  s1.onerror = flush;
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = 'geomap.js';
    s2.onload = flush; s2.onerror = flush;
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

/* ══ 卡片 ════════════════════════════════════════════════════════ */
function legCard(r) {
  const pending = (!r.three_total && !r.per_person) || /待询价|未知/.test(String(r.price_nature || ''));
  const nums = [
    ['里程', r.km_num ? r.km_num + ' km' : leadOf(cleanText(r.km), 22)],
    ['正常用时', leadOf(cleanText(r.hours_normal), 18)],
    ['含缓冲', leadOf(cleanText(r.hours_buffered), 18)],
    ['价格', pending ? '待司机报价' : (leadOf(cleanText(r.price), 40) || '—')]
  ].filter(x => x[1]);
  const ask = cleanList(r.unknowns);
  return '<article class="leg ' + legClass(r) + (pending ? ' quote-pending' : '') + '">'
    + '<div class="leg-head"><b>' + esc(leadOf(cleanText(r.name), 40)) + '</b>'
    + '<span class="chip">' + esc(leadOf(cleanText(r.mode), 26)) + '</span></div>'
    + '<dl class="num-row">' + nums.map(x => '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>').join('') + '</dl>'
    + (r.can_stop_photo ? '<p class="leg-note"><b>能否停车拍照</b>'
        + esc(leadOf(cleanText(r.can_stop_photo), 60)) + '</p>' : '')
    + (r.fits_big_packs ? '<p class="leg-note"><b>三个大包</b>'
        + esc(leadOf(cleanText(r.fits_big_packs), 60)) + '</p>' : '')
    + (ask.length ? '<details class="fold tight"><summary>下单前问清 ' + ask.length + ' 件事</summary>'
        + ulHTML(ask) + '</details>' : '')
    + '<a class="mini-link" href="route.html?id=' + esc(r.id) + '">看这一段的路程、估价与沿途</a>'
    + '</article>';
}
function hikeCard(r) {
  const t = window.TRACKS ? (TRACKS.tracks.filter(x => x.id === r.track_id)[0] || {}) : {};
  const geo = (t.adopted_points && t.adopted_points.length) ? '采用段已绘'
    : (r.shape === 'segment_unknown' ? '采用段在图上不可绘' : '完整轨迹已绘');
  return '<article class="hike-card"><div class="leg-head"><b>' + esc(leadOf(cleanText(r.place_name), 40))
    + '</b><span class="chip">' + esc(r.day) + ' · ' + esc(geo) + '</span></div>'
    + '<dl class="num-row">'
    + [['本次采用', withUnit(r.adopt_km, ' km')], ['累计爬升', withUnit(r.adopt_gain, ' m')],
       ['用时', r.hours || ''], ['完整轨迹', withUnit(r.full_km, ' km')]]
        .filter(x => x[1]).map(x => '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1])
        + '</dd></div>').join('') + '</dl>'
    + (r.adopted ? '<p class="p-lead">' + esc(leadOf(cleanText(r.adopted), 80)) + '</p>' : '')
    + (r.adopted_note ? '<p class="p-body">' + esc(leadOf(identityNote(r.adopted_note), 110)) + '</p>' : '')
    + (r.exit_points ? '<p class="li-ev basis"><span class="ev">退出点</span>'
        + esc(leadOf(cleanText(r.exit_points), 90)) + '</p>' : '')
    + (r.risks && r.risks.length ? ulHTML(r.risks, 'risk') : '')
    + '<a class="mini-link" href="route.html?id=' + esc(r.id) + '">看轨迹形状与强度</a></article>';
}
function placeCard(p) {
  return '<a class="pcard" href="place.html?id=' + esc(p.id) + '">'
    + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="" loading="lazy">' : '<span class="pcard-noimg">暂无实拍</span>')
    + '<span class="pcard-body"><b>' + esc(p.name) + '</b><span class="pcard-line">'
    + esc(leadOf(cleanText(p.conclusion), 46)) + '</span></span></a>';
}

/* ══ DAY ═════════════════════════════════════════════════════════ */
function renderDay(d) {
  document.title = d.date + '｜' + cleanText(d.headline) + '｜我们的阿勒泰';
  const ps = (d.places || []).map(id => Trip.place(id)).filter(Boolean);
  const cover = (d.photos || [])[0];
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">第 ' + d.no + ' 天 · ' + esc(d.date) + ' ' + esc(d.week) + '</p>'
    + '<h1>' + esc(cleanText(d.title || d.headline)) + '</h1>'
    + '<p class="hero-lead">' + esc(leadOf(cleanText(d.headline), 120)) + '</p>'
    + (d.core ? '<p class="hero-core">' + esc(leadOf(cleanText(d.core), 110)) + '</p>' : '')
    + '<div class="chip-row"><span class="chip">' + esc(leadOf(cleanText(d.move), 40)) + '</span>'
    + '<span class="chip">' + esc(leadOf(cleanText(d.sleep), 40)) + '</span></div>'
    + '<div class="hero-more">' + paraHTML(d.summary) + '</div></div>'
    + (cover ? '<figure class="hero-shot"><img src="' + esc(cover.file) + '" alt="' + esc(d.date)
        + ' 实景" loading="lazy"></figure>' : '');

  let c = '';
  if (d.timeline && d.timeline.length) {
    c += sec('当天怎么走', '<ol class="timeline">' + d.timeline.map(t =>
      '<li><time>' + esc(cleanText(t.time) || '不设钟点') + '</time><div>'
      + '<p>' + esc(leadOf(cleanText(t.what), 130)) + '</p>'
      + (t.redline ? '<span class="tl-red">红线：' + esc(leadOf(cleanText(t.redline), 90)) + '</span>' : '')
      + '</div></li>').join('') + '</ol>', '按时间顺序，红字是不能越过的底线');
  }
  c += sec('底线与删减顺序',
    '<div class="callout-grid">'
    + (d.redline ? '<div class="callout alert"><small>最晚红线</small><p>' + esc(leadOf(cleanText(d.redline), 130)) + '</p></div>' : '')
    + (d.cut_first ? '<div class="callout warn"><small>来不及时先删什么</small><p>' + esc(leadOf(cleanText(d.cut_first), 130)) + '</p></div>' : '')
    + (d.weather_alt ? '<div class="callout soft"><small>天气替代</small><p>' + esc(leadOf(cleanText(d.weather_alt), 120)) + '</p></div>' : '')
    + (d.pace ? '<div class="callout soft"><small>建议节奏</small><p>' + esc(leadOf(cleanText(d.pace), 110)) + '</p></div>' : '')
    + '</div>');
  const legs = (d.legs || []).map(id => Trip.route(id)).filter(Boolean);
  if (legs.length) c += sec('当天的路与里程', '<div class="leg-grid">' + legs.map(legCard).join('') + '</div>');
  const hikes = (d.tracks || []).map(id => (window.TRACKS ? TRACKS.tracks.filter(x => x.id === id)[0] : null))
    .filter(t => t && t.route).map(t => Trip.route(t.route)).filter(Boolean);
  if (hikes.length) c += sec('徒步路段', hikes.map(hikeCard).join(''));
  if (ps.length) c += sec('途经地点', '<div class="pgrid">' + ps.map(placeCard).join('') + '</div>');
  if (d.meals && d.meals.length) c += sec('吃饭与补给',
    facBlockList(d.meals.map(m => [m.place, m.text])), '');
  const sleepPlaces = ps.filter(p => p.facilities && (p.facilities.lodging || p.facilities.camp));
  c += sec('今晚落脚', '<div class="sleep-card"><b>' + esc(leadOf(cleanText(d.sleep), 60)) + '</b>'
    + (sleepPlaces.length ? ulHTML(sleepPlaces.map(p => p.name + '：' + (p.facilities.lodging || p.facilities.camp))) : '')
    + '</div>');
  c += sec('大包与日包', '<p class="p-lead">大包：' + esc(leadOf(cleanText(d.bag) || '跟随当天安排', 90)) + '</p>'
    + (d.carry ? '<p class="p-body">日包：' + esc(leadOf(cleanText(d.carry), 100)) + '</p>' : ''));
  const crowd = (TRIP.crowd || []).filter(r => ps.some(p => String(r['地点'] || '').indexOf(p.name) >= 0));
  if (crowd.length) c += sec('错峰安排', ulHTML(crowd.map(r =>
    r['地点'] + '：本次' + (r['本次怎么执行'] || '') + (r['明确避开什么'] ? '；避开' + r['明确避开什么'] : ''))));
  if (d.cost && d.cost.length) c += sec('当天费用', moneyTbl(d.cost.map(x => [x.item, x.text])),
    '');
  if (d.topics && d.topics.length) {
    c += sec('相关攻略', '<div class="link-grid">' + d.topics.map(id => {
      const t = Trip.topic(id);
      return t ? '<a class="link-card" href="topic.html?id=' + esc(t.id) + '"><b>' + esc(t.name) + '</b><span>'
        + esc(leadOf(cleanText(t.conclusion), 52)) + '</span></a>' : '';
    }).join('') + '</div>');
  }
  const gs = (TRIP.guides || []).filter(g => (d.places || []).indexOf(g.place) >= 0);
  if (gs.length) c += sec('官方导览图', '<div class="guide-grid">' + gs.map(g => guideHTML(g, g.name)).join('') + '</div>', '单击看图说明，双击看大图');
  if (d.photos && d.photos.length) c += sec('当天实景', galleryHTML(d.photos, ''));
  if (d.quotes && d.quotes.length) c += sec('代表原话',
    '<div class="quote-grid">' + d.quotes.map(q => quoteHTML(q, q.place)).join('') + '</div>');
  if (d.quotes && d.quotes.length) {
    const nl = noteLinksHTML(d.quotes.map(q => q.note), 6);
    if (nl) c += sec('代表原帖', nl);
  }
  const i = TRIP.days.map(x => x.id).indexOf(d.id);
  const prev = i > 0 ? TRIP.days[i - 1] : null;
  const next = i < TRIP.days.length - 1 ? TRIP.days[i + 1] : null;
  const strip = factStrip([
    ['当日核心', esc(leadOf(cleanText(d.core), 60))],
    ['建议节奏', esc(leadOf(cleanText(d.pace), 60))],
    ['大包去向', esc(leadOf(cleanText(d.bag), 56))],
    ['最晚红线', esc(leadOf(cleanText(d.redline), 56))],
    ['先删什么', esc(leadOf(cleanText(d.cut_first), 56))],
    ['天气替代', esc(leadOf(cleanText(d.weather_alt), 56))]
  ], '<div class="day-nav">'
    + '<a href="' + (prev ? 'day.html?id=' + prev.id : 'index.html#days') + '">← ' + (prev ? DAY_LABEL(prev.id) : '回首页') + '</a>'
    + '<a href="' + (next ? 'day.html?id=' + next.id : 'index.html#days') + '">' + (next ? DAY_LABEL(next.id) : '回首页') + ' →</a>'
    + '</div>');
  document.getElementById('content').innerHTML = strip + c;
  bindGuides(document.getElementById('content'));
}

/* ══ PLACE ═══════════════════════════════════════════════════════ */
function renderPlace(p) {
  document.title = p.name + '｜我们的阿勒泰';
  const ph = (p.photos && p.photos[0]);
  const g = (TRIP.guides || []).filter(x => x.place === p.id)[0];
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">'
    + esc((p.days || []).map(DAY_LABEL).join(' · ') || '按方案排期')
    + (p.type ? ' · ' + esc(leadOf(cleanText(p.type), 30)) : '') + '</p>'
    + '<h1>' + esc(p.name) + '</h1>'
    + '<p class="hero-lead">' + esc(leadOf(cleanText(p.conclusion), 120)) + '</p>'
    + '<div class="chip-row">' + (p.confidence ? '<span class="chip">'
        + esc(leadOf(cleanText(p.confidence), 20)) + '</span>' : '')
    + '<span class="chip">实拍 ' + (p.photo_count || 0) + ' 张</span>'
    + (p.duration ? '<span class="chip">' + esc(leadOf(cleanText(p.duration), 24)) + '</span>' : '') + '</div>'
    + '</div>'
    + (ph ? '<figure class="hero-shot"><img src="' + esc(ph.file) + '" alt="' + esc(p.name)
        + ' 实景" loading="lazy"></figure>'
      : '<div class="hero-noimg"><b>这个点暂时没有可确认归属的实拍照片</b>'
        + '<span>位置与玩法以文字和官方导览图为准。</span></div>');

  let c = '';
  c += sec('看什么', ulHTML(cleanList(p.see)));
  c += sec('怎么玩', ulHTML(cleanList(p.play)));
  if (p.when) c += sec('什么时候来', paraHTML(p.when));
  if (p.crowd) c += sec('错峰安排', paraHTML(p.crowd));
  if (p.transport && p.transport.length) c += sec('到达方式', ulHTML(cleanList(p.transport)));
  if (p.hike || p.hike_card) {
    const r = Trip.route(p.id);
    c += sec('徒步路段', paraHTML(p.hike) + (r && r.kind === 'hike' ? hikeCard(r) : ''));
  }
  if (p.duration) c += sec('建议停留', '<p class="p-lead">' + esc(leadOf(cleanText(p.duration), 100)) + '</p>');
  if (p.spots && p.spots.length) c += sec('拍摄点', ulHTML(cleanList(p.spots)));
  if (p.avoid && p.avoid.length) c += sec('要避开', ulHTML(cleanList(p.avoid), 'risk'));
  if (p.risks && p.risks.length) c += sec('风险与撤退条件', ulHTML(cleanList(p.risks), 'risk'));
  if (p.alternatives && p.alternatives.length) c += sec('天气不好怎么替', ulHTML(cleanList(p.alternatives)));
  const fk = Object.keys(p.facilities || {});
  if (fk.length) c += sec('设施与补给', facBlock(p.facilities));
  if (p.cost && p.cost.length) c += sec('花费', moneyTbl(p.cost.map(x => ['', x])));
  if (p.tips && p.tips.length) c += sec('实用提示', ulHTML(cleanList(p.tips)));
  if (p.verify && p.verify.length) c += sec('临行要现场确认', '<ul class="verify-list">'
    + cleanList(p.verify).map(v => '<li>' + esc(leadOf(v, 96)) + '</li>').join('') + '</ul>');
  c += sec('现场照片与价目表', evidenceHTML(p));
  if (g) c += sec('官方导览图', guideHTML(g, p.name + '官方导览图'), '单击看图说明，双击看大图');
  if (p.quotes && p.quotes.length) c += sec('代表评价',
    '<div class="quote-grid">' + p.quotes.map(q => quoteHTML(q, p.name)).join('') + '</div>');
  if (p.notes && p.notes.length) {
    c += sec('代表原帖', noteLinksHTML(p.notes, 8));
  }
  if (p.photos && p.photos.length) c += sec('实景照片', galleryHTML(p.photos, p.name));
  const relatedTopics = (p.topics || []).map(id => Trip.topic(id)).filter(Boolean);
  const strip = factStrip([
    ['信息来源', esc(leadOf(cleanText(p.confidence) || '临行确认', 24))],
    ['类型', esc(leadOf(cleanText(p.type), 30))],
    ['别名与写法核对', esc(leadOf(cleanText(p.alias), 62))],
    ['留多久', esc(leadOf(cleanText(p.duration), 28))],
    ['出现在', (p.days || []).map(x => '<a href="day.html?id=' + x + '">' + DAY_LABEL(x) + '</a>').join(' ')],
    ['相关攻略', relatedTopics.map(t => '<a href="topic.html?id=' + t.id + '">' + esc(t.name) + '</a>').join(' ')]
  ], '<div class="day-nav"><a href="index.html#journey">回行程图定位 →</a></div>');
  document.getElementById('content').innerHTML = strip + c;
  bindGuides(document.getElementById('content'));
}

/* ══ TOPIC ══════════════════════════════════════════════════════ */
function renderTopic(t) {
  document.title = t.name + '｜攻略｜我们的阿勒泰';
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">覆盖 ' + (t.days || []).length + ' 天 · '
    + (t.places || []).length + ' 个地点 · ' + (t.note_count || 0) + ' 篇实测笔记</p>'
    + '<h1>' + esc(t.name) + '</h1>'
    + '<p class="hero-lead">' + esc(leadOf(cleanText(t.conclusion), 120)) + '</p></div>';

  let c = '';
  if (t.top && t.top.length) {
    const tops = cleanList(t.top);
    c += sec('先记住这 ' + tops.length + ' 条', '<ol class="top-list">'
      + tops.map(x => {
        const parts = String(x).split('；');
        const head = leadOf(parts.shift() || x, 46);
        const rest = parts.join('；').trim();
        return '<li><b>' + esc(head) + '</b>'
          + (rest ? '<span class="li-body">' + esc(leadOf(rest, 110)) + '</span>' : '') + '</li>';
      }).join('') + '</ol>');
  }
  if (t.tips && t.tips.length) c += sec('先做这几件事', ulWithBasis(t.tips), '');
  if ((t.packing || []).length) {
    c += sec('装备与每人份额',
      (t.packing || []).map(gp =>
      '<details class="fold" open><summary>' + esc(cleanText(gp[0])) + '（' + (gp[1] || []).length + ' 项）</summary>'
      + rowsHTML(gp[1], ['装备', '每人数量', '为什么是这个数', '状态']) + '</details>').join(''));
  }
  if ((t.status_rules || []).length) c += sec('排程里必须做的动作', ulHTML(
    (t.status_rules || []).map(r => r.rule + '：' + (r.how || ''))));
  if ((t.food_groups || []).length) c += sec('在哪吃', '<div class="food-grid">'
    + t.food_groups.map(gp => '<a class="fcell" href="place.html?id=' + esc(gp.pid) + '"><b>'
      + esc(gp.place) + '</b><span>' + esc(leadOf(cleanText(gp.text), 70)) + '</span></a>').join('') + '</div>');
  const ps = (t.places || []).map(id => Trip.place(id)).filter(Boolean);
  if (ps.length) c += sec('涉及地点', '<div class="pgrid">' + ps.map(placeCard).join('') + '</div>');
  const rs = (t.routes || []).map(id => Trip.route(id)).filter(Boolean);
  if (rs.length) c += sec('涉及路线', rs.map(r => r.kind === 'hike' ? hikeCard(r) : legCard(r)).join(''));
  if (t.days && t.days.length) c += sec('出现在哪些天', '<div class="link-grid">' + t.days.map(id => {
    const d = Trip.day(id);
    return d ? '<a class="link-card" href="day.html?id=' + esc(id) + '"><b>' + esc(d.date) + '</b><span>'
      + esc(leadOf(cleanText(d.short), 30)) + '</span></a>' : '';
  }).join('') + '</div>');
  if (t.quotes && t.quotes.length) c += sec('代表原话',
    '<div class="quote-grid">' + t.quotes.map(q => quoteHTML(q, q.label === '临行确认' ? '' : '')).join('') + '</div>');
  const refs = [];
  (t.quotes || []).forEach(q => { if (q.note) refs.push(q.note); });
  (t.tips || []).forEach(x => (x.refs || []).forEach(r => refs.push(r)));
  const nl = noteLinksHTML(refs, 8);
  if (nl) c += sec('代表原帖', nl);
  const strip = factStrip([
    ['一句结论', esc(leadOf(cleanText(t.conclusion), 70))],
    ['动作', (t.tips || []).length + ' 条'],
    ['涉及地点', (t.places || []).length + ' 个'],
    ['涉及路线', (t.routes || []).length + ' 条'],
    ['实测笔记', (t.note_count || 0) + ' 篇']
  ], '<div class="day-nav"><a href="index.html#topics">回首页攻略区 →</a></div>');
  document.getElementById('content').innerHTML = strip + c;
}
function ulWithBasis(tips) {
  const items = (tips || []).filter(Boolean).map(x => {
    const t = cleanText(x.text);
    const s = sents(t);
    const first = s.shift() || '';
    const parts = splitLead(first);
    const rest = parts[1] + s.join('');
    return '<li><b>' + esc(parts[0]) + '</b>'
      + (rest ? '<span class="li-body">' + esc(rest) + '</span>' : '')
      + (x.place && Trip.place(x.place) ? '<a class="mini-link" href="place.html?id=' + esc(x.place)
          + '">看 ' + esc(Trip.place(x.place).name) + '</a>' : '')
      + basisHTML(x, parts[0] + rest) + '</li>';
  }).join('');
  return '<ul class="check-list">' + items + '</ul>';
}

/* ══ ROUTE ══════════════════════════════════════════════════════ */
function renderRoute(r) {
  document.title = (r.place_name || r.name) + '｜路线｜我们的阿勒泰';
  const t = window.TRACKS ? (TRACKS.tracks.filter(x => x.id === r.track_id)[0] || {}) : {};
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">' + esc(cleanText(r.day))
    + ' · ' + (r.kind === 'hike' ? '徒步线' : '转场路段')
    + (r.is_nav_line ? ' · 导航线，非徒步轨迹' : '') + '</p>'
    + '<h1>' + esc(leadOf(cleanText(r.place_name || r.name), 40)) + '</h1>'
    + '<p class="hero-lead">' + esc(leadOf(cleanText(r.adopted_note || r.adopted), 120)) + '</p></div>'
    + '<div class="trace" id="trace"></div>';

  let nums;
  if (r.kind === 'leg') {
    nums = [['里程', r.km_num ? r.km_num + ' km' : leadOf(cleanText(r.km), 20)],
      ['正常用时', leadOf(cleanText(r.hours_normal), 16)],
      ['含缓冲', leadOf(cleanText(r.hours_buffered), 16)],
      ['计价', leadOf(cleanText(r.pricing_unit), 10)],
      ['每人', r.per_person ? String(r.per_person) + ' 元' : '待询价'],
      ['三人合计', r.three_total ? String(r.three_total) + ' 元' : '待询价']];
  } else {
    nums = [['本次采用', withUnit(r.adopt_km, ' km')],
      ['累计爬升', withUnit(r.adopt_gain, ' m')],
      ['用时', r.hours || '—'],
      ['完整轨迹', withUnit(r.full_km, ' km')],
      ['海拔区间', (r.elev && r.elev[0] != null) ? r.elev[0] + ' — ' + r.elev[1] + ' m' : '—'],
      ['起 → 终', leadOf(cleanText(r.start), 12) + ' → ' + leadOf(cleanText(r.end), 12)]];
  }
  let c = sec('关键数字', '<dl class="num-row wide">' + nums.filter(x => x[1]).map(x =>
    '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>').join('') + '</dl>'
    + (r.kind === 'leg'
      ? '<p class="li-ev basis"><span class="ev">' + esc(r.level_label || '临行确认') + '</span>'
        + '未拿到 2026 报价前不按 0 元计，也不并进合计。</p>'
      : '<p class="li-ev basis"><span class="ev">统计方式</span>里程与爬升取导航线原生统计，'
        + '逐点累加海拔会明显偏高。</p>'));
  if (r.kind === 'leg') {
    c += sec('这段怎么执行', ulHTML([
      '怎么走：' + (r.mode || '') + '；' + (r.status || ''),
      r.can_stop_photo ? '能否停车拍照：' + r.can_stop_photo : '',
      r.fits_big_packs ? '三个大包怎么办：' + r.fits_big_packs : '',
      r.price ? '价格：' + r.price : '价格：待询价 —— 这一段属于花钱最多的几段之一，出发前必须拿到 2026 报价',
      r.level_label ? '这条价格有多硬：' + r.level_label : ''
    ]));
  } else {
    c += sec('这段怎么执行', paraHTML(r.adopted));
  }
  const geom = traceGeom(r, t);
  const traceKm = (r.kind === 'leg') ? withUnit(r.km_num, ' km')
    : (withUnit(r.full_km, ' km') || withUnit(r.adopt_km, ' km'));
  if (traceKm || geom.points) {
    const na = geom.adopted.length;
    c += sec('轨迹与路网',
      (geom.source === 'road'
        ? '<p class="p-lead">' + esc(traceKm ? traceKm + ' · 按导航路网绘制' : '按导航道路绘制') + '</p>'
          + '<p class="p-body">把高德导航返回的路线几何画成整条道路，从起点到终点连续不断，'
          + (geom.segs.length > 1 ? '分段分别绘制，不把不相连的两段接成假线。' : '不是把两点连成的直线。')
          + (geom.points ? ' 图上 ' + geom.points + ' 个道路点。' : '') + '</p>'
        : '<p class="p-lead">完整轨迹 ' + esc(traceKm)
          + ((r.kind !== 'leg' && r.full_gain != null) ? ' / ' + esc(withUnit(r.full_gain, ' m')) : '')
          + (geom.points ? '，轨迹 ' + geom.points + ' 个点' : '') + '</p>'
          + (na ? '<p class="p-body">本次采用：' + esc(leadOf(cleanText(r.adopted || r.adopted_note), 110))
                  + '，图上 ' + na + ' 个点。实线是这一次真正走的那一段，浅色是没走的其余轨迹。</p>'
                : '<p class="p-body">整条轨迹都按实录绘制，图上没有做取舍。</p>'))
      + (r.identity ? '<p class="li-ev basis"><span class="ev">轨迹来源</span>'
          + esc(identityNote(r.identity)) + '</p>' : ''));
  }
  if (r.exit_points) c += sec('折返与退出', '<p class="p-lead">' + esc(leadOf(cleanText(r.exit_points), 120)) + '</p>');
  if (r.risks && r.risks.length) c += sec('风险与撤退条件', ulHTML(cleanList(r.risks), 'risk'));
  if (r.unknowns && r.unknowns.length) c += sec('下单前问清', '<ul class="verify-list">'
    + cleanList(r.unknowns).map(u => '<li>' + esc(leadOf(u, 90)) + '</li>').join('') + '</ul>');
  const p = (r.kind === 'hike' && r.place) ? Trip.place(r.place) : Trip.place(r.id);
  if (p) c += sec('关联地点', '<div class="pgrid">' + placeCard(p) + '</div>');
  const dd = (TRIP.days || []).filter(x => String(r.day || '').indexOf(x.date) >= 0);
  c += sec('出现在哪些天', dd.length ? '<div class="link-grid">' + dd.map(d =>
    '<a class="link-card" href="day.html?id=' + esc(d.id) + '"><b>' + esc(d.date) + '</b><span>'
    + esc(leadOf(cleanText(d.short), 30)) + '</span></a>').join('') + '</div>'
    : '<p class="p-lead">' + esc(leadOf(cleanText(r.day), 40)) + '</p>');
  const strip = factStrip([
    ['类型', r.kind === 'hike' ? '徒步' : '转场'],
    ['状态', esc(leadOf(cleanText(r.status), 24))],
    ['日期', esc(cleanText(r.day))]
  ].concat(geom.points ? [[geom.source === 'road' ? '路网点' : '轨迹点', geom.points + ' 个点']] : []),
    '<div class="day-nav"><a href="index.html#journey">回行程图 →</a></div>');
  document.getElementById('content').innerHTML = strip + c;
  drawTrace(geom);
}

/* 轨迹几何：徒步段用实录轨迹；行车／接驳段回退到导航烘焙的路网几何。
   多段路线（如禾木→贾登峪＝两段导航）按段分开画，不把不相连的两段连成假线。 */
const ROAD_ALIAS = { L2: ['L2a', 'L2b'], L4: ['L4', 'L4c'], L6: ['L5'], L7: ['L5'], L8: ['K1', 'K2'] };
function traceGeom(r, t) {
  const tp = (t && t.points) || [];
  if (tp.length > 1) {
    return { segs: [tp], adopted: (t.adopted_points && t.adopted_points.length > 1) ? t.adopted_points : [],
      source: 'record', points: tp.length };
  }
  const all = (window.ROADS && window.ROADS.legs) || [];
  const ids = ROAD_ALIAS[String((r && r.id) || '')] || [String((r && r.id) || '')];
  const segs = ids.map(x => all.filter(l => l.id === x)[0])
    .filter(l => l && (l.points || []).length > 1).map(l => l.points);
  let n = 0; segs.forEach(x => { n += x.length; });
  return { segs: segs, adopted: [], source: segs.length ? 'road' : '', points: n };
}
function drawTrace(geom) {
  const box = document.getElementById('trace');
  if (!box) return;
  geom = geom || { segs: [], adopted: [], source: '' };
  const segs = (geom.segs || []).filter(x => x && x.length > 1);
  if (!segs.length) {
    box.innerHTML = '<p class="trace-empty">这一段没有可绘制的路网轨迹，按上面的里程与用时执行。</p>';
    return;
  }
  const adopt = (geom.adopted && geom.adopted.length > 1) ? geom.adopted : [];
  const all = [].concat.apply([], segs).concat(adopt);
  const W = 640, H = 216, PAD = 22;
  /* 数据是 [纬度, 经度] 二元组。经度定 x、纬度定 y（纬度越大越靠北，画的时候要翻转）。
     取景框给一个最小跨度，短路段不会被拉到失真。 */
  const lngs = all.map(q => q[1]), lats = all.map(q => q[0]);
  const lo0 = Math.min.apply(null, lngs), lo1 = Math.max.apply(null, lngs);
  const la0 = Math.min.apply(null, lats), la1 = Math.max.apply(null, lats);
  const spanLng = Math.max(lo1 - lo0, 0.012), spanLat = Math.max(la1 - la0, 0.012);
  const k = Math.min((W - PAD * 2) / spanLng, (H - PAD * 2) / spanLat);
  const cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2;
  const xy = q => [W / 2 + (q[1] - cx) * k, H / 2 - (q[0] - cy) * k];
  const path = s => 'M' + s.map(q => xy(q).map(v => v.toFixed(1)).join(' ')).join(' L');
  const s0 = xy(segs[0][0]);
  const last = segs[segs.length - 1], s1 = xy(last[last.length - 1]);
  const far = Math.abs(s1[0] - s0[0]) + Math.abs(s1[1] - s0[1]) > 6;
  box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="这一段的路网轨迹">'
    + segs.map(x => '<path d="' + path(x) + '" class="trace-halo"/>').join('')
    + segs.map(x => '<path d="' + path(x) + '" class="trace-full"/>').join('')
    + (adopt.length ? '<path d="' + path(adopt) + '" class="trace-adopt"/>' : '')
    + '<circle cx="' + s0[0].toFixed(1) + '" cy="' + s0[1].toFixed(1) + '" r="5.5" class="trace-start"/>'
    + (far ? '<circle cx="' + s1[0].toFixed(1) + '" cy="' + s1[1].toFixed(1) + '" r="5.5" class="trace-end"/>' : '')
    + '</svg><p class="trace-key"><span class="k1">'
    + (geom.source === 'road' ? '按导航道路绘制' : '徒步轨迹')
    + '</span>' + (adopt.length ? '<span class="k2">本次采用段</span>' : '')
    + '<span class="k3">起点</span><span class="k4">终点</span></p>';
}

/* ═ 装载 ═══════════════════════════════════════════════════════ */
function dropEmptySections() {
  $$('.detail-section').forEach(s => {
    const kids = Array.prototype.slice.call(s.children).filter(x => x.tagName !== 'H2');
    if (!kids.length || kids.every(x => !x.textContent.trim() && !x.querySelector('img, svg'))) s.remove();
  });
  decorateDetail();
}

/* 桌面端骨架：正文流 ＋ 右侧粘性目录／速查。
   窄屏由 CSS 收成单栏，DOM 顺序保证窄屏先看到速查与目录。 */
function decorateDetail() {
  const content = document.getElementById('content');
  const type = document.body.dataset.type;
  if (!content || content.classList.contains('has-rail')) return;
  if (type === 'plans' || type === 'budget' || type === 'tasks') return;
  const sections = Array.prototype.slice.call(content.querySelectorAll(':scope > .detail-section'));
  if (sections.length < 2) return;
  const strip = content.querySelector(':scope > .fact-strip');
  const flow = document.createElement('div');
  flow.className = 'detail-flow';
  Array.prototype.slice.call(content.children).forEach(function (el) {
    if (el !== strip) flow.appendChild(el);
  });
  const rail = document.createElement('aside');
  rail.className = 'detail-rail';
  const nav = document.createElement('nav');
  nav.className = 'rail-nav';
  nav.innerHTML = '<p class="rail-h">本页导航</p><ol>' + sections.map(function (s, i) {
    if (!s.id) s.id = 'sec-' + type + '-' + (i + 1);
    const h = s.querySelector('h2');
    const label = h ? h.textContent.trim() : '';
    return label ? '<li><a href="#' + esc(s.id) + '"><span>' + esc(label) + '</span></a></li>' : '';
  }).join('') + '</ol>';
  rail.appendChild(nav);
  if (strip) rail.appendChild(strip);
  content.classList.add('has-rail');
  content.appendChild(rail);
  content.appendChild(flow);
  const links = Array.prototype.slice.call(nav.querySelectorAll('a'));
  if ('IntersectionObserver' in window && links.length) {
    const byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('on'); });
        const a = byId[e.target.id];
        if (a) a.classList.add('on');
      });
    }, { rootMargin: '-72px 0px -68% 0px', threshold: 0 });
    sections.forEach(function (s) { io.observe(s); });
  }
}

/* 缺参数／无数据：不是一句居中文字，而是一页可继续浏览的入口 */
function emptyStateHTML(title, desc) {
  const items = [
    ['day.html?id=0927', '9/27 日程', '布奴阿拉安、铁贾与白哈巴'],
    ['place.html?id=hemu_village', '禾木村', '住宿点、村内玩法与风险'],
    ['topic.html?id=camp', '露营攻略', '点位、装备与夜间风险'],
    ['route.html?id=L3', '铁贾公路', '按导航路网看里程与用时'],
    ['plans.html', '三套方案对比', '主方案与两个备选的差异'],
    ['budget.html', '费用与重算', '确定项、待询价与三档情景'],
    ['tasks.html', '出发前 15 件事', '谁负责、几号前办完']
  ];
  return '<section class="detail-section empty-state">'
    + '<p class="eyebrow">' + esc(title) + '</p>'
    + '<h2>从下面任意一页继续</h2>'
    + '<p class="p-lead">' + esc(desc) + '</p>'
    + '<div class="link-grid empty-grid">' + items.map(function (x) {
        return '<a class="link-card" href="' + esc(x[0]) + '"><b>' + esc(x[1])
          + '</b><span>' + esc(x[2]) + '</span></a>';
      }).join('') + '</div>'
    + '<div class="empty-back"><a class="mini-link" href="index.html">← 回旅行手册首页</a></div></section>';
}

(function () {
  const TYPE = document.body.dataset.type;
  const ID = param('id');
  if (TYPE === 'plans') { renderPlans(); dropEmptySections(); return; }
  if (!ID || !Trip[TYPE]) {
    document.getElementById('content').innerHTML = emptyStateHTML(
      !ID ? '缺少页面参数' : '没有这条数据',
      !ID ? '链接里少了 ?id= 参数。可以先从下面的入口进入，或回旅行手册首页。'
          : '标识「' + ID + '」不在当前手册里。可以从下面的入口继续浏览。');
    return;
  }
  const begin = function () { Trip.slice(TYPE, ID, function (slice) {
    const light = Trip[TYPE](ID);
    if (!light && !slice) {
      document.getElementById('content').innerHTML = emptyStateHTML('没有这条数据',
        '标识「' + ID + '」不在当前手册里。可以从下面的入口继续浏览。');
      return;
    }
    const data = slice || light;
    if (TYPE === 'day') renderDay(data);
    else if (TYPE === 'place') renderPlace(data);
    else if (TYPE === 'topic') renderTopic(data);
    else renderRoute(data);
    dropEmptySections();
    if (!history.state || !history.state.page) history.replaceState({ page: TYPE + ':' + ID }, '');
  }); };
  if (TYPE === 'route') ensureRoads(begin); else begin();
})();

/* ═ 方案对照页（plans.html）═════════════════════════════════════ */
function store_get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function store_set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }

function renderPlans() {
  const P = TRIP.plans || [];
  let cur = param('plan') || (window.PLAN_VIEW) || store_get('altay.plan') || (P[0] || {}).id;
  if (!P.some(x => x.id === cur)) cur = (P[0] || {}).id;
  document.title = '三套方案差在哪｜我们的阿勒泰';
  const main = P[0] || {};
  document.getElementById('hero').innerHTML =
    '<div class="hero-copy"><p class="hero-date">三套方案 · 9 天同一张图</p>'
    + '<h1>三套方案差在哪</h1>'
    + '<p class="hero-lead">共同点：9/24 夜火车进，9/30 傍晚下撤贾登峪，10/1 直达阿勒泰站赶 K9752。</p>'
    + (main.gain ? '<p class="p-body">不同点只集中在 9/25—9/29 这五天：换掉哪一段，决定了全程的舒展程度。</p>' : '')
    + '</div>';
  document.getElementById('content').innerHTML =
    '<section class="detail-section"><h2>三套方案对照</h2>'
    + '<p class="sec-lead">三套方案共用同一个取景框：切换时地图比例不动，左图右表同时跟着换。</p>'
    + '<div class="plan-split">'
    + '<div class="plan-left">'
    + '<div class="plan-switch" id="planSwitch"></div>'
    + '<div id="planMap" class="mini-map"></div>'
    + '<p class="map-cap">实线是按真实路网走的车行与区间车轨迹，深色点是当晚落脚，浅色圈是白天途经点。</p></div>'
    + '<div class="plan-right">'
    + '<h3 class="split-h">核心差别</h3><div id="coreDiff"></div>'
    + '<h3 class="split-h">逐日对照</h3><div id="planBody"></div></div>'
    + '</div></section>';

  /* 核心差别：只从 plans.json 推导，不手写结论，避免和逐日表打架 */
  function coreDiff() {
    const nightsOf = p => p.nights || {};
    const hasRoute = (p, id) => (p.route || []).indexOf(id) >= 0;
    const kanasNights = p => ['0927', '0928', '0929'].filter(d => /喀纳斯/.test(nightsOf(p)[d] || '')).length;
    const rows = [
      ['9/25 夜宿', p => leadOf(cleanText(nightsOf(p)['0925'] || '—'), 12)],
      ['9/27 夜宿', p => leadOf(cleanText(nightsOf(p)['0927'] || '—'), 12)],
      ['禾木清晨', p => hasRoute(p, 'hemu_village') ? '保留' : '放弃'],
      ['铁贾公路', p => hasRoute(p, 'tiejia_road') ? '保留' : '删掉'],
      ['白哈巴', p => hasRoute(p, 'baihaba') ? '住 1 晚' : '删掉'],
      ['喀纳斯夜数', p => kanasNights(p) + ' 晚'],
      ['9/26 安排', p => leadOf(cleanText(((p.days || {})['0926']) || '—'), 13)],
      ['与主方案差异', p => {
        const df = (p.diff_from_main || []).filter(x =>
          cleanText(x.main) !== cleanText(x.this) && !/^同主方案/.test(cleanText(x.this)));
        return df.length ? df.length + ' 天不同' : '基准';
      }]
    ];
    const head = ['维度'].concat(P.map(x => esc(x.name).split('｜')[0]));
    const body = rows.map(function (r) {
      const cells = P.map(function (x) { return r[1](x); });
      const same = cells.every(v => v === cells[0]);
      return [r[0]].concat(cells.map(v => v)).concat([same ? 's' : 'd']);
    });
    return '<div class="wrap-tbl core-tbl"><table><thead><tr>'
      + head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>'
      + body.map(r => '<tr class="' + (r[r.length - 1] === 's' ? 'same' : 'diff') + '">'
          + r.slice(0, -1).map((v, i) => '<td' + (i ? '' : ' class="lead-cell"') + '>' + esc(v) + '</td>').join('')
          + '</tr>').join('')
      + '</tbody></table></div>'
      + '<p class="map-cap">灰色的行三套方案一样，高亮的是真正需要拍板的地方。</p>';
  }

  function paint() {
    const p = P.filter(x => x.id === cur)[0] || P[0];
    const sw = document.getElementById('planSwitch');
    if (sw) {
      sw.innerHTML = P.map(x => '<button data-plan="' + esc(x.id) + '" class="plan-btn'
        + (x.id === cur ? ' on' : '') + '">' + '<b>' + esc(x.name) + '</b><span>'
        + esc(leadOf(cleanText(x.gain), 34)) + '</span></button>').join('');
      $$('[data-plan]', sw).forEach(b => b.addEventListener('click', () => {
        cur = b.getAttribute('data-plan');
        store_set('altay.plan', cur);
        try { history.replaceState({ plan: cur }, '', 'plans.html?plan=' + cur); } catch (e) {}
        paint();
      }));
    }
    const box = document.getElementById('planMap');
    if (box) { try { Mini.mount(box); Mini.draw(cur); } catch (e) {} }
    const cd = document.getElementById('coreDiff');
    if (cd) cd.innerHTML = coreDiff();
    const days = (TRIP.days || []).filter(d => d.id !== '0924' && d.id !== '1002');
    const body = document.getElementById('planBody');
    if (body) body.innerHTML =
      rowsHTML(days.map(d => [d.date + ' ' + (d.week || '')].concat(
        P.map(x => (x.days && x.days[d.id]) || '同主方案'))), ['日期'].concat(P.map(x => x.name)), 'plan-tbl')
      + '<div class="plan-cmp">'
      + '<article><h3>' + esc(p.name) + '</h3>' + paraHTML(p.gain)
      + (p.cost ? '<p class="li-ev basis"><span class="ev">取舍</span>' + esc(cleanText(p.cost)) + '</p>' : '')
      + (function () {
          const realDiff = arr => (arr || []).filter(x => !/^同主方案/.test(cleanText(x.this)));
          const own = realDiff(p.diff_from_main);
          if (own.length) return '<h4 class="sub-h">与主方案不同</h4><ul class="diff-list">' + own.map(x =>
            '<li>' + DAY_LABEL(x.date) + '：<b>' + esc(leadOf(cleanText(x.this), 44)) + '</b>'
            + '<span class="was">主方案：' + esc(leadOf(cleanText(x.main), 40)) + '</span></li>').join('') + '</ul>';
          const others = P.filter(x => x.id !== p.id && realDiff(x.diff_from_main).length);
          if (!others.length) return '<p class="p-body">这一套就是主方案。</p>';
          return '<h4 class="sub-h">换成备选，会换掉哪几天</h4><ul class="diff-list">'
            + others.map(x => {
                const df = realDiff(x.diff_from_main);
                return '<li><b>' + esc(x.name.replace(/｜.*/, '')) + '</b>'
                  + '<span class="was">' + df.slice(0, 3).map(y => DAY_LABEL(y.date) + ' '
                      + esc(leadOf(cleanText(y.this), 20))).join(' · ')
                  + (df.length > 3 ? ' · 另 ' + (df.length - 3) + ' 天' : '') + '</span></li>';
              }).join('') + '</ul>';
        })()
      + '<h4 class="sub-h">这一套的逐晚落点</h4><ul class="plan-nights">'
      + (TRIP.days || []).filter(d => d.id !== '1002').map(d => {
          const diff = (p.night_diff || []).filter(x => x.date === d.id)[0];
          const here = diff ? diff.this : ((p.nights || {})[d.id] || '');
          if (!here) return '';
          return '<li class="plan-day' + (diff ? ' diff' : '') + '"><b>' + esc(DAY_LABEL(d.id)) + '</b>'
            + '<span>夜宿 ' + esc(leadOf(cleanText(here), 34)) + '</span>'
            + (diff ? '<small>主方案：' + esc(leadOf(cleanText(diff.main), 30)) + '</small>' : '') + '</li>';
        }).join('') + '</ul>'
      + ((p.night_diff || []).length
        ? '<h4 class="sub-h">逐晚落点差异</h4><ul class="diff-list">' + p.night_diff.map(x =>
          '<li>' + DAY_LABEL(x.date) + ' 夜：<b>' + esc(leadOf(cleanText(x.this), 40)) + '</b>'
          + '<span class="was">主方案：' + esc(leadOf(cleanText(x.main), 40)) + '</span></li>').join('') + '</ul>' : '')
      + '</article></div>';
  }

  const strip = factStrip(P.map(x => [x.name, esc(leadOf(cleanText(x.gain), 60))]),
    '<div class="day-nav"><a href="index.html#plans">回首页切换方案 →</a></div>');
  const host = document.getElementById('content');
  if (host) host.insertAdjacentHTML('afterbegin', strip);
  paint();
  loadGeoMap(paint);
}
