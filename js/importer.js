/* Standards in Motion — question bank importer
   Extracts knowledge-check questions (and optional reels) from:
     • Easygenerator / SCORM / xAPI .zip packages  (content/data.js + content/{lang}/*.html blocks)
     • Word .docx files using a simple Q / A) / Correct: / Why: convention
   Usage: MOImporter.parse(file) -> Promise<{ questions:[{q,options,answer,why}], reels:[{title,points}], source:string }>
*/
window.MOImporter = (function () {
  "use strict";

  /* ---------- shared helpers ---------- */

  function pickLang(ml) {
    if (ml == null) return "";
    if (typeof ml === "string") return ml;
    var prefs = ["en", "en-GB", "en-US"];
    for (var i = 0; i < prefs.length; i++) {
      var v = ml[prefs[i]];
      if (v && v !== "-") return v;
    }
    var keys = Object.keys(ml);
    for (var j = 0; j < keys.length; j++) {
      var val = ml[keys[j]];
      if (val && val !== "-") return val;
    }
    return "";
  }

  function stripHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    /* drop pure media embeds (video iframes etc.) — they carry no importable text */
    d.querySelectorAll("iframe, video, audio, script, style").forEach(function (el) { el.remove(); });
    return (d.textContent || "").replace(/ /g, " ").replace(/[ \t]+/g, " ")
      .split("\n").map(function (s) { return s.trim(); }).filter(Boolean).join("\n").trim();
  }

  function stripNumbering(q) {
    return String(q || "").replace(/^\s*(Q\s*\d*\s*[:.)-]|Question\s+\d+\s*[:.)-]|\d+\s*[.)-])\s*/i, "").trim();
  }

  function genericFeedback(t) {
    return !t || /^(that'?s\s+(correct|right)|correct!?|well\s+done|incorrect|wrong|try\s+again|not\s+quite)[.!\s]*$/i.test(t.trim());
  }

  /* ---------- Easygenerator / SCORM zip ---------- */

  function parseZip(file) {
    return JSZip.loadAsync(file).then(function (zip) {
      /* locate the course data file — Easygenerator keeps it at content/data.js as pure JSON */
      var dataPath = null;
      zip.forEach(function (rel) {
        if (!dataPath && /(^|\/)content\/data\.(js|json)$/i.test(rel)) dataPath = rel;
      });
      if (!dataPath) throw new Error("No course data found in this package (expected content/data.js). Is it an Easygenerator export?");
      return zip.file(dataPath).async("string").then(function (raw) {
        var data;
        try {
          data = JSON.parse(raw.replace(/^\s*(var|window\.)[\w$]+\s*=\s*/, "").replace(/;\s*$/, ""));
        } catch (e) {
          throw new Error("Could not read the course data inside this package.");
        }
        return extractFromEG(zip, data);
      });
    });
  }

  function blockText(zip, lang, id) {
    var path = "content/" + lang + "/" + id + ".html";
    var f = zip.file(path);
    if (!f) return Promise.resolve("");
    return f.async("string").then(stripHtml);
  }

  function extractFromEG(zip, data) {
    var sections = (data && data.sections) || [];
    var questions = [];
    var reels = [];
    var jobs = [];

    sections.forEach(function (sec) {
      ((sec && sec.questions) || []).forEach(function (qq) {
        var title = pickLang(qq.title);

        /* knowledge-check style: real answers with isCorrect flags */
        if (qq.answers && qq.answers.length >= 2 &&
            qq.answers.some(function (a) { return a.isCorrect; }) &&
            qq.type !== "informationContent") {
          var opts = qq.answers.map(function (a) { return pickLang(a.text); }).filter(function (t) { return t && t !== "-"; });
          if (opts.length >= 2) {
            var entry = {
              q: stripNumbering(title),
              options: opts,
              answer: Math.max(0, qq.answers.findIndex(function (a) { return !!a.isCorrect; })),
              why: ""
            };
            questions.push(entry);
            /* rationale: correct-feedback block, if it says more than "That's correct!" */
            var fbs = qq.questionCorrectFeedbacks || [];
            if (fbs.length && fbs[0].id) {
              jobs.push(blockText(zip, "en", fbs[0].id).then(function (t) {
                if (t && !genericFeedback(t)) entry.why = t.split("\n")[0].slice(0, 300);
              }));
            }
          }
          return;
        }

        /* information content — candidate reel (title + text bullets) */
        if (title && title !== "-" && (qq.type === "informationContent" || !qq.answers)) {
          var reel = { title: title, points: [] };
          reels.push(reel);
          ((qq.learningContents) || []).forEach(function (lc) {
            if (lc && lc.id) {
              jobs.push(blockText(zip, "en", lc.id).then(function (t) {
                if (t) reel.points.push(t.split("\n").slice(0, 2).join(" ").slice(0, 240));
              }));
            }
          });
        }
      });
    });

    return Promise.all(jobs).then(function () {
      reels.forEach(function (r) { r.points = r.points.filter(Boolean).slice(0, 3); });
      if (!questions.length && !reels.length) {
        throw new Error("No importable questions or content sections found in this package.");
      }
      return { questions: questions, reels: reels, source: "SCORM package" };
    });
  }

  /* ---------- Word .docx ----------
     Two conventions are detected:
     (a) Lettered:                       (b) SOP checklist style:
       Q: What should you do first?        Question 1. How can we search…?
       A) Check the room status            ✓ Open Stay360 or Guest Stay…
       B) Ring immediately                 ○ Ask Bell to identify…
       Correct: A                          Rationale: Step 5 — The booking…
       Why: rationale (optional)
  ------------------------------------- */

  function parseDocx(file) {
    return JSZip.loadAsync(file).then(function (zip) {
      var f = zip.file("word/document.xml");
      if (!f) throw new Error("This doesn't look like a Word (.docx) file.");
      return f.async("string");
    }).then(function (xml) {
      /* paragraphs: one <w:p>…</w:p> per line */
      var paras = [];
      var re = /<w:p\b[\s\S]*?<\/w:p>/g, m;
      while ((m = re.exec(xml))) {
        var texts = [];
        var tre = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g, tm;
        while ((tm = tre.exec(m[0]))) {
          texts.push(tm[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
        }
        var line = texts.join("").trim();
        if (line) paras.push(line);
      }
      return extractFromLines(paras);
    });
  }

  function extractFromLines(paras) {
    var questions = [];
    var cur = null;
    function commit() {
      if (cur && cur.q && cur.options.length >= 2 && cur.answer >= 0) questions.push(cur);
      cur = null;
    }
    paras.forEach(function (line) {
      var m;
      if ((m = line.match(/^(?:Q\s*\d*\s*[:.)]|Question\s+\d+\s*[:.)]|\d+\s*[.)])\s*(.+)$/i))) {
        commit();
        cur = { q: m[1].trim(), options: [], answer: -1, why: "" };
      } else if (cur && (m = line.match(/^([A-E])\s*[.)]\s*(.+)$/))) {
        cur.options.push(m[2].trim());
      } else if (cur && (m = line.match(/^([✓✔])\s*(.+)$/))) {
        /* SOP-style: ✓ marks the correct option, ○ / • mark the rest */
        cur.answer = cur.options.length;
        cur.options.push(m[2].trim());
      } else if (cur && (m = line.match(/^[○◯•·\-–]\s*(.+)$/)) && !/^(?:Why|Rationale|Explanation)\b/i.test(m[1])) {
        cur.options.push(m[1].trim());
      } else if (cur && (m = line.match(/^(?:Correct(?:\s+answer)?|Answer)\s*[:]\s*([A-E])\b/i))) {
        cur.answer = m[1].toUpperCase().charCodeAt(0) - 65;
      } else if (cur && (m = line.match(/^(?:Why|Rationale|Explanation)\s*[:]\s*(.+)$/i))) {
        cur.why = m[1].trim();
      }
    });
    commit();
    if (!questions.length) {
      throw new Error("No questions found. Supported formats:\nQ: question / A) option / B) option / Correct: B\nor\nQuestion 1. question / ✓ correct option / ○ other options / Rationale: …");
    }
    return { questions: questions, reels: [], source: "Word file" };
  }

  /* ---------- entry ---------- */

  function parse(file) {
    var name = (file.name || "").toLowerCase();
    if (/\.docx$/.test(name)) return parseDocx(file);
    if (/\.zip$/.test(name))   return parseZip(file);
    return Promise.reject(new Error("Please pick a .zip (SCORM/xAPI package) or .docx (Word) file."));
  }

  return { parse: parse };
})();
