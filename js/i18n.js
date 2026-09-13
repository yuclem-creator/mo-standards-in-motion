/* ============================================================
   MOI18N — language layer for Standards in Motion
   Curated translations ship in-package (brand-safe).
   Any other language is auto-translated at runtime and cached.
   ============================================================ */
(function (global) {
  "use strict";

  var LANGS = [
    { code: "en",    name: "English",    curated: true  },
    { code: "zh-CN", name: "简体中文",    curated: true  },
    { code: "zh-TW", name: "繁體中文",    curated: true  },
    { code: "ja",    name: "日本語",      curated: true  },
    { code: "fr",    name: "Français",   curated: true  },
    { code: "de",    name: "Deutsch"                    },
    { code: "es",    name: "Español"                    },
    { code: "ko",    name: "한국어"                     },
    { code: "ar",    name: "العربية",    rtl: true      },
    { code: "th",    name: "ไทย"                        }
  ];

  /* ---------------- English master ---------------- */
  var EN = {
    ui: {
      series        : "Service Essentials · Three Standards",
      selectLanguage: "Select your language",
      begin         : "Begin",
      translating   : "Translating…",
      swipeHint     : "Swipe up for the next standard",
      sound         : "Sound",
      muted         : "Muted",
      replay        : "Replay",
      knowledgeCheck: "Knowledge Check",
      standardMet   : "Standard Met",
      metSwipe      : "Standard met — swipe up",
      watchGate     : "Watch this standard in full to continue",
      finishGate    : "Finish each standard to complete the series",
      completeTitle : "Series Complete",
      completeLms   : "Completion reported to LMS · Score ",
      completePreview: "Preview mode — progress will report when launched from the LMS",
      rewatch       : "Rewatch Series",
      duet          : "Practise — Duet",
      finish        : "Finish",
      continueBtn   : "Continue",
      notedContinue : "Noted — Continue",
      standard      : "Standard",
      duration      : "Duration",
      houseTips     : "House tips",
      beatNote      : "Watch the replay — tap the clip at the exact moment",
      spotNote      : "Study the frame, then tap the detail",
      tooEarly      : "Too early",
      tooLate       : "Too late",
      oneMoreTry    : "one more try",
      spotMiss      : "Not quite the detail",
      resetProgress : "Reset my progress",
      assessKicker  : "Final assessment",
      assessTitle   : "The True Measure",
      assessQuestions: "questions",
      passMark      : "Pass mark",
      triesLeft     : "tries remaining",
      modeAllDesc   : "A retry restarts the full assessment.",
      modeWrongDesc : "A retry covers only the questions you missed.",
      beginAssess   : "Begin assessment",
      question      : "Question",
      assessPassed  : "Assessment passed",
      assessFailed  : "Not this time",
      tryWord       : "Try",
      retryAll      : "Retake the full assessment",
      retryWrong    : "Retake the missed questions",
      noTries       : "No tries remaining — your manager will follow up with you.",
      unlimited     : "Unlimited",
      preKicker     : "Pre-assessment",
      preTitle      : "Before we begin",
      preDesc       : "No pass mark — this simply captures your starting point. Answer honestly.",
      preDone       : "Baseline captured",
      preNote       : "Your starting score has been recorded. Now let’s build on it."
    },
    reels: [
      {
        dept  : "Front Office",
        title : "The Arrival Welcome",
        points: [
          "Acknowledge every guest within ten seconds of arrival",
          "Open the door with the hand furthest from the guest",
          "Offer a warm, unhurried verbal welcome by name where known"
        ],
        quiz: {
          q      : "Within how many seconds should every arriving guest be acknowledged?",
          options: ["Five seconds", "Ten seconds", "Thirty seconds"],
          why    : "Ten seconds — presence before process."
        },
        tips: [
          { img: "media/tips/arrival-hero.jpg", title: "Ten seconds is a presence, not a task",
            text: "A nod or a smile counts when your hands are full — acknowledgement is the standard, ceremony is not." },
          { img: "media/tips/r1-a.jpg", title: "The far hand rule",
            text: "Door opens with the hand furthest from the guest — the threshold stays clear and the welcome stays open." },
          { img: "media/tips/r1-b.jpg", title: "Names travel",
            text: "Catch the name from the luggage tag or the doorman's greeting — use it once, naturally, at the door." }
        ]
      },
      {
        dept  : "Food & Beverage",
        title : "Tableside Grace",
        points: [
          "Present and pour from the guest's right, label facing out",
          "Fill to one-third — never more, never rushed",
          "Withdraw silently; return the bottle to the table, cork up"
        ],
        quiz: {
          q      : "From which side do you present and pour the wine?",
          options: ["The guest's left", "Whichever side is clear", "The guest's right"],
          why    : "Always from the right, label facing the guest."
        },
        tips: [
          { img: "media/tips/tableside-hero.jpg", title: "Label out, always",
            text: "The guest should never have to ask what they are drinking — the label faces the guest from first pour to last." },
          { img: "media/tips/r2-a.jpg", title: "One-third is the measure",
            text: "A third of the glass leaves room for the wine to breathe — and for the ritual to repeat." },
          { img: "media/tips/r2-b.jpg", title: "Leave the table as you found it",
            text: "Bottle returned, cork up, glassware aligned — the table resets itself between courses." }
        ]
      },
      {
        dept  : "Housekeeping",
        title : "The Perfect Turndown",
        points: [
          "Fold the duvet corner at forty-five degrees, seam inward",
          "Place the evening amenity centred on the pillow line",
          "Set lighting to the evening scene before leaving the room"
        ],
        quiz: {
          q      : "At what angle is the duvet corner folded for turndown?",
          options: ["Thirty degrees", "Ninety degrees", "Forty-five degrees"],
          why    : "Forty-five degrees, seam inward — the signature fold."
        },
        tips: [
          { img: "media/tips/turndown-hero.jpg", title: "Set the scene before you leave",
            text: "Evening lighting, curtains drawn, room calm — the room should greet the guest before anyone else can." },
          { img: "media/tips/r3-a.jpg", title: "The fold is the signature",
            text: "Forty-five degrees, seam inward — a guest can tell a Mandarin Oriental turndown from the doorway." },
          { img: "media/tips/r3-b.jpg", title: "Tomorrow, on the pillow",
            text: "Amenity centred on the pillow line with tomorrow's weather — small foresight, quietly delivered." }
        ]
      }
    ]
  };

  /* ---------------- Curated translations ---------------- */
  var CURATED = {

    "zh-CN": {
      ui: {
        series: "服务精髓 · 三项标准", selectLanguage: "选择您的语言", begin: "开始学习",
        translating: "正在翻译…", swipeHint: "向上滑动查看下一项标准", sound: "声音", muted: "静音",
        replay: "重播", knowledgeCheck: "知识检验", standardMet: "标准达成",
        metSwipe: "标准达成——向上滑动", watchGate: "请完整观看本标准后再继续",
        finishGate: "请完成每项标准以完成本系列", completeTitle: "系列完成",
        completeLms: "完成情况已上报 LMS · 得分 ",
        completePreview: "预览模式——从 LMS 启动时将上报进度",
        rewatch: "重新观看", duet: "练习 — 分屏跟练", finish: "完成", continueBtn: "继续", notedContinue: "已记录——继续",
        standard: "标准", duration: "时长", beatNote: "观看回放——在关键瞬间点按画面", spotNote: "观察画面，点按关键细节", tooEarly: "太早了", tooLate: "太晚了", oneMoreTry: "再试一次", spotMiss: "还不是那个细节", resetProgress: "重置我的进度", assessKicker: "最终测评", assessTitle: "真正的考验", assessQuestions: "道题目", passMark: "及格线", triesLeft: "次机会剩余", modeAllDesc: "重试将重新开始整个测评。", modeWrongDesc: "重试仅涵盖答错的题目。", beginAssess: "开始测评", question: "题目", assessPassed: "测评通过", assessFailed: "这次还差一点", tryWord: "第", retryAll: "重新参加完整测评", retryWrong: "仅重试答错的题目", noTries: "已无剩余机会——您的经理将与您跟进。", unlimited: "不限次数", preKicker: "学前测评", preTitle: "开始之前", preDesc: "没有及格线——这只是记录您的起点。请如实作答。", preDone: "起点已记录", preNote: "您的起始分数已被记录。现在让我们一起提升。"
      },
      reels: [
        {
          dept: "前厅部", title: "抵达迎宾",
          points: ["宾客抵达后十秒内须致以问候", "以远离宾客一侧的手开启大门", "如知悉宾客姓名，以姓名称呼，问候热忱而从容"],
          quiz: { q: "宾客抵达后，应在多少秒内致以问候？", options: ["五秒", "十秒", "三十秒"], why: "十秒——先有致意，后有流程。" }
        },
        {
          dept: "餐饮部", title: "餐桌侍酒之雅",
          points: ["从宾客右侧示酒并斟酒，酒标朝外", "斟至三分之一杯——不过量，不仓促", "悄然退离；酒瓶放回桌上，瓶塞朝上"],
          quiz: { q: "应从哪一侧为宾客示酒并斟酒？", options: ["宾客左侧", "方便的一侧", "宾客右侧"], why: "始终从右侧，酒标朝向宾客。" }
        },
        {
          dept: "客房部", title: "完美夜床",
          points: ["将被角以四十五度折起，折缝朝内", "将晚安小点置于枕线正中", "离开房间前将灯光调至夜间场景"],
          quiz: { q: "夜床服务中，被角应折成多少度？", options: ["三十度", "九十度", "四十五度"], why: "四十五度，折缝朝内——标志式折法。" }
        }
      ]
    },

    "zh-TW": {
      ui: {
        series: "服務精髓 · 三項標準", selectLanguage: "選擇您的語言", begin: "開始學習",
        translating: "正在翻譯…", swipeHint: "向上滑動查看下一項標準", sound: "聲音", muted: "靜音",
        replay: "重播", knowledgeCheck: "知識檢驗", standardMet: "標準達成",
        metSwipe: "標準達成——向上滑動", watchGate: "請完整觀看本標準後再繼續",
        finishGate: "請完成每項標準以完成本系列", completeTitle: "系列完成",
        completeLms: "完成情況已上報 LMS · 得分 ",
        completePreview: "預覽模式——從 LMS 啟動時將上報進度",
        rewatch: "重新觀看", duet: "練習 — 分屏跟練", finish: "完成", continueBtn: "繼續", notedContinue: "已記錄——繼續",
        standard: "標準", duration: "時長", beatNote: "觀看回放——在關鍵瞬間點按畫面", spotNote: "觀察畫面，點按關鍵細節", tooEarly: "太早了", tooLate: "太晚了", oneMoreTry: "再試一次", spotMiss: "還不是那個細節", resetProgress: "重置我的進度", assessKicker: "最終測評", assessTitle: "真正的考驗", assessQuestions: "道題目", passMark: "及格線", triesLeft: "次機會剩餘", modeAllDesc: "重試將重新開始整個測評。", modeWrongDesc: "重試僅涵蓋答錯的題目。", beginAssess: "開始測評", question: "題目", assessPassed: "測評通過", assessFailed: "這次還差一點", tryWord: "第", retryAll: "重新參加完整測評", retryWrong: "僅重試答錯的題目", noTries: "已無剩餘機會——您的經理將與您跟進。", unlimited: "不限次數", preKicker: "學前測評", preTitle: "開始之前", preDesc: "沒有及格線——這只是記錄您的起點。請如實作答。", preDone: "起點已記錄", preNote: "您的起始分數已被記錄。現在讓我們一起提升。"
      },
      reels: [
        {
          dept: "前廳部", title: "抵達迎賓",
          points: ["賓客抵達後十秒內須致以問候", "以遠離賓客一側的手開啟大門", "如知悉賓客姓名，以姓名稱呼，問候熱忱而從容"],
          quiz: { q: "賓客抵達後，應在多少秒內致以問候？", options: ["五秒", "十秒", "三十秒"], why: "十秒——先有致意，後有流程。" }
        },
        {
          dept: "餐飲部", title: "餐桌侍酒之雅",
          points: ["從賓客右側示酒並斟酒，酒標朝外", "斟至三分之一杯——不過量，不倉促", "悄然退離；酒瓶放回桌上，瓶塞朝上"],
          quiz: { q: "應從哪一側為賓客示酒並斟酒？", options: ["賓客左側", "方便的一側", "賓客右側"], why: "始終從右側，酒標朝向賓客。" }
        },
        {
          dept: "客房部", title: "完美夜床",
          points: ["將被角以四十五度折起，折縫朝內", "將晚安小點置於枕線正中", "離開房間前將燈光調至夜間場景"],
          quiz: { q: "夜床服務中，被角應折成多少度？", options: ["三十度", "九十度", "四十五度"], why: "四十五度，折縫朝內——標誌式折法。" }
        }
      ]
    },

    "ja": {
      ui: {
        series: "サービスの真髄 · 3つのスタンダード", selectLanguage: "言語を選択してください", begin: "開始",
        translating: "翻訳中…", swipeHint: "上にスワイプして次のスタンダードへ", sound: "音声", muted: "ミュート",
        replay: "リプレイ", knowledgeCheck: "理解度チェック", standardMet: "スタンダード達成",
        metSwipe: "スタンダード達成 — 上にスワイプ", watchGate: "このスタンダードを最後まで視聴してください",
        finishGate: "すべてのスタンダードを完了してください", completeTitle: "シリーズ完了",
        completeLms: "LMSに完了を報告しました · スコア ",
        completePreview: "プレビューモード — LMSから起動すると進捗が報告されます",
        rewatch: "もう一度見る", duet: "練習 — デュエット", finish: "終了", continueBtn: "続ける", notedContinue: "承知しました — 続ける",
        standard: "スタンダード", duration: "所要時間", beatNote: "再生を見て、肝心な瞬間に画面をタップ", spotNote: "フレームを観察して重要なディテールをタップ", tooEarly: "早すぎます", tooLate: "遅すぎます", oneMoreTry: "もう一度", spotMiss: "そのディテールではありません", resetProgress: "進捗をリセット", assessKicker: "最終アセスメント", assessTitle: "真の試練", assessQuestions: "問", passMark: "合格ライン", triesLeft: "回残り", modeAllDesc: "リトライはアセスメント全体をやり直します。", modeWrongDesc: "リトライは間違えた問題のみです。", beginAssess: "アセスメント開始", question: "問", assessPassed: "合格です", assessFailed: "今回は不合格", tryWord: "試行", retryAll: "全問をやり直す", retryWrong: "間違えた問題のみやり直す", noTries: "残りの回数がありません——マネージャーがフォローします。", unlimited: "制限なし", preKicker: "事前アセスメント", preTitle: "始める前に", preDesc: "合格ラインはありません——現在の理解度を記録するだけです。正直にお答えください。", preDone: "ベースラインを記録しました", preNote: "開始時のスコアが記録されました。ここから高めていきましょう。"
      },
      reels: [
        {
          dept: "フロントオフィス", title: "到着のお出迎え",
          points: ["ご到着から10秒以内にすべてのゲストにお声がけする", "ゲストから遠い側の手でドアを開ける", "お名前が分かる場合は、お名前を添えて心地よく挨拶する"],
          quiz: { q: "ゲストにはご到着から何秒以内にお声がけすべきですか？", options: ["5秒", "10秒", "30秒"], why: "10秒 — まず気配を示すことが先決です。" }
        },
        {
          dept: "料飲部", title: "テーブルサイドの所作",
          points: ["ゲストの右側から、ラベルを外側にしてサーブする", "グラスの三分の一まで — 注ぎすぎず、急がず", "静かに下がり、ボトルはコルクを上にして戻す"],
          quiz: { q: "ワインはどちら側からサーブしますか？", options: ["ゲストの左側", "空いている側", "ゲストの右側"], why: "常に右側から、ラベルはゲストに向けて。" }
        },
        {
          dept: "ハウスキーピング", title: "完璧なターンダウン",
          points: ["掛け布団の角を45度に折り、縫い目を内側に", "イブニングアメニティを枕のラインの中央に", "退出前に照明を夜のシーンに設定する"],
          quiz: { q: "掛け布団の角は何度に折りますか？", options: ["30度", "90度", "45度"], why: "45度、縫い目は内側 — シグネチャーの折り方です。" }
        }
      ]
    },

    "fr": {
      ui: {
        series: "L'Essence du Service · Trois Standards", selectLanguage: "Choisissez votre langue", begin: "Commencer",
        translating: "Traduction…", swipeHint: "Balayez vers le haut pour le standard suivant", sound: "Son", muted: "Muet",
        replay: "Revoir", knowledgeCheck: "Vérification des acquis", standardMet: "Standard acquis",
        metSwipe: "Standard acquis — balayez vers le haut", watchGate: "Regardez ce standard en entier pour continuer",
        finishGate: "Terminez chaque standard pour compléter la série", completeTitle: "Série terminée",
        completeLms: "Achèvement signalé au LMS · Score ",
        completePreview: "Mode aperçu — la progression sera signalée depuis le LMS",
        rewatch: "Revoir la série", finish: "Terminer", continueBtn: "Continuer", notedContinue: "Noté — Continuer",
        standard: "Standard", duration: "Durée", beatNote: "Regardez la rediffusion — touchez l’écran au moment clé", spotNote: "Observez l’image, puis touchez le détail", tooEarly: "Trop tôt", tooLate: "Trop tard", oneMoreTry: "un dernier essai", spotMiss: "Pas tout à fait le bon détail", resetProgress: "Réinitialiser ma progression", assessKicker: "Évaluation finale", assessTitle: "La véritable mesure", assessQuestions: "questions", passMark: "Seuil de réussite", triesLeft: "essais restants", modeAllDesc: "Un nouvel essai reprend toute l’évaluation.", modeWrongDesc: "Un nouvel essai ne reprend que les questions manquées.", beginAssess: "Commencer l’évaluation", question: "Question", assessPassed: "Évaluation réussie", assessFailed: "Pas cette fois", tryWord: "Essai", retryAll: "Reprendre toute l’évaluation", retryWrong: "Reprendre les questions manquées", noTries: "Plus d’essais — votre manager vous contactera.", unlimited: "Illimité", preKicker: "Pré-évaluation", preTitle: "Avant de commencer", preDesc: "Aucun seuil — cela mesure simplement votre point de départ. Répondez honnêtement.", preDone: "Niveau de départ enregistré", preNote: "Votre score de départ a été enregistré. Construisons à partir de là."
      },
      reels: [
        {
          dept: "Réception", title: "L'Accueil à l'Arrivée",
          points: ["Saluez chaque client dans les dix secondes suivant son arrivée", "Ouvrez la porte de la main la plus éloignée du client", "Adressez un accueil chaleureux et posé, par le nom s'il est connu"],
          quiz: { q: "Dans quel délai chaque client arrivant doit-il être salué ?", options: ["Cinq secondes", "Dix secondes", "Trente secondes"], why: "Dix secondes — la présence avant le processus." }
        },
        {
          dept: "Restauration", title: "La Grâce à Table",
          points: ["Présentez et servez par la droite du client, étiquette visible", "Remplissez au tiers — jamais plus, jamais pressé", "Retirez-vous silencieusement ; reposez la bouteille, bouchon vers le haut"],
          quiz: { q: "De quel côté présente-t-on et verse-t-on le vin ?", options: ["À gauche du client", "Du côté dégagé", "À droite du client"], why: "Toujours à droite, étiquette face au client." }
        },
        {
          dept: "Étages", title: "Le Couvre-Feu Parfait",
          points: ["Pliez le coin de la couette à quarante-cinq degrés, couture vers l'intérieur", "Placez l'attention du soir au centre de la ligne de l'oreiller", "Réglez l'éclairage sur la scène du soir avant de quitter la chambre"],
          quiz: { q: "À quel angle plie-t-on le coin de la couette ?", options: ["Trente degrés", "Quatre-vingt-dix degrés", "Quarante-cinq degrés"], why: "Quarante-cinq degrés, couture vers l'intérieur — le pli signature." }
        }
      ]
    }
  };

  /* ---------------- flatten / rebuild helpers ---------------- */
  function flatten(obj, prefix, out) {
    prefix = prefix || ""; out = out || [];
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      var p = prefix ? prefix + "." + k : k;
      if (typeof v === "string") out.push({ path: p, text: v });
      else if (Array.isArray(v)) {
        v.forEach(function (item, i) {
          if (typeof item === "string") out.push({ path: p + "." + i, text: item });
          else flatten(item, p + "." + i, out);
        });
      } else flatten(v, p, out);
    });
    return out;
  }

  function setPath(obj, path, val) {
    var keys = path.split(".");
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      var k = /^\d+$/.test(keys[i]) ? +keys[i] : keys[i];
      if (i === keys.length - 1) { cur[k] = val; }
      else {
        if (cur[k] == null) cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
        cur = cur[k];
      }
    }
  }

  /* ---------------- runtime auto-translate ---------------- */
  function translateText(text, tl) {
    var url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t&tl=" +
      encodeURIComponent(tl) + "&q=" + encodeURIComponent(text);
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        return (data[0] || []).map(function (s) { return s[0]; }).join("");
      });
  }

  /* ---------------- course-aware dictionaries ---------------- */

  // English reel text extracted from a course document
  function courseReelsEN(course) {
    return course.reels.map(function (r) {
      return {
        dept  : r.dept,
        title : r.title,
        points: r.points.slice(),
        quiz  : { q: r.quiz.q, options: r.quiz.options.slice(), why: r.quiz.why }
      };
    });
  }

  // Synchronous dict for a language; null means runtime auto-translation is needed
  function resolveDict(code, course) {
    var uiDict = (code === "en" ? EN.ui : (CURATED[code] ? CURATED[code].ui : EN.ui));
    var reelsDict;
    if (!course) {
      if (code === "en") reelsDict = EN.reels;
      else if (CURATED[code]) reelsDict = CURATED[code].reels;
      else return null;
    } else {
      if (code === "en") reelsDict = courseReelsEN(course);
      else if (course.i18n && course.i18n[code]) reelsDict = course.i18n[code];
      else return null;
    }
    var dict = { ui: JSON.parse(JSON.stringify(uiDict)), reels: reelsDict };
    if (course && course.config && course.config.series) dict.ui.series = course.config.series;
    return dict;
  }

  // Source object for auto-translation of a course (or the demo content)
  function translatableSource(course) {
    return course ? { ui: EN.ui, reels: courseReelsEN(course) } : EN;
  }

  function autoTranslate(code, source, cacheKey) {
    source = source || EN;
    cacheKey = cacheKey || ("mo_i18n_" + code);
    try {
      var cached = localStorage.getItem(cacheKey);
      if (cached) return Promise.resolve(JSON.parse(cached));
    } catch (e) {}

    var items = flatten(source);
    var translated = {};
    var chain = Promise.resolve();

    // 6 strings in flight at a time — gentle on the endpoint
    for (var i = 0; i < items.length; i += 6) {
      (function (batch) {
        chain = chain.then(function () {
          return Promise.all(batch.map(function (it) {
            return translateText(it.text, code)
              .then(function (t) { translated[it.path] = t || it.text; })
              .catch(function () { translated[it.path] = it.text; });
          }));
        });
      })(items.slice(i, i + 6));
    }

    return chain.then(function () {
      var dict = JSON.parse(JSON.stringify(source));
      items.forEach(function (it) { setPath(dict, it.path, translated[it.path] || it.text); });
      try { localStorage.setItem(cacheKey, JSON.stringify(dict)); } catch (e) {}
      return dict;
    });
  }

  global.MOI18N = {
    LANGS: LANGS,
    EN: EN,
    getCurated: function (code) {
      if (code === "en") return EN;
      return CURATED[code] || null;
    },
    resolveDict: resolveDict,
    courseReelsEN: courseReelsEN,
    translatableSource: translatableSource,
    isRTL: function (code) {
      var l = LANGS.filter(function (x) { return x.code === code; })[0];
      return !!(l && l.rtl);
    },
    autoTranslate: autoTranslate
  };
})(window);
