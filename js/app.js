/* =====================================================================
 * YOLO · 人生只有一次 / js/app.js
 * ---------------------------------------------------------------------
 * 只负责「怎么显示」，不存放任何文案；内容全部来自 js/data.js。
 * 模块顺序：
 *   1. 工具函数 / 本地存储       2. 主题与导航
 *   3. 版块 / 文章 / 话题索引    4. 语录集（搜索 / 收藏 / 复制）
 *   5. 随机语录弹窗 / 轻提示     6. 文章阅读与 hash 路由
 *   7. 滚动观察与初始化
 * 路由约定：
 *   #home / #life / ... / #quotes   → 单页锚点，平滑滚动
 *   #/article/{文章id}              → 打开纯阅读视图（支持浏览器前进后退）
 * ===================================================================== */

(function () {
  'use strict';

  var DATA = window.YOLO_DATA;
  var CATEGORIES = DATA.CATEGORIES;
  var ARTICLES = DATA.ARTICLES;
  var QUOTES = DATA.QUOTES;
  var ENTRIES = DATA.ENTRIES;
  var TOPICS = DATA.TOPICS;

  var KEY_FAV = 'yolo:favorites:v1';
  var KEY_THEME = 'yolo:theme:v1';
  /* 复制语录时附带的署名；不想带署名就改成空字符串 '' */
  var COPY_SIGNATURE = '\n\n—— YOLO · 人生只有一次';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var state = {
    favorites: loadFavorites(),
    keyword: '',
    favoritesOnly: false,
    activeTopic: null,
    lastSection: 'home',
    lastQuoteId: null,
    lastModalTrigger: null
  };

  var modalQuote = null;
  var toastTimer = null;
  var revealObserver = null;

  /* ------------------------------------------------------------------
   * 1. 工具函数 / 本地存储
   * ------------------------------------------------------------------ */

  /** HTML 转义：所有内容文本都经过这里，作者可以随意写引号与符号 */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 转义后把 **重点** 变成强调色，供段落 / 列表 / 引用复用 */
  function rich(value) {
    return esc(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function icon(cls, extra) {
    return '<i class="' + esc(cls) + (extra ? ' ' + esc(extra) : '') + '" aria-hidden="true"></i>';
  }

  function readStore(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式下忽略 */ }
  }

  function loadFavorites() {
    var arr = readStore(KEY_FAV, []);
    return new Set(Array.isArray(arr) ? arr : []);
  }

  function toggleFavorite(id) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    writeStore(KEY_FAV, Array.from(state.favorites));
    return state.favorites.has(id);
  }

  function findArticle(id) {
    return ARTICLES.find(function (a) { return a.id === id; });
  }

  function catById(id) {
    return CATEGORIES.find(function (c) { return c.id === id; });
  }

  function catName(id) { var c = catById(id); return c ? c.name : '随笔'; }
  function catEn(id) { var c = catById(id); return c ? c.en : 'Notes'; }
  function catIcon(id) { var c = catById(id); return c ? c.icon : 'fa-solid fa-feather'; }

  /** 立刻回到页首：临时关闭平滑滚动，避免阅读视图切换时慢慢滚 */
  function jumpTop() {
    var root = document.documentElement;
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = prev;
  }

  /* ------------------------------------------------------------------
   * 2. 主题与导航
   * ------------------------------------------------------------------ */

  function applyTheme(mode) {
    var dark = mode === 'dark';
    document.documentElement.classList.toggle('dark', dark);

    var btn = $('#theme-toggle');
    btn.innerHTML = icon(dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon');
    btn.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
    btn.setAttribute('title', dark ? '浅色模式' : '深色模式');

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1C1B19' : '#F7F4F0');
  }

  function toggleTheme() {
    var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    try { localStorage.setItem(KEY_THEME, next); } catch (e) { /* 忽略 */ }
    applyTheme(next);
    toast(next === 'dark' ? '已切换到夜间阅读' : '已切换到日间阅读');
  }

  /** 导航项完全由分类数据推导，新增分类时导航自动更新 */
  function navItems() {
    var items = [{ id: 'home', name: '首页' }];
    CATEGORIES.forEach(function (c) {
      items.push({ id: c.id, name: c.name });
    });
    items.push({ id: 'quotes', name: '语录集' });
    return items;
  }

  function isSectionId(id) {
    return navItems().some(function (i) { return i.id === id; });
  }

  function navLinkHTML(item, mobile) {
    return '<a href="#' + esc(item.id) + '" data-nav="' + esc(item.id) + '" class="y-nav-link' +
      (mobile ? ' y-nav-link--block' : '') + '">' + esc(item.name) + '</a>';
  }

  function renderNav() {
    var items = navItems();
    $('#nav-links').innerHTML = items.map(function (i) { return navLinkHTML(i, false); }).join('');
    $('#mobile-nav-links').innerHTML = items.map(function (i) { return navLinkHTML(i, true); }).join('');
    $('#footer-links').innerHTML = items.filter(function (i) { return i.id !== 'home'; })
      .map(function (i) {
        return '<a href="#' + esc(i.id) + '" data-nav="' + esc(i.id) +
          '" class="text-sub transition-colors duration-300 hover:text-accent dark:text-night-sub dark:hover:text-night-accent">' +
          esc(i.name) + '</a>';
      }).join(' · ');
  }

  function setActiveNav(id) {
    $$('[data-nav]').forEach(function (a) {
      a.classList.toggle('is-active', a.dataset.nav === id);
    });
  }

  function toggleMenu(force) {
    var menu = $('#mobile-menu');
    var btn = $('#menu-toggle');
    var open = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
    btn.innerHTML = icon(open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars');
  }

  /* ------------------------------------------------------------------
   * 3. 版块与文章渲染
   * ------------------------------------------------------------------ */

  /** 每个分类生成一个锚点版块，文章卡片由 renderArticles 填进去 */
  function renderCategorySections() {
    $('#category-sections').innerHTML = CATEGORIES.map(function (c, index) {
      var no = ('0' + (index + 1)).slice(-2) + ' / ' + ('0' + CATEGORIES.length).slice(-2);
      return '' +
        '<section id="' + esc(c.id) + '" class="reveal border-t border-line/80 py-16 dark:border-night-line/80 md:py-20">' +
          '<div class="mx-auto max-w-6xl px-5 sm:px-8">' +
            '<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">' +
              '<div>' +
                '<p class="text-[11px] uppercase tracking-[.28em] text-sub/80 dark:text-night-sub">' + esc(c.en) + '</p>' +
                '<h2 class="mt-3 text-2xl font-semibold text-accent dark:text-night-accent md:text-3xl">' + esc(c.name) + '</h2>' +
                '<p class="mt-3 text-sm leading-relaxed text-sub dark:text-night-sub">' + esc(c.desc) + '</p>' +
              '</div>' +
              '<span class="hidden text-xs tracking-widest text-sub/60 dark:text-night-sub sm:block">' + no + '</span>' +
            '</div>' +
            '<div class="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" data-article-grid="' + esc(c.id) + '"></div>' +
          '</div>' +
        '</section>';
    }).join('');
  }

  function articleCardHTML(a) {
    return '' +
      '<article class="y-card reveal flex h-full flex-col p-6">' +
        articleArtThumbHTML(a) +
        '<div class="flex flex-wrap items-center gap-2 text-[11px] tracking-wider text-sub dark:text-night-sub">' +
          '<span class="text-accent dark:text-night-accent">' + icon(catIcon(a.category)) + '</span>' +
          '<span>' + esc(catName(a.category)) + '</span>' +
          '<span class="opacity-40">·</span><span>' + esc(a.date) + '</span>' +
          '<span class="opacity-40">·</span><span>约 ' + esc(a.minutes) + ' 分钟</span>' +
        '</div>' +
        '<h3 class="mt-4 text-lg font-semibold leading-snug text-ink dark:text-night-ink">' + esc(a.title) + '</h3>' +
        '<p class="mt-3 flex-1 text-sm leading-[1.9] text-sub dark:text-night-sub">' + esc(a.excerpt) + '</p>' +
        '<div class="mt-5 flex flex-wrap gap-2">' + (a.tags || []).map(function (t) {
          return '<span class="y-chip"># ' + esc(t) + '</span>';
        }).join('') + '</div>' +
        '<a href="#/article/' + encodeURIComponent(a.id) + '" class="y-inline-link mt-6 self-start">' +
          '阅读全文 ' + icon('fa-solid fa-arrow-right') +
        '</a>' +
      '</article>';
  }

  function renderArticles() {
    CATEGORIES.forEach(function (c) {
      var grid = document.querySelector('[data-article-grid="' + c.id + '"]');
      if (!grid) return;
      var list = ARTICLES.filter(function (a) { return a.category === c.id; });
      grid.innerHTML = list.length
        ? list.map(articleCardHTML).join('')
        : '<p class="col-span-full text-sm leading-relaxed text-sub dark:text-night-sub">这个栏目还在写，先留一点空白也好。</p>';
    });
  }

  function renderEntries() {
    $('#entry-grid').innerHTML = ENTRIES.map(function (e) {
      return '' +
        '<a href="#' + esc(e.target) + '" data-entry="' + esc(e.id) + '" class="y-card reveal group flex items-center gap-4 p-5">' +
          '<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-sm text-accent dark:border-night-line dark:text-night-accent">' +
            icon(e.icon) +
          '</span>' +
          '<span class="flex-1">' +
            '<span class="block text-[15px] font-medium text-ink dark:text-night-ink">' + esc(e.title) + '</span>' +
            '<span class="mt-1 block text-xs text-sub dark:text-night-sub">' + esc(e.note) + '</span>' +
          '</span>' +
          '<span class="text-accent/60 transition-transform duration-500 group-hover:translate-x-1 dark:text-night-accent/70">' +
            icon('fa-solid fa-arrow-right', 'text-xs') +
          '</span>' +
        '</a>';
    }).join('');
  }

  /* ------------------------------------------------------------------
   * 3.5 话题索引：由 TOPICS 生成，联动文章列表与语录集
   *   文章关联 = match 词命中 标题 / 摘要 / 标签
   *   语录关联 = search 词命中 正文 / 标签（与语录集搜索框同一套逻辑）
   * ------------------------------------------------------------------ */

  function topicArticles(topic) {
    var words = (topic.match || []).map(function (k) { return String(k).toLowerCase(); });
    return ARTICLES.filter(function (a) {
      var hay = (a.title + ' ' + a.excerpt + ' ' + (a.tags || []).join(' ')).toLowerCase();
      return words.some(function (k) { return k && hay.indexOf(k) !== -1; });
    });
  }

  function topicQuotes(topic) {
    var kw = String(topic.search || '').toLowerCase();
    if (!kw) return [];
    return QUOTES.filter(function (q) {
      return (q.text + ' ' + (q.tags || []).join(' ')).toLowerCase().indexOf(kw) !== -1;
    });
  }

  function renderTopics() {
    $('#topic-grid').innerHTML = TOPICS.map(function (t) {
      return '<button type="button" data-topic="' + esc(t.id) + '" class="y-topic" ' +
        'aria-expanded="false" aria-controls="topic-panel">' +
        icon('fa-solid fa-feather') + esc(t.name) +
        '<span class="text-[10px] opacity-55">' + topicArticles(t).length + '</span>' +
      '</button>';
    }).join('');
  }

  function closeTopic() {
    state.activeTopic = null;
    $$('[data-topic]').forEach(function (btn) {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-expanded', 'false');
    });
    var panel = $('#topic-panel');
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }

  function openTopic(id) {
    var topic = TOPICS.find(function (t) { return t.id === id; });
    if (!topic) return;
    if (state.activeTopic === id) { closeTopic(); return; }

    state.activeTopic = id;
    $$('[data-topic]').forEach(function (btn) {
      var on = btn.dataset.topic === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-expanded', String(on));
    });

    var articles = topicArticles(topic);
    var quotes = topicQuotes(topic);

    $('#topic-panel').innerHTML = '' +
      '<div class="topic-panel-in rounded-lg border border-line bg-card p-6 dark:border-night-line dark:bg-night-card sm:p-8">' +
        '<div class="flex flex-wrap items-start justify-between gap-3">' +
          '<div>' +
            '<p class="text-[10px] tracking-[.26em] text-sub dark:text-night-sub sm:text-[11px]">TOPIC · 话题</p>' +
            '<h3 class="mt-2 text-xl font-semibold text-accent dark:text-night-accent">' + esc(topic.name) + '</h3>' +
            '<p class="mt-2 text-sm leading-relaxed text-sub dark:text-night-sub">' + esc(topic.note) + '</p>' +
          '</div>' +
          '<button type="button" data-topic-close class="y-inline-link">' + icon('fa-solid fa-xmark') + ' 收起</button>' +
        '</div>' +
        '<div class="my-7 h-px w-full bg-line dark:bg-night-line"></div>' +
        '<p class="text-[11px] tracking-[.2em] text-sub dark:text-night-sub">相关文章 · ' + articles.length + ' 篇</p>' +
        '<div class="mt-4 grid gap-2 sm:grid-cols-2">' +
          (articles.length
            ? articles.map(function (a) {
                return '<a href="#/article/' + encodeURIComponent(a.id) + '" class="y-topic-link">' +
                  esc(a.title) + '<small>' + esc(catName(a.category)) + ' · ' + esc(a.date) + '</small></a>';
              }).join('')
            : '<p class="text-sm text-sub dark:text-night-sub">这个话题的文章还在写。</p>') +
        '</div>' +
        '<p class="mt-8 text-[11px] tracking-[.2em] text-sub dark:text-night-sub">相关语录 · ' + quotes.length + ' 句</p>' +
        '<ul class="mt-4 space-y-3">' +
          (quotes.length
            ? quotes.slice(0, 3).map(function (q) {
                return '<li class="font-quote text-sm leading-[1.95] text-ink dark:text-night-ink">' + esc(q.text) + '</li>';
              }).join('')
            : '<li class="text-sm text-sub dark:text-night-sub">这个话题的语录还在写。</li>') +
        '</ul>' +
        (quotes.length
          ? '<button type="button" data-topic-quotes="' + esc(topic.id) + '" class="y-btn y-btn-ghost mt-7">' +
              '在语录集中查看全部 ' + quotes.length + ' 句 ' + icon('fa-solid fa-arrow-right') + '</button>'
          : '') +
      '</div>';

    $('#topic-panel').classList.remove('hidden');
  }

  /** 从话题面板跳到语录集，并自动带入该话题的搜索词 */
  function goToTopicQuotes(id) {
    var topic = TOPICS.find(function (t) { return t.id === id; });
    if (!topic) return;
    var kw = topic.search || topic.name;
    $('#quote-search').value = kw;
    state.keyword = kw;
    state.favoritesOnly = false;
    $('#fav-filter').setAttribute('aria-pressed', 'false');
    renderQuotes();
    if (location.hash === '#quotes') scrollToId('quotes');
    else location.hash = '#quotes';
  }

  /* ---------- 文章正文：重点句子自动 / 显式引用框高亮 ---------- */

  function quoteBlockHTML(text) {
    return '<blockquote class="reader-blockquote"><p>' + rich(text) + '</p></blockquote>';
  }

  function blockHTML(block) {
    var type = block.type || 'p';
    var text = block.text || '';

    /* 约定：普通段落以 "> " 开头时，自动升级为引用框 */
    if (type === 'p' && /^>\s*/.test(text)) return quoteBlockHTML(text.replace(/^>\s*/, ''));

    switch (type) {
      case 'h2': return '<h2>' + esc(text) + '</h2>';
      case 'quote': return quoteBlockHTML(text);
      case 'list':
        return '<ul>' + (block.items || []).map(function (item) {
          return '<li>' + rich(item) + '</li>';
        }).join('') + '</ul>';
      default: return '<p>' + rich(text) + '</p>';
    }
  }

  /* ------------------------------------------------------------------
   * 3.8 文章配图：20 种细线线稿
   *   文章用 art 指定意象；没写 art 的新文章按 tags 从 ART_MOTIFS 自动挑
   *   图形全部内联 SVG，颜色继承 currentColor，日间 / 夜间自动跟随
   * ------------------------------------------------------------------ */

  var ART_MOTIFS = DATA.ART_MOTIFS || [];

  /* 统一 240×160 坐标系；新增意象时在这里补一段即可 */
  var ART_PATHS = {
    exam:
      '<rect x="78" y="14" width="84" height="132" rx="3"/>' +
      '<path d="M96 44h48M96 62h48M96 80h34M96 112h22"/>' +
      '<rect x="138" y="112" width="14" height="14" rx="2"/>' +
      '<path d="M40 140h160" opacity=".35"/>',
    horizon:
      '<path d="M14 118h212"/>' +
      '<path d="M84 118a36 36 0 0 1 72 0"/>' +
      '<path d="M96 96h48" opacity=".6"/>' +
      '<path d="M30 134h52M158 134h52" opacity=".45"/>' +
      '<path d="M120 36v10M120 26v4" opacity=".5"/>',
    grid:
      '<rect x="40" y="24" width="160" height="112" rx="2"/>' +
      '<path d="M40 52h160M40 80h160M40 108h160M93 24v112M147 24v112"/>' +
      '<rect x="94" y="81" width="52" height="26" rx="1" opacity=".55"/>',
    hourglass:
      '<path d="M78 20h84M78 140h84"/>' +
      '<path d="M86 20v8c0 26 34 40 34 52 0 12-34 26-34 52v8"/>' +
      '<path d="M154 20v8c0 26-34 40-34 52 0 12 34 26 34 52v8"/>' +
      '<path d="M98 48h44M100 112h40" opacity=".5"/>' +
      '<circle cx="120" cy="104" r="1.8"/><circle cx="115" cy="114" r="1.4"/><circle cx="125" cy="114" r="1.4"/>',
    scale:
      '<path d="M120 24v116M92 140h56M44 46h152"/>' +
      '<circle cx="120" cy="46" r="3"/>' +
      '<path d="M60 46 44 92M60 46 76 92M44 92a16 10 0 0 0 32 0"/>' +
      '<path d="M180 46 164 92M180 46 196 92M164 92a16 10 0 0 0 32 0"/>' +
      '<rect x="54" y="76" width="12" height="10" rx="1" opacity=".6"/>',
    path:
      '<path d="M120 146C108 108 92 82 64 22"/>' +
      '<path d="M120 146C132 108 148 82 176 22"/>' +
      '<path d="M64 22c-4-8-6-12-6-18M176 22c4-8 6-12 6-18" stroke-dasharray="3 5" opacity=".55"/>' +
      '<circle cx="120" cy="146" r="2.5"/>' +
      '<path d="M40 152h160" opacity=".4"/>',
    door:
      '<rect x="76" y="16" width="88" height="128" rx="2"/>' +
      '<path d="M108 28l44 10v96l-44 10z"/>' +
      '<circle cx="143" cy="82" r="2.5"/>' +
      '<path d="M40 146h160" opacity=".4"/>',
    window:
      '<rect x="66" y="20" width="90" height="112" rx="2"/>' +
      '<path d="M111 20v112M66 76h90"/>' +
      '<path d="M156 40 214 118H172z" opacity=".6"/>' +
      '<path d="M168 54 200 100M180 68 208 108" opacity=".35"/>' +
      '<path d="M40 140h160" opacity=".4"/>',
    cup:
      '<path d="M82 48h76l-8 84H90z"/>' +
      '<path d="M78 48h84"/><path d="M85 78h70" opacity=".65"/>' +
      '<path d="M158 60c14 0 14 22 0 22"/>' +
      '<path d="M106 34c8-8-6-14 2-22M126 34c8-8-6-14 2-22" opacity=".5"/>' +
      '<path d="M40 140h160" opacity=".35"/>',
    leaf:
      '<path d="M44 132C44 70 104 22 196 20c0 68-52 116-120 116z"/>' +
      '<path d="M44 132c40-8 84-40 152-112" opacity=".7"/>' +
      '<path d="M88 100l-2-26M124 76l2-26M154 56l18-10" opacity=".5"/>' +
      '<path d="M44 132c-8 10-14 16-22 18"/>',
    mirror:
      '<ellipse cx="120" cy="76" rx="52" ry="64"/>' +
      '<path d="M120 140v14M96 156h48"/>' +
      '<path d="M90 46c10-12 22-16 34-18M90 60l30-26M150 92l-24 20" opacity=".5"/>' +
      '<circle cx="120" cy="78" r="14" opacity=".55"/>',
    bubble:
      '<circle cx="76" cy="96" r="26"/>' +
      '<circle cx="142" cy="56" r="18"/>' +
      '<circle cx="174" cy="106" r="30"/>' +
      '<circle cx="118" cy="126" r="9" opacity=".6"/>' +
      '<path d="M96 80c12-8 20-12 26-16" stroke-dasharray="3 5" opacity=".55"/>',
    ruler:
      '<path d="M36 56h168v34H36z"/>' +
      '<path d="M56 56v14M76 56v10M96 56v14M116 56v10M136 56v14M156 56v10M176 56v14M196 56v10"/>' +
      '<path d="M40 118h72M126 118h74" opacity=".6"/>' +
      '<path d="M118 108v20" opacity=".45"/>',
    thread:
      '<path d="M40 40c48 0 40 50 80 50s40-50 80-50"/>' +
      '<path d="M40 78c48 0 40 50 80 50s40-50 80-50"/>' +
      '<path d="M40 116c48 0 40 34 80 34s40-34 80-34"/>' +
      '<circle cx="200" cy="40" r="3"/>' +
      '<path d="M40 40v76" opacity=".4"/>',
    stone:
      '<path d="M92 112c0-12 12-22 28-22s28 10 28 22-12 22-28 22-28-10-28-22z"/>' +
      '<path d="M28 126c22-8 44-8 66 0s44 8 66 0 44-8 52 0" opacity=".55"/>' +
      '<path d="M20 140c26-8 52-8 78 0s52 8 78 0 34-6 44 0" opacity=".4"/>' +
      '<path d="M60 96c20-6 40-6 60 0" opacity=".35"/>',
    empty:
      '<rect x="66" y="14" width="108" height="132" rx="3"/>' +
      '<path d="M86 42h46M86 58h30M86 78h20" opacity=".7"/>' +
      '<path d="M154 14l20 20h-20z"/>' +
      '<path d="M40 150h160" opacity=".3"/>',
    bridge:
      '<path d="M16 100h56M168 100h56"/>' +
      '<path d="M72 100c24-34 72-34 96 0M72 108h96"/>' +
      '<path d="M84 108v22M120 108v22M156 108v22" opacity=".45"/>' +
      '<path d="M20 140c20-6 40-6 60 0s40 6 60 0 40-6 60 0" opacity=".5"/>',
    ripple:
      '<circle cx="120" cy="84" r="2.5" fill="currentColor" stroke="none"/>' +
      '<ellipse cx="120" cy="84" rx="30" ry="12" opacity=".7"/>' +
      '<ellipse cx="120" cy="84" rx="58" ry="24" opacity=".5"/>' +
      '<ellipse cx="120" cy="84" rx="88" ry="38" opacity=".3"/>' +
      '<path d="M120 20v34" stroke-dasharray="3 6" opacity=".55"/>',
    clock:
      '<circle cx="120" cy="80" r="58"/>' +
      '<path d="M120 34v8M120 118v8M74 80h8M158 80h8" opacity=".6"/>' +
      '<path d="M120 80V48M120 80l28 16"/>' +
      '<circle cx="120" cy="80" r="2.5" fill="currentColor" stroke="none"/>' +
      '<path d="M40 146h160" opacity=".35"/>',
    light:
      '<path d="M56 18h44l84 124H100z" opacity=".65"/>' +
      '<path d="M72 18 156 142M88 18 172 142" opacity=".3"/>' +
      '<path d="M24 142h192" opacity=".45"/>' +
      '<circle cx="112" cy="76" r="2"/><circle cx="132" cy="102" r="1.6"/><circle cx="96" cy="110" r="1.6"/>'
  };

  /** 优先用文章指定的 art；没写就按 tags 与 ART_MOTIFS 的匹配度挑最贴切的 */
  function artIdFor(a) {
    if (a.art && ART_PATHS[a.art]) return a.art;
    var words = (a.tags || []).map(function (t) { return String(t).toLowerCase(); })
      .filter(function (t) { return t.length >= 2; });
    var best = null;
    var bestScore = 0;
    ART_MOTIFS.forEach(function (m) {
      var score = 0;
      (m.tags || []).forEach(function (mt) {
        var y = String(mt).toLowerCase();
        if (y.length < 2) return;
        words.forEach(function (x) {
          if (x === y) score += 3;
          else if (x.indexOf(y) !== -1 || y.indexOf(x) !== -1) score += 1;
        });
      });
      if (ART_PATHS[m.id] && score > bestScore) { bestScore = score; best = m.id; }
    });
    return best || 'empty';
  }

  function artMotifName(a) {
    var id = artIdFor(a);
    var name = '线稿';
    ART_MOTIFS.forEach(function (m) { if (m.id === id) name = m.name; });
    return name;
  }

  function artSVG(a, thumb) {
    var label = artMotifName(a) + ' · ' + a.title;
    return '<svg class="y-art-svg" viewBox="' + (thumb ? '30 8 180 144' : '0 0 240 160') + '" ' +
      'xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.25" ' +
      'stroke-linecap="round" stroke-linejoin="round" ' +
      (thumb ? 'aria-hidden="true"' : 'role="img" aria-label="' + esc(label) + '"') + '>' +
      (thumb ? '' : '<title>' + esc(label) + '</title>') +
      ART_PATHS[artIdFor(a)] +
      '</svg>';
  }

  /** 卡片顶部的小线稿，让每篇文章在列表里也有自己的配图 */
  function articleArtThumbHTML(a) {
    return '<div class="y-card-art">' + artSVG(a, true) + '</div>';
  }

  /** 阅读页主配图：内联 SVG + 意象说明 */
  function articleArtHTML(a) {
    return '<figure class="y-article-art soft-rise">' + artSVG(a, false) +
      '<figcaption>配图 · ' + esc(artMotifName(a)) + '<span aria-hidden="true"> / </span>' + esc(a.title) + '</figcaption>' +
      '</figure>';
  }

  function epigraphHTML(a) {
    if (!a.epigraph) return '';
    return '<blockquote class="reader-epigraph">' + rich(a.epigraph) + '</blockquote>';
  }

  function closingHTML(a) {
    if (!a.closing) return '';
    return '<section class="reader-closing">' +
      '<p class="reader-closing-label">写在最后</p>' +
      '<p>' + rich(a.closing) + '</p>' +
      '</section>';
  }

  /** 按文章标签从语录集挑几句相关的话；同一篇的结果固定，刷新不会乱跳 */
  function relatedQuotesFor(a) {
    var tags = (a.tags || []).map(function (t) { return String(t).toLowerCase(); })
      .filter(function (t) { return t.length >= 2; });
    if (!tags.length) return [];

    var matched = QUOTES.filter(function (q) {
      return (q.tags || []).some(function (t) {
        var qt = String(t).toLowerCase();
        if (qt.length < 2) return false;
        /* 双向包含：'时间观' 能匹配 '时间'，'停止内耗' 能匹配 '内耗' */
        return tags.some(function (at) {
          return at.indexOf(qt) !== -1 || qt.indexOf(at) !== -1;
        });
      });
    });
    if (!matched.length) return [];

    var seed = 0;
    for (var i = 0; i < a.id.length; i++) seed += a.id.charCodeAt(i);
    var start = seed % matched.length;
    var out = [];
    for (var j = 0; j < Math.min(3, matched.length); j++) {
      out.push(matched[(start + j) % matched.length]);
    }
    return out;
  }

  function relatedQuotesHTML(a) {
    var list = relatedQuotesFor(a);
    if (!list.length) return '';
    return '' +
      '<section class="mt-14 border-t border-line pt-8 dark:border-night-line">' +
        '<p class="text-[11px] tracking-[.24em] text-sub dark:text-night-sub">与这篇有关的句子</p>' +
        '<div class="mt-5 space-y-3">' +
          list.map(function (q) {
            return '<div class="flex items-start justify-between gap-4 rounded-lg border border-line bg-sand p-4 dark:border-night-line dark:bg-night-sand">' +
              '<p class="font-quote text-sm leading-[1.95] text-ink dark:text-night-ink">' + esc(q.text) + '</p>' +
              '<button type="button" data-copy-quote="' + esc(q.id) + '" class="y-icon-btn shrink-0" aria-label="复制这句" title="复制">' +
                icon('fa-regular fa-copy') + '</button>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<a href="#quotes" data-nav="quotes" class="y-inline-link mt-5">去语录集慢慢读 ' + icon('fa-solid fa-arrow-right') + '</a>' +
      '</section>';
  }

  function renderArticle(a) {
    $('#article-content').innerHTML = '' +
      '<div class="soft-rise">' +
        '<p class="text-[11px] uppercase tracking-[.28em] text-sub dark:text-night-sub">' + esc(catEn(a.category)) + ' / 随笔</p>' +
        '<h1 class="mt-5 text-3xl font-semibold leading-[1.35] text-ink dark:text-night-ink md:text-[2.6rem]">' + esc(a.title) + '</h1>' +
        '<p class="mt-5 text-base leading-[1.9] text-sub dark:text-night-sub md:text-lg">' + esc(a.excerpt) + '</p>' +
        '<div class="mt-7 flex flex-wrap items-center gap-2 text-xs text-sub dark:text-night-sub">' +
          '<span>' + esc(catName(a.category)) + '</span><span class="opacity-40">·</span>' +
          '<span>' + esc(a.date) + '</span><span class="opacity-40">·</span>' +
          '<span>约 ' + esc(a.minutes) + ' 分钟</span>' +
        '</div>' +
        '<div class="my-10 h-px w-full bg-line dark:bg-night-line"></div>' +
        articleArtHTML(a) +
        epigraphHTML(a) +
        '<div class="reader-body">' + (a.content || []).map(blockHTML).join('') + '</div>' +
        closingHTML(a) +
        relatedQuotesHTML(a) +
      '</div>';

    var siblings = ARTICLES.filter(function (x) {
      return x.category === a.category && x.id !== a.id;
    }).slice(0, 3);

    $('#article-footer').innerHTML = '' +
      '<div class="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">' +
        '<button type="button" data-back class="y-inline-link self-start">' + icon('fa-solid fa-arrow-left') + ' 返回' + esc(catName(a.category)) + '</button>' +
        '<div class="sm:text-right">' +
          '<p class="text-[11px] tracking-[.2em] text-sub dark:text-night-sub">继续阅读 · 同一栏目</p>' +
          '<div class="mt-3 flex flex-col items-start gap-2 sm:items-end">' +
            (siblings.length
              ? siblings.map(function (s) {
                  return '<a href="#/article/' + encodeURIComponent(s.id) + '" class="y-inline-link">' +
                    esc(s.title) + ' ' + icon('fa-solid fa-arrow-right') + '</a>';
                }).join('')
              : '<a href="#quotes" data-nav="quotes" class="y-inline-link">去语录集看看 ' + icon('fa-solid fa-arrow-right') + '</a>') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------
   * 4. 语录集：搜索 / 收藏 / 复制
   * ------------------------------------------------------------------ */

  function quoteCardHTML(q) {
    var fav = state.favorites.has(q.id);
    return '' +
      '<figure class="y-quote-card reveal mb-5" data-quote-id="' + esc(q.id) + '">' +
        '<div class="flex items-start gap-3">' +
          '<span class="mt-1 text-xs text-accent/45 dark:text-night-accent/50">' + icon('fa-solid fa-quote-left') + '</span>' +
          '<p class="font-quote flex-1 text-[15px] leading-[2] text-ink dark:text-night-ink">' + esc(q.text) + '</p>' +
        '</div>' +
        '<figcaption class="mt-5 flex items-center justify-between gap-3 border-t border-line/70 pt-4 dark:border-night-line/70">' +
          '<div class="flex flex-wrap gap-1.5">' + (q.tags || []).map(function (t) {
            return '<span class="y-chip"># ' + esc(t) + '</span>';
          }).join('') + '</div>' +
          '<div class="flex shrink-0 items-center gap-1">' +
            '<button type="button" data-action="fav" data-id="' + esc(q.id) + '" class="y-icon-btn' + (fav ? ' is-fav' : '') +
              '" aria-pressed="' + fav + '" aria-label="收藏这句" title="收藏">' +
              icon(fav ? 'fa-solid fa-heart' : 'fa-regular fa-heart') + '</button>' +
            '<button type="button" data-action="copy" data-id="' + esc(q.id) + '" class="y-icon-btn" aria-label="复制这句" title="复制">' +
              icon('fa-regular fa-copy') + '</button>' +
          '</div>' +
        '</figcaption>' +
      '</figure>';
  }

  function filteredQuotes() {
    var kw = state.keyword.toLowerCase();
    return QUOTES.filter(function (q) {
      if (state.favoritesOnly && !state.favorites.has(q.id)) return false;
      if (!kw) return true;
      var haystack = (q.text + ' ' + (q.tags || []).join(' ')).toLowerCase();
      return haystack.indexOf(kw) !== -1;
    });
  }

  function renderQuotes() {
    var list = filteredQuotes();
    $('#quote-grid').innerHTML = list.map(quoteCardHTML).join('');
    $('#quote-empty').classList.toggle('hidden', list.length > 0);

    var filters = [];
    if (state.keyword) filters.push('关键词「' + state.keyword + '」');
    if (state.favoritesOnly) filters.push('只看收藏');
    $('#quote-count').textContent = '共 ' + list.length + ' 句' +
      (filters.length ? ' · ' + filters.join(' · ') : ' · 全部语录');

    observeReveals();
  }

  /** 随机取一句，并尽量不与上一次重复 */
  function pickRandomQuote() {
    if (!QUOTES.length) return null;
    var pool = QUOTES.filter(function (q) { return q.id !== state.lastQuoteId; });
    var list = pool.length ? pool : QUOTES;
    var q = list[Math.floor(Math.random() * list.length)];
    state.lastQuoteId = q.id;
    return q;
  }

  /* 复制：优先 Clipboard API，file:// 或不支持时回落到 execCommand */
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        if (!legacyCopy(text)) return Promise.reject(new Error('copy failed'));
      });
    }
    return legacyCopy(text) ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  function copyQuote(q) {
    copyText(q.text + COPY_SIGNATURE)
      .then(function () { toast('已复制，可以分享给想分享的人'); })
      .catch(function () { toast('复制失败，请手动选中文本'); });
  }

  /* ------------------------------------------------------------------
   * 5. 随机语录弹窗 / 轻提示
   * ------------------------------------------------------------------ */

  function isModalOpen() {
    return !$('#quote-modal').classList.contains('invisible');
  }

  function syncModalFav() {
    var fav = !!(modalQuote && state.favorites.has(modalQuote.id));
    var btn = $('#modal-fav');
    btn.innerHTML = icon(fav ? 'fa-solid fa-heart' : 'fa-regular fa-heart') + (fav ? ' 已收藏' : ' 收藏');
    btn.setAttribute('aria-pressed', String(fav));
  }

  function fillModal(q) {
    $('#modal-quote-text').textContent = q.text;
    $('#modal-quote-tags').innerHTML = (q.tags || []).map(function (t) {
      return '<span class="y-chip"># ' + esc(t) + '</span>';
    }).join('');
    syncModalFav();
  }

  function openRandomQuote(trigger) {
    state.lastModalTrigger = trigger || null;
    modalQuote = pickRandomQuote();
    if (!modalQuote) return;
    fillModal(modalQuote);

    var modal = $('#quote-modal');
    modal.classList.remove('opacity-0', 'invisible', 'pointer-events-none');
    modal.classList.add('opacity-100');
    modal.setAttribute('aria-hidden', 'false');

    var panel = $('#modal-panel');
    panel.classList.remove('translate-y-3', 'opacity-0');
    panel.classList.add('translate-y-0', 'opacity-100');

    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#modal-close').focus(); }, 80);
  }

  function closeModal() {
    if (!isModalOpen()) return;
    var modal = $('#quote-modal');
    modal.classList.add('opacity-0', 'invisible', 'pointer-events-none');
    modal.classList.remove('opacity-100');
    modal.setAttribute('aria-hidden', 'true');

    var panel = $('#modal-panel');
    panel.classList.remove('translate-y-0', 'opacity-100');
    panel.classList.add('translate-y-3', 'opacity-0');

    document.body.style.overflow = '';
    if (state.lastModalTrigger && state.lastModalTrigger.focus) state.lastModalTrigger.focus();
  }

  function toast(message) {
    var el = $('#toast');
    $('#toast-text').textContent = message;
    el.classList.remove('opacity-0', 'translate-y-3');
    el.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.add('opacity-0', 'translate-y-3');
      el.classList.remove('opacity-100', 'translate-y-0');
    }, 2200);
  }

  /* ------------------------------------------------------------------
   * 6. 文章阅读与 hash 路由
   * ------------------------------------------------------------------ */

  function showMain() {
    $('#article-view').classList.add('hidden');
    $('#main-view').classList.remove('hidden');
    $('#site-footer').classList.remove('hidden');
    if (isModalOpen()) closeModal();
  }

  function showArticle(a) {
    $('#main-view').classList.add('hidden');
    $('#site-footer').classList.add('hidden');
    $('#article-view').classList.remove('hidden');
    renderArticle(a);
    jumpTop();
    observeReveals();
  }

  function scrollToId(id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleRoute() {
    var hash = location.hash || '';
    var match = /^#\/article\/(.+)$/.exec(hash);
    if (match) {
      var article = findArticle(decodeURIComponent(match[1]));
      if (article) { showArticle(article); return; }
    }

    showMain();
    var id = hash.replace(/^#/, '');
    if (id && isSectionId(id)) {
      state.lastSection = id;
      setActiveNav(id);
      /* 从阅读视图返回时版块刚被显示出来，需手动补一次滚动 */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { scrollToId(id); });
      });
    }
  }

  function goBackFromArticle() {
    var id = isSectionId(state.lastSection) ? state.lastSection : 'home';
    if (location.hash === '#' + id) {
      showMain();
      requestAnimationFrame(function () { scrollToId(id); });
    } else {
      location.hash = '#' + id;
    }
  }

  /* ------------------------------------------------------------------
   * 7. 滚动观察与初始化
   * ------------------------------------------------------------------ */

  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  }

  function observeReveals() {
    $$('.reveal:not(.is-visible)').forEach(function (el) {
      if (revealObserver) revealObserver.observe(el);
      else el.classList.add('is-visible');
    });
  }

  /** 滚动时高亮当前栏目，同时记住「上一篇是从哪里点进来的」 */
  function initSectionObserver() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          state.lastSection = entry.target.id;
          setActiveNav(entry.target.id);
        }
      });
    }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });

    navItems().forEach(function (item) {
      var el = document.getElementById(item.id);
      if (el) io.observe(el);
    });
  }

  function initEvents() {
    /* 主题 / 菜单 */
    $('#theme-toggle').addEventListener('click', toggleTheme);
    $('#menu-toggle').addEventListener('click', function () { toggleMenu(); });

    /* 随机语录入口 */
    $('#hero-random').addEventListener('click', function (e) { openRandomQuote(e.currentTarget); });
    $('#quotes-random').addEventListener('click', function (e) { openRandomQuote(e.currentTarget); });
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-backdrop').addEventListener('click', closeModal);
    $('#modal-shuffle').addEventListener('click', function () {
      modalQuote = pickRandomQuote();
      if (modalQuote) fillModal(modalQuote);
    });
    $('#modal-copy').addEventListener('click', function () { if (modalQuote) copyQuote(modalQuote); });
    $('#modal-fav').addEventListener('click', function () {
      if (!modalQuote) return;
      var on = toggleFavorite(modalQuote.id);
      syncModalFav();
      renderQuotes();
      toast(on ? '已收藏，放进你的句子里' : '已取消收藏');
    });

    /* 语录集：搜索 / 只看收藏 / 卡片操作（事件委托） */
    $('#quote-search').addEventListener('input', function (e) {
      state.keyword = e.target.value.trim();
      renderQuotes();
    });
    $('#fav-filter').addEventListener('click', function (e) {
      state.favoritesOnly = !state.favoritesOnly;
      e.currentTarget.setAttribute('aria-pressed', String(state.favoritesOnly));
      renderQuotes();
    });
    $('#quote-grid').addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var q = QUOTES.find(function (x) { return x.id === btn.dataset.id; });
      if (!q) return;
      if (btn.dataset.action === 'fav') {
        var on = toggleFavorite(q.id);
        toast(on ? '已收藏，放进你的句子里' : '已取消收藏');
        renderQuotes();
        if (modalQuote && modalQuote.id === q.id) syncModalFav();
      } else if (btn.dataset.action === 'copy') {
        copyQuote(q);
      }
    });

    /* 首页入口：带 keyword 的入口跳到语录集并自动填入搜索词 */
    $('#entry-grid').addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      var link = e.target.closest('[data-entry]');
      if (!link) return;
      var item = ENTRIES.find(function (x) { return x.id === link.dataset.entry; });
      if (item && item.keyword) {
        $('#quote-search').value = item.keyword;
        state.keyword = item.keyword;
        state.favoritesOnly = false;
        $('#fav-filter').setAttribute('aria-pressed', 'false');
        renderQuotes();
      }
      /* 其余情况由 <a href="#..."> 的默认锚点跳转处理 */
    });

    /* 话题索引：按钮展开 / 收起 / 查看全部语录（事件委托） */
    $('#topic-grid').addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      var btn = e.target.closest('[data-topic]');
      if (btn) openTopic(btn.dataset.topic);
    });
    $('#topic-panel').addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('[data-topic-close]')) { closeTopic(); return; }
      var more = e.target.closest('[data-topic-quotes]');
      if (more) goToTopicQuotes(more.dataset.topicQuotes);
    });

    /* 文章末尾「与这篇有关的句子」：一键复制 */
    $('#article-content').addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      var btn = e.target.closest('[data-copy-quote]');
      if (!btn) return;
      var q = QUOTES.find(function (x) { return x.id === btn.dataset.copyQuote; });
      if (q) copyQuote(q);
    });

    /* 全局：导航点击、文章返回 */
    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      var nav = e.target.closest('[data-nav]');
      if (nav) {
        var id = nav.dataset.nav;
        state.lastSection = id;
        setActiveNav(id);
        toggleMenu(false);
        /* hash 未变化（已在同一锚点）时 hashchange 不触发，手动滚动 */
        if (location.hash === '#' + id) {
          showMain();
          requestAnimationFrame(function () { scrollToId(id); });
        }
        return;
      }
      if (e.target.closest('[data-back]')) goBackFromArticle();
    });

    /* 键盘与窗口 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); toggleMenu(false); }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024) toggleMenu(false);
    });
    window.addEventListener('hashchange', handleRoute);
  }

  function init() {
    applyTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

    renderNav();
    renderCategorySections();
    renderArticles();
    renderEntries();
    renderTopics();

    initReveal();
    initSectionObserver();
    initEvents();

    state.keyword = $('#quote-search').value.trim();
    renderQuotes();
    observeReveals();

    $('#year').textContent = new Date().getFullYear();
    setActiveNav('home');
    handleRoute();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
