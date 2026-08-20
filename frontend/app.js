/* Deeplitics v7 — App-Logik. Reines Frontend, KEINE API-Aufrufe, KEIN
   localStorage (Cowork-Artefakt-Vorgabe): Profil/Verlauf/Gespeichert
   leben nur im Speicher dieser Sitzung und setzen sich beim Neuladen
   zurueck (Nutzer wird darauf im Profil-Panel hingewiesen). */
(function () {
  "use strict";

  var STORIES = window.__STORIES__ || [];
  var SOURCE_BIAS = window.__SOURCE_BIAS__ || {};

  var CATEGORIES = {
    security:     { de: "Sicherheit & Militär",     en: "Security & Military" },
    diplomacy:    { de: "Diplomatie",                en: "Diplomacy" },
    trade:        { de: "Handel & Wirtschaft",       en: "Trade & Economy" },
    rights:       { de: "Migration & Bürgerrechte",  en: "Migration & Rights" },
    conflict:     { de: "Konflikt & Krieg",          en: "Conflict & War" },
    surveillance: { de: "Überwachung & Innenpolitik",en: "Surveillance & Domestic" }
  };

  var STR = {
    de: {
      brand: "Deeplitics", allTopics: "Alle Themen", noStories: "Keine Storys für diese Auswahl.",
      readMore: "Weiterlesen", readLess: "Weniger anzeigen", sources: n => n + (n===1 ? " Quelle" : " Quellen"),
      historien: "Historien", uebersicht: "Übersicht", stakeholdersTab: "Stakeholders", maerkte: "Märkte", theorieTab: "Theorie",
      noTheory: "Keine spezifische politikwissenschaftliche Theorie für diese Story identifiziert — bewusst leer statt erfunden.",
      quotes: "Zitate", sourcesHead: "Quellen", primarySources: "Primärquellen",
      cuiBono: "Wer profitiert?", noMarket: "Keine belastbare Marktkorrelation gefunden — dieses Feld bleibt bewusst leer statt eine erfunden zu zeigen.",
      wikipedia: "Wikipedia-Artikel öffnen", keyFigure: "Zentrale Figur dieser Story",
      profile: "Profil", newAvatar: "Neuer Avatar", language: "Sprache", appearance: "Darstellung",
      dark: "Dunkel", light: "Hell", contentPrefs: "Inhaltspräferenzen",
      history: "Leseverlauf", saved: "Gespeichert", sessionNote: "Profil, Verlauf und gespeicherte Storys gelten nur für diese Sitzung und werden beim Neuladen zurückgesetzt.",
      emptyHistory: "Noch nichts gelesen. Öffne eine Story, und sie taucht hier auf.",
      emptySaved: "Noch nichts gespeichert. Tippe auf das Lesezeichen-Symbol einer Story.",
      back: "Zurück", close: "Schließen", save: "Speichern", saved_: "Gespeichert",
      langNote: "Die Story-Inhalte sind aktuell nur auf Deutsch verfügbar.",
      profitsFrom: "Profitiert davon", losesFrom: "Verliert dabei / ist dagegen",
      noProfiteers: "Kein eindeutig benannter Profiteur in dieser Story.",
      noLosers: "Kein eindeutig benannter Verlierer in dieser Story.",
      standLabel: function (d) { return "Stand: " + d; }
    },
    en: {
      brand: "Deeplitics", allTopics: "All topics", noStories: "No stories for this selection.",
      readMore: "Read more", readLess: "Show less", sources: n => n + (n===1 ? " source" : " sources"),
      historien: "Threads", uebersicht: "Overview", stakeholdersTab: "Stakeholders", maerkte: "Markets", theorieTab: "Theory",
      noTheory: "No specific political-science theory identified for this story — deliberately left empty rather than invented.",
      quotes: "Quotes", sourcesHead: "Sources", primarySources: "Primary sources",
      cuiBono: "Who benefits?", noMarket: "No reliable market correlation found — left honestly empty instead of inventing one.",
      wikipedia: "Open Wikipedia article", keyFigure: "Key figure in this story",
      profile: "Profile", newAvatar: "New avatar", language: "Language", appearance: "Appearance",
      dark: "Dark", light: "Light", contentPrefs: "Content preferences",
      history: "Reading history", saved: "Saved", sessionNote: "Profile, history and saved stories only last for this session and reset on reload.",
      emptyHistory: "Nothing read yet. Open a story and it will show up here.",
      emptySaved: "Nothing saved yet. Tap a story's bookmark icon.",
      back: "Back", close: "Close", save: "Save", saved_: "Saved",
      langNote: "Story content is currently only available in German.",
      profitsFrom: "Benefits from this", losesFrom: "Loses out / is against",
      noProfiteers: "No clearly named beneficiary in this story.",
      noLosers: "No clearly named loser in this story.",
      standLabel: function (d) { return "As of: " + d; }
    }
  };

  var state = {
    theme: "dark",
    lang: "de",
    activeCats: new Set(Object.keys(CATEGORIES)),
    history: [],
    saved: new Set(),
    avatarSeed: Math.random(),
    view: "home",
    currentStoryId: null,
    activeTab: 0,
    activeThread: {}
  };

  function t(key) { return STR[state.lang][key]; }
  function catLabel(key) { var c = CATEGORIES[key]; return c ? c[state.lang] : key; }

  /* ---------------- utils ---------------- */
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function linkify(text, story) {
    if (!text) return "";
    var esc = escapeHtml(text);
    return esc.replace(/\[\[([^\]]+)\]\]/g, function (m, name) {
      var ent = findEntity(story, name);
      if (!ent) return escapeHtml(name);
      return '<span class="lk" data-entity="' + escapeHtml(name) + '">' + escapeHtml(name) + "</span>";
    });
  }

  function findEntity(story, name) {
    if (!story || !story.entities) return null;
    for (var i = 0; i < story.entities.length; i++) {
      if (story.entities[i].name === name) return story.entities[i];
    }
    return null;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(state.lang === "de" ? "de-DE" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
    } catch (e) { return iso; }
  }

  /* ---------------- icons ---------------- */
  var ICON = {
    person: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.2" r="3.6" fill="#fff" fill-opacity=".92"/><path d="M4.5 20c.8-4 3.7-6.2 7.5-6.2s6.7 2.2 7.5 6.2" stroke="#fff" stroke-opacity=".92" stroke-width="1.8" stroke-linecap="round"/></svg>',
    organization: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 21V6l7-3 7 3v15" stroke="#fff" stroke-opacity=".92" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 21v-6h6v6M9 10h.01M12 10h.01M15 10h.01M9 13.5h.01M15 13.5h.01" stroke="#fff" stroke-opacity=".92" stroke-width="1.7" stroke-linecap="round"/></svg>',
    country: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3v18" stroke="#fff" stroke-opacity=".92" stroke-width="1.8" stroke-linecap="round"/><path d="M6 4h11l-2.5 3L17 10H6" fill="#fff" fill-opacity=".92"/></svg>',
    concept: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 18h6M10 21h4" stroke="#fff" stroke-opacity=".92" stroke-width="1.7" stroke-linecap="round"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.3V16h6v-.9c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3Z" fill="none" stroke="#fff" stroke-opacity=".92" stroke-width="1.7"/></svg>',
    event: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2v4M12 22c5 0 8-3.6 8-8 0-3.4-2-6-4.5-8.5C14 7 13 8.6 13 10c0-2-1-4-3-6-1 2-4 5-4 9 0 4.4 3 9 6 9Z" fill="#fff" fill-opacity=".9"/></svg>'
  };
  function typeIcon(type) { return ICON[type] || ICON.concept; }

  var TYPE_LABEL = {
    de: { person: "Person", organization: "Organisation", country: "Land", concept: "Konzept", event: "Ereignis" },
    en: { person: "Person", organization: "Organization", country: "Country", concept: "Concept", event: "Event" }
  };
  function typeLabel(type) { return (TYPE_LABEL[state.lang] && TYPE_LABEL[state.lang][type]) || type; }

  function fmtTlDate(raw) {
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      var d = new Date(raw + "T00:00:00");
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(state.lang === "de" ? "de-DE" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
      }
    }
    return raw; // reines Jahr o.ae. unveraendert
  }

  var BOOKMARK_OUT = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var BOOKMARK_IN = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" fill="currentColor"/></svg>';
  var EXTERNAL = '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6h9v9M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  var BACK_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M15 5 8 12l7 7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------------- avatars (random, no upload) ---------------- */
  function seededRand(seed) {
    var x = Math.sin(seed * 999) * 10000;
    return x - Math.floor(x);
  }
  function avatarSVG(seed, size) {
    size = size || 40;
    var hues = [ (seed * 360) % 360, (seed * 360 + 55) % 360 ];
    var c1 = "hsl(" + hues[0].toFixed(0) + " 78% 62%)";
    var c2 = "hsl(" + hues[1].toFixed(0) + " 78% 45%)";
    var rot = Math.floor(seededRand(seed + 1) * 360);
    var blobs = "";
    for (var i = 0; i < 3; i++) {
      var r = 8 + seededRand(seed + i + 2) * 10;
      var cx = 15 + seededRand(seed + i + 5) * 70;
      var cy = 15 + seededRand(seed + i + 9) * 70;
      blobs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff" fill-opacity="' + (0.10 + i*0.05) + '"/>';
    }
    return '<svg viewBox="0 0 100 100" width="'+size+'" height="'+size+'" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="g' + Math.round(seed*1e6) + '" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(' + rot + ' .5 .5)">' +
      '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="100" height="100" fill="url(#g' + Math.round(seed*1e6) + ')"/>' + blobs + '</svg>';
  }

  /* ---------------- media (image + graceful fallback) ---------------- */
  function fallbackGradientVars(catKey) {
    var c = "var(--cat-" + (catKey || "diplomacy") + ")";
    return 'style="--cat-c1:' + c + '; --cat-c2: color-mix(in srgb, ' + c + ' 55%, #000 30%);"';
  }
  function mediaTag(url, opts) {
    opts = opts || {};
    var iconType = opts.iconType || "concept";
    var catKey = opts.catKey || "diplomacy";
    var cls = opts.cls || "";
    var alt = escapeHtml(opts.alt || "");
    var img = url ? '<img src="' + escapeHtml(url) + '" alt="' + alt + '" onerror="this.style.display=\'none\'">' : "";
    return '<div class="media ' + cls + '" ' + fallbackGradientVars(catKey) + '>' +
      '<span class="fallback">' + typeIcon(iconType) + '</span>' + img + '</div>';
  }

  /* ---------------- greeting ---------------- */
  var GREETINGS = {
    de: {
      night:   ["Nachteule? Wir auch.", "Um diese Zeit liest man Krimis oder Weltpolitik. Willkommen bei Letzterem.", "Die Welt schläft nie — du offenbar auch nicht.", "Ruhige Stunden, unruhige Weltlage."],
      early:   ["Schon wach? Hier ist, was die Nacht über passiert ist.", "Kaffee eingeschenkt? Gut, dann legen wir los.", "Der Tag ist noch jung, die Nachrichtenlage nicht.", "Früher Vogel, frühe Einordnung."],
      morning: ["Guten Morgen — hier ist dein Überblick.", "Ausgeschlafen? Die Politik war es nicht.", "Ein neuer Tag, die alten Konflikte.", "Auf geht's, die Welt hat sich weitergedreht."],
      noon:    ["Mittagspause? Perfekt für etwas Weltgeschehen.", "Die Hälfte des Tages ist geschafft — hier der Zwischenstand.", "Zeit für eine Prise Politik zum Mittagessen."],
      after:   ["Der Nachmittag ist da, die Schlagzeilen auch.", "Zwischen Terminen: ein Blick auf das große Ganze.", "Tief durchatmen und eintauchen."],
      evening: ["Feierabend. Zeit zu verstehen, was heute wirklich passiert ist.", "Der Tag neigt sich, die Analyse beginnt.", "Jetzt wird's ruhiger — genug Zeit für die tieferen Zusammenhänge."],
      late:    ["Der Abend gehört dir — und ein bisschen der Weltpolitik.", "Bevor der Tag endet: ein Blick hinter die Kulissen.", "Noch wach? Die Diplomatie ist es auch."]
    },
    en: {
      night:   ["Night owl? Same here.", "At this hour it's either crime novels or world politics. Welcome to the latter.", "The world never sleeps — clearly, neither do you."],
      early:   ["Already up? Here's what happened overnight.", "Coffee poured? Good, let's get into it.", "The day is young, the news cycle isn't."],
      morning: ["Good morning — here's your overview.", "Well rested? Politics wasn't.", "A new day, the same old conflicts."],
      noon:    ["Lunch break? Perfect timing for some world affairs.", "Halfway through the day — here's where things stand."],
      after:   ["The afternoon is here, so are the headlines.", "Between meetings: a look at the bigger picture."],
      evening: ["Day's done. Time to understand what actually happened today.", "The day winds down, the analysis begins."],
      late:    ["The evening is yours — and a little bit of world politics too.", "Before the day ends: a look behind the scenes."]
    }
  };
  function greetingBucket(hour) {
    if (hour >= 23 || hour < 5) return "night";
    if (hour < 8) return "early";
    if (hour < 11) return "morning";
    if (hour < 14) return "noon";
    if (hour < 17) return "after";
    if (hour < 20) return "evening";
    return "late";
  }
  function pickGreeting() {
    var now = new Date();
    var bucket = greetingBucket(now.getHours());
    var pool = GREETINGS[state.lang][bucket];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------------- rendering: home ---------------- */
  function storyCounts() {
    return STORIES.filter(function (s) { return state.activeCats.has(s.theme_category); }).length;
  }

  function renderPrefRow() {
    var el = document.getElementById("prefRow");
    var html = "";
    Object.keys(CATEGORIES).forEach(function (key) {
      var active = state.activeCats.has(key);
      html += '<button class="pref-chip' + (active ? " active" : "") + '" data-cat="' + key + '" style="' +
        (active ? "background:var(--cat-" + key + ")" : "") + '">' + escapeHtml(catLabel(key)) + "</button>";
    });
    el.innerHTML = html;
    el.querySelectorAll(".pref-chip").forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute("data-cat");
        if (state.activeCats.has(key)) { if (state.activeCats.size > 1) state.activeCats.delete(key); }
        else state.activeCats.add(key);
        renderHome();
      };
    });
  }

  function renderGreeting() {
    document.getElementById("greetEyebrow").textContent = new Date().toLocaleDateString(
      state.lang === "de" ? "de-DE" : "en-US", { weekday: "long", day: "numeric", month: "long" }
    );
    document.getElementById("greetTitle").textContent = pickGreeting();
    var n = storyCounts();
    document.getElementById("greetSub").textContent = state.lang === "de"
      ? n + " Storys aufbereitet, mit Historie, Akteuren und ehrlicher Markteinordnung."
      : n + " stories broken down, with history, stakeholders and honest market context.";
  }

  function cardHtml(story) {
    var img = mediaTag(story.image_url, { iconType: "event", catKey: story.theme_category, cls: "card-media", alt: story.title });
    var isSaved = state.saved.has(story.id);
    var nSources = (story.article_urls || story.sources || []).length;
    return '<div class="card" data-id="' + story.id + '" style="--cat-color: var(--cat-' + story.theme_category + ')">' +
      '<div style="position:relative">' + img +
        '<span class="cat-chip">' + escapeHtml(catLabel(story.theme_category)) + '</span>' +
        '<button class="save-btn' + (isSaved ? " saved" : "") + '" data-save="' + story.id + '">' + (isSaved ? BOOKMARK_IN : BOOKMARK_OUT) + '</button>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-title">' + escapeHtml(story.title) + '</h3>' +
        '<p class="card-dek">' + escapeHtml(stripLinks(story.one_line)) + '</p>' +
        '<div class="card-meta"><span>' + t("sources")(nSources) + '</span></div>' +
      '</div></div>';
  }
  function stripLinks(text) { return (text || "").replace(/\[\[([^\]]+)\]\]/g, "$1"); }

  function renderHome() {
    document.getElementById("brandLabel").textContent = t("brand");
    renderGreeting();
    renderPrefRow();
    var grid = document.getElementById("storyGrid");
    var visible = STORIES.filter(function (s) { return state.activeCats.has(s.theme_category); });
    if (!visible.length) {
      grid.innerHTML = '<div class="empty-state">' + t("noStories") + "</div>";
    } else {
      grid.innerHTML = visible.map(cardHtml).join("");
    }
    grid.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-save]")) return;
        openDetail(card.getAttribute("data-id"));
      });
    });
    grid.querySelectorAll("[data-save]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleSave(btn.getAttribute("data-save"));
      });
    });
  }

  function toggleSave(id) {
    if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
    if (state.view === "home") renderHome();
    if (state.view === "saved") renderSavedView();
    var overlayBtn = document.querySelector("#detailOverlay [data-save-detail]");
    if (overlayBtn) {
      var saved = state.saved.has(id);
      overlayBtn.classList.toggle("saved", saved);
      overlayBtn.innerHTML = (saved ? BOOKMARK_IN : BOOKMARK_OUT);
    }
  }

  /* ---------------- detail view ---------------- */
  function getStory(id) { return STORIES.find(function (s) { return s.id === id; }); }

  function openDetail(id) {
    var story = getStory(id);
    if (!story) return;
    if (state.history.indexOf(id) === -1) state.history.unshift(id); else { state.history.splice(state.history.indexOf(id),1); state.history.unshift(id); }
    state.currentStoryId = id;
    state.activeTab = 0;
    document.getElementById("detailOverlay").innerHTML = detailHtml(story);
    document.getElementById("detailOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
    wireDetail(story);
    document.getElementById("detailOverlay").scrollTop = 0;
  }
  function closeDetail() {
    document.getElementById("detailOverlay").classList.remove("open");
    document.body.style.overflow = "";
  }

  var DEFAULT_TAB = 1; /* Übersicht ist der Startpunkt: links Historien, rechts Stakeholders/Märkte */

  function detailHtml(story) {
    var cat = story.theme_category;
    var hero = mediaTag(story.image_url, { iconType: "event", catKey: cat, cls: "detail-hero", alt: story.title });
    var isSaved = state.saved.has(story.id);
    return '<div style="--cat-color: var(--cat-' + cat + ')">' +
      '<div class="overlay-topbar">' +
        '<button class="pill-btn" id="btnBack">' + BACK_ICON + t("back") + '</button>' +
        '<button class="icon-btn' + (isSaved ? " saved" : "") + '" data-save-detail>' + (isSaved ? BOOKMARK_IN : BOOKMARK_OUT) + '</button>' +
      '</div>' +
      '<div style="position:relative">' + hero + '</div>' +
      '<div class="detail-content">' +
        '<div class="detail-eyebrow"><span class="detail-cat-chip">' + escapeHtml(catLabel(cat)) + '</span>' +
          '<span>' + t("sources")((story.article_urls||story.sources||[]).length) + '</span></div>' +
        '<h1 class="detail-title">' + escapeHtml(story.title) + '</h1>' +
        '<p class="detail-dek">' + linkify(story.one_line, story) + '</p>' +
        tabbarHtml() +
        '<div class="tab-viewport"><div class="tab-track" id="tabTrack">' +
          '<div class="tab-pane">' + threadsHtml(story) + '</div>' +
          '<div class="tab-pane">' + overviewHtml(story) + '</div>' +
          '<div class="tab-pane">' + stakeholdersHtml(story) + '</div>' +
          '<div class="tab-pane">' + marketHtml(story) + '</div>' +
          '<div class="tab-pane">' + theoryPaneHtml(story) + '</div>' +
        '</div></div>' +
        quotesAndSourcesHtml(story) +
      '</div>' +
    '</div>';
  }

  function tabbarHtml() {
    var tabs = [t("historien"), t("uebersicht"), t("stakeholdersTab"), t("maerkte"), t("theorieTab")];
    return '<div class="tabbar" id="detailTabbar">' + tabs.map(function (label, i) {
      return '<button class="tab-btn' + (i===DEFAULT_TAB?" active":"") + '" data-tab="' + i + '">' + escapeHtml(label) + "</button>";
    }).join("") + "</div>";
  }

  function overviewHtml(story) {
    return '<ul class="summary-list">' + (story.summary||[]).map(function(b){ return "<li><span class=\"li-text\">" + linkify(b, story) + "</span></li>"; }).join("") + '</ul>' +
      (story.deep_dive ? (
        '<div class="readmore-toggle"><button class="pill-btn" id="btnReadMore">' + t("readMore") + '</button></div>' +
        '<div class="readmore-box" id="readMoreBox"><div><div class="deep-dive">' + linkify(story.deep_dive, story) + '</div></div></div>'
      ) : '');
  }

  function threadsHtml(story) {
    var threads = story.historical_threads || [];
    if (!threads.length) return '<div class="market-empty">—</div>';
    var activeIdx = state.activeThread[story.id] || 0;
    var tabs = threads.map(function (th, i) {
      return '<button class="thread-tab' + (i===activeIdx?" active":"") + '" data-thread="' + i + '">' + escapeHtml(th.label || th.title || ("Linie " + (i+1))) + "</button>";
    }).join("");
    var entries = threads[activeIdx].entries || [];
    var timeline = '<div class="timeline">' + entries.map(function (en, i) {
      return '<div class="tl-item" data-tl="' + i + '"><span class="tl-dot"></span>' +
        (en.date || en.year ? '<div class="tl-year">' + escapeHtml(fmtTlDate(en.date || en.year)) + '</div>' : '') +
        '<div class="tl-one">' + escapeHtml(en.one_line || "") + (en.extended ? '<span class="tl-toggle-hint">+</span>' : '') + '</div>' +
        (en.extended ? '<div class="tl-ext">' + escapeHtml(en.extended) + '</div>' : '') +
      '</div>';
    }).join("") + '</div>';
    return (threads.length > 1 ? '<div class="thread-tabs">' + tabs + '</div>' : '') + timeline;
  }

  var CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var MINUS_ICON = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8 12h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function stakeCardHtml(item, side, story) {
    var ent = findEntity(story, item.entity);
    var img = mediaTag(ent && ent.image_url, { iconType: ent ? ent.type : "concept", catKey: story.theme_category, cls: "stake-avatar", alt: item.entity });
    return '<button class="stake-card ' + side + '" data-entity-open="' + escapeHtml(item.entity) + '">' + img +
      '<div class="stake-body"><div class="stake-name">' + escapeHtml(item.entity) + '</div>' +
      '<div class="stake-reason">' + escapeHtml(item.reason || "") + '</div></div></button>';
  }

  function stakeholdersHtml(story) {
    var sh = story.stakeholders;
    if (!sh || (!(sh.pro||[]).length && !(sh.con||[]).length)) return '<div class="market-empty">—</div>';
    var pro = sh.pro || [], con = sh.con || [];
    var html = '<div class="stake-section"><div class="stake-heading pro">' + CHECK_ICON + t("profitsFrom") + '</div>' +
      '<div class="stake-list">' + (pro.length ? pro.map(function (it) { return stakeCardHtml(it, "pro", story); }).join("") : '<div class="stake-empty">' + t("noProfiteers") + '</div>') + '</div></div>' +
      '<div class="stake-section"><div class="stake-heading con">' + MINUS_ICON + t("losesFrom") + '</div>' +
      '<div class="stake-list">' + (con.length ? con.map(function (it) { return stakeCardHtml(it, "con", story); }).join("") : '<div class="stake-empty">' + t("noLosers") + '</div>') + '</div></div>' +
      (sh.note ? '<div class="stake-note">' + escapeHtml(sh.note) + '</div>' : '');
    return html;
  }

  function entitiesHtml(story) {
    var ents = story.entities || [];
    if (!ents.length) return '<div class="market-empty">—</div>';
    return '<div class="entity-grid">' + ents.map(function (e) {
      var img = mediaTag(e.image_url, { iconType: e.type, catKey: story.theme_category, cls: "entity-avatar", alt: e.name });
      return '<div class="entity-chip" data-entity-open="' + escapeHtml(e.name) + '">' + img +
        '<div class="entity-name">' + escapeHtml(e.name) + '</div>' +
        '<div class="entity-role">' + escapeHtml(e.role_in_story || "") + '</div></div>';
    }).join("") + '</div>';
  }

  function marketHtml(story) {
    var mc = story.market_correlation;
    if (!mc || !mc.has_correlation || !mc.series || !mc.series.length) {
      return '<div class="market-empty">' + t("noMarket") + (mc && mc.explanation ? '<div style="margin-top:10px;font-size:13.5px;">' + escapeHtml(mc.explanation) + '</div>' : '') + '</div>';
    }
    var legend = mc.series.length > 1 ? '<div class="legend-row">' + mc.series.map(function (s, i) {
      return '<div class="legend-item"><span class="legend-swatch" style="background:' + (i === 0 ? "var(--cat-color)" : "var(--ink-muted)") + '"></span>' + escapeHtml(s.label) + '</div>';
    }).join("") + '</div>' : '';
    return '<div class="chart-card">' +
      (mc.explanation ? '<div class="chart-sub">' + escapeHtml(mc.explanation) + '</div>' : '') +
      legend +
      '<div style="position:relative"><svg id="mcChart" viewBox="0 0 640 240" width="100%" height="240" style="overflow:visible"></svg>' +
      '<div class="tooltip" id="mcTooltip"></div></div>' +
      (mc.note ? '<div class="chart-note">' + escapeHtml(mc.note) + '</div>' : '') +
    '</div>';
  }

  var BIAS_CLASS = { left: "bias-left", "center-left": "bias-center-left", center: "bias-center", "center-right": "bias-center-right", right: "bias-right" };

  var DOMAIN_LABELS = {
    "npr.org": "NPR", "aljazeera.com": "Al Jazeera", "cbsnews.com": "CBS News",
    "reuters.com": "Reuters", "apnews.com": "AP News", "bbc.co.uk": "BBC", "bbci.co.uk": "BBC",
    "nbcnews.com": "NBC News", "foxnews.com": "Fox News", "cnn.com": "CNN",
    "washingtonpost.com": "Washington Post", "nytimes.com": "NYT", "wsj.com": "WSJ",
    "theguardian.com": "The Guardian", "politico.com": "Politico", "axios.com": "Axios",
    "thehill.com": "The Hill", "dw.com": "DW", "france24.com": "France24",
    "themoscowtimes.com": "Moscow Times", "irishtimes.com": "Irish Times",
    "timesofisrael.com": "Times of Israel", "csis.org": "CSIS",
    "defensenews.com": "Defense News", "aei.org": "AEI", "usnews.com": "US News",
    "fortune.com": "Fortune", "pbs.org": "PBS", "senate.gov": "US-Senat",
    "congress.gov": "Congress.gov", "state.gov": "US State Dept.",
    "whitehouse.gov": "White House", "hrw.org": "Human Rights Watch"
  };
  function hostLabel(url) {
    try {
      var h = new URL(url).hostname.replace(/^www\./, "");
      for (var domain in DOMAIN_LABELS) { if (h === domain || h.indexOf("." + domain) === h.length - domain.length - 1) return DOMAIN_LABELS[domain]; }
      var base = h.split(".").slice(0, -1).join(".") || h;
      base = base.split(".")[0];
      return base.charAt(0).toUpperCase() + base.slice(1);
    } catch (e) { return "Quelle"; }
  }
  function biasForLabel(label) {
    var keys = Object.keys(SOURCE_BIAS);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase().indexOf(label.toLowerCase()) === 0) return SOURCE_BIAS[keys[i]];
    }
    return null;
  }

  function quotesAndSourcesHtml(story) {
    var quotes = story.quotes || [];
    var urls = story.article_urls || [];
    var primary = story.primary_sources || [];
    var html = "";
    if (quotes.length) {
      html += '<h2 class="section-heading">' + t("quotes") + '</h2>';
      quotes.forEach(function (q) {
        html += '<div class="quote-card"><p class="quote-text">“' + escapeHtml(q.text) + '”</p><div class="quote-attr">' + escapeHtml(q.attribution || "") + (q.context ? " · " + escapeHtml(q.context) : "") + '</div></div>';
      });
    }
    if (urls.length) {
      html += '<h2 class="section-heading">' + t("sourcesHead") + '</h2><div class="source-row">';
      urls.forEach(function (url) {
        var label = hostLabel(url);
        var bias = biasForLabel(label);
        var biasCls = BIAS_CLASS[bias] || "bias-unknown";
        html += '<button class="source-btn" data-open="' + escapeHtml(url || "") + '"><span class="bias-dot ' + biasCls + '"></span>' + escapeHtml(label) + EXTERNAL + '</button>';
      });
      html += '</div>';
    }
    if (primary.length) {
      html += '<h2 class="section-heading">' + t("primarySources") + '</h2>';
      primary.forEach(function (p) {
        html += '<div class="primary-source-card"><div class="primary-source-title">' + escapeHtml(p.title || "") + '</div>' +
          (p.note ? '<div class="primary-source-desc">' + escapeHtml(p.note) + '</div>' : '') +
          '<button class="source-btn" data-open="' + escapeHtml(p.url || "") + '">' + escapeHtml(p.issuer || "Dokument öffnen") + EXTERNAL + '</button></div>';
      });
    }
    return html;
  }

  function theoryPaneHtml(story) {
    var theory = story.political_theory;
    if (!theory || !theory.theory) return '<div class="market-empty">' + t("noTheory") + '</div>';
    var points = theory.points || [];
    var lead = points.length ? points[0] : "";
    var rest = points.slice(1);
    return '<div class="theory-concept">' + linkify(theory.theory, story) + '</div>' +
      (lead ? '<p class="theory-lead">' + linkify(lead, story) + '</p>' : '') +
      (rest.length ? (
        '<div class="readmore-toggle"><button class="pill-btn" id="btnTheoryMore">' + t("readMore") + '</button></div>' +
        '<div class="readmore-box" id="theoryReadMoreBox"><div><ul class="theory-points">' +
          rest.map(function (p) { return "<li>" + linkify(p, story) + "</li>"; }).join("") +
        '</ul></div></div>'
      ) : '');
  }

  function wireDetail(story) {
    document.getElementById("btnBack").onclick = closeDetail;
    var saveBtn = document.querySelector("[data-save-detail]");
    if (saveBtn) saveBtn.onclick = function () { toggleSave(story.id); };

    document.querySelectorAll("#detailTabbar .tab-btn").forEach(function (btn) {
      btn.onclick = function () { setActiveTab(parseInt(btn.getAttribute("data-tab"), 10)); };
    });
    setActiveTab(DEFAULT_TAB, true);

    wireThreadTabs(story);
    wireTimelineToggle();

    var readMoreBtn = document.getElementById("btnReadMore");
    if (readMoreBtn) {
      readMoreBtn.onclick = function () {
        var box = document.getElementById("readMoreBox");
        var open = box.classList.toggle("open");
        readMoreBtn.textContent = open ? t("readLess") : t("readMore");
      };
    }
    var theoryMoreBtn = document.getElementById("btnTheoryMore");
    if (theoryMoreBtn) {
      theoryMoreBtn.onclick = function () {
        var box = document.getElementById("theoryReadMoreBox");
        var open = box.classList.toggle("open");
        theoryMoreBtn.textContent = open ? t("readLess") : t("readMore");
      };
    }

    document.querySelectorAll("[data-entity-open]").forEach(function (chip) {
      chip.onclick = function () {
        var ent = findEntity(story, chip.getAttribute("data-entity-open"));
        if (ent) openEntityModal(ent, story);
      };
    });
    document.querySelectorAll(".lk").forEach(function (span) {
      span.onclick = function () {
        var ent = findEntity(story, span.getAttribute("data-entity"));
        if (ent) openEntityModal(ent, story);
      };
    });
    document.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.onclick = function () {
        var url = btn.getAttribute("data-open");
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      };
    });
    drawMarketChart(story);
    wireSwipe(document.getElementById("tabTrack"));
  }

  var TAB_COUNT = 5;
  function setActiveTab(i, silent) {
    state.activeTab = i;
    document.querySelectorAll("#detailTabbar .tab-btn").forEach(function (b, idx) {
      b.classList.toggle("active", idx === i);
    });
    var track = document.getElementById("tabTrack");
    if (track) track.style.transform = "translateX(-" + (i * (100 / TAB_COUNT)) + "%)";
  }

  function wireSwipe(track) {
    if (!track) return;
    var startX = null;
    track.parentElement.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    track.parentElement.addEventListener("touchend", function (e) {
      if (startX == null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) {
        var next = state.activeTab + (dx < 0 ? 1 : -1);
        next = Math.max(0, Math.min(TAB_COUNT - 1, next));
        setActiveTab(next);
      }
      startX = null;
    }, { passive: true });
  }

  function wireThreadTabs(story) {
    document.querySelectorAll(".thread-tab").forEach(function (btn) {
      btn.onclick = function () {
        state.activeThread[story.id] = parseInt(btn.getAttribute("data-thread"), 10);
        var pane = document.querySelectorAll(".tab-pane")[0];
        pane.innerHTML = threadsHtml(story);
        wireThreadTabs(story);
        wireTimelineToggle();
      };
    });
  }
  function wireTimelineToggle() {
    document.querySelectorAll(".tl-item").forEach(function (item) {
      item.querySelector(".tl-one").onclick = function () { item.classList.toggle("expanded"); };
    });
  }

  /* ---------------- entity modal ---------------- */
  function openEntityModal(ent, story) {
    var cat = story.theme_category;
    var heroUrl = ent.context_image_url || ent.image_url;
    var hero = mediaTag(heroUrl, { iconType: ent.type, catKey: cat, cls: "entity-modal-hero", alt: ent.name });
    var isKey = (ent.profile || "").length > 300;
    var html = '<div style="--cat-color: var(--cat-' + cat + ')">' +
      '<div style="position:relative">' + hero +
        '<button class="icon-btn entity-modal-close" id="btnEntityClose" style="background:rgba(0,0,0,.4);color:#fff;border-color:transparent">' + CLOSE_ICON + '</button>' +
      '</div>' +
      '<div class="entity-modal-body">' +
        '<div class="entity-modal-type">' + escapeHtml(typeLabel(ent.type)) + (isKey ? ' · ' + t("keyFigure") : '') + '</div>' +
        '<h2 class="entity-modal-name">' + escapeHtml(ent.name) + '</h2>' +
        (ent.role_in_story ? '<p class="entity-modal-role">' + escapeHtml(ent.role_in_story) + '</p>' : '') +
        '<p class="entity-modal-bio">' + escapeHtml(ent.profile || "") + '</p>' +
        (ent.wikipedia_url ? '<button class="pill-btn" id="btnEntityWiki">' + t("wikipedia") + EXTERNAL + '</button>' : '') +
      '</div></div>';
    document.getElementById("entityModal").innerHTML = html;
    document.getElementById("entityModal").classList.add("open");
    document.getElementById("entityScrim").classList.add("open");
    document.getElementById("btnEntityClose").onclick = closeEntityModal;
    document.getElementById("entityScrim").onclick = closeEntityModal;
    var wikiBtn = document.getElementById("btnEntityWiki");
    if (wikiBtn) wikiBtn.onclick = function () { window.open(ent.wikipedia_url, "_blank", "noopener,noreferrer"); };
  }
  function closeEntityModal() {
    document.getElementById("entityModal").classList.remove("open");
    document.getElementById("entityScrim").classList.remove("open");
  }

  /* ---------------- market chart (dataviz: single hue, index=100, crosshair+tooltip) ---------------- */
  function drawMarketChart(story) {
    var mc = story.market_correlation;
    var svg = document.getElementById("mcChart");
    if (!svg || !mc || !mc.series || !mc.series.length) return;
    var allSeries = mc.series;
    var maxLen = Math.max.apply(null, allSeries.map(function (s) { return (s.points || []).length; }));
    if (!maxLen) return;
    var W = 640, H = 240, padL = 40, padR = 10, padT = 16, padB = 28;
    var allVals = [];
    allSeries.forEach(function (s) { (s.points || []).forEach(function (p) { allVals.push(p.value); }); });
    var yMin = Math.min.apply(null, allVals), yMax = Math.max.apply(null, allVals);
    var pad = (yMax - yMin) * 0.15 || 2;
    yMin -= pad; yMax += pad;
    function X(i, n) { return padL + (i / (n - 1 || 1)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - padT - padB); }
    var accent = getComputedStyle(document.documentElement).getPropertyValue("--cat-" + story.theme_category).trim() || "#0a84ff";
    var muted = getComputedStyle(document.documentElement).getPropertyValue("--ink-muted").trim() || "#7b7b83";

    var gridLines = "";
    for (var g = 0; g <= 2; g++) {
      var yy = padT + (g / 2) * (H - padT - padB);
      gridLines += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W-padR) + '" y2="' + yy + '" stroke="var(--border)" stroke-width="1"/>';
      var val = yMax - (g / 2) * (yMax - yMin);
      gridLines += '<text x="4" y="' + (yy+4) + '" font-size="11" fill="var(--ink-muted)">' + val.toFixed(0) + '</text>';
    }
    var baseline = (yMin < 100 && yMax > 100) ? '<line x1="'+padL+'" y1="'+Y(100).toFixed(1)+'" x2="'+(W-padR)+'" y2="'+Y(100).toFixed(1)+'" stroke="var(--ink-muted)" stroke-dasharray="3 3" stroke-width="1"/>' : "";

    var body = gridLines + baseline;
    var allDots = [];
    allSeries.forEach(function (series, si) {
      var pts = series.points || [];
      if (!pts.length) return;
      var color = si === 0 ? accent : muted;
      var dash = si === 0 ? "" : ' stroke-dasharray="5 4"';
      var path = pts.map(function (p, i) { return (i === 0 ? "M" : "L") + X(i, pts.length).toFixed(1) + "," + Y(p.value).toFixed(1); }).join(" ");
      body += '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2.5"' + dash + '/>';
      pts.forEach(function (p, i) {
        allDots.push({ x: X(i, pts.length), y: Y(p.value), color: color, date: p.date, label: series.label, value: p.value });
      });
    });
    body += allDots.map(function (d, idx) {
      return '<circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="3.5" fill="var(--bg-elevated)" stroke="' + d.color + '" stroke-width="2" data-idx="' + idx + '"/>';
    }).join("");
    svg.innerHTML = body;

    var tooltip = document.getElementById("mcTooltip");
    svg.querySelectorAll("circle").forEach(function (c) {
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", function () {
        var d = allDots[parseInt(c.getAttribute("data-idx"), 10)];
        tooltip.textContent = (d.date || "") + " · " + (d.label || "") + ": " + d.value.toFixed(1);
        var rect = svg.getBoundingClientRect();
        var cx = (d.x / W) * rect.width;
        var cy = (d.y / H) * rect.height;
        tooltip.style.left = cx + "px";
        tooltip.style.top = (cy - 40) + "px";
        tooltip.classList.add("show");
      });
      c.addEventListener("mouseleave", function () { tooltip.classList.remove("show"); });
    });
  }

  /* ---------------- profile panel ---------------- */
  function renderProfilePanel() {
    var panel = document.getElementById("profilePanel");
    var html = '<div class="profile-head"><div class="profile-avatar-lg">' + avatarSVG(state.avatarSeed, 48) + '</div>' +
      '<div><div class="profile-name">' + t("profile") + '</div><button class="profile-shuffle" id="btnShuffleAvatar">' + t("newAvatar") + '</button></div></div>' +
      '<div class="profile-section"><div class="profile-label">' + t("language") + '</div>' +
      '<div class="seg-control"><button class="seg-btn' + (state.lang==="de"?" active":"") + '" data-lang="de">Deutsch</button>' +
      '<button class="seg-btn' + (state.lang==="en"?" active":"") + '" data-lang="en">English</button></div>' +
      (state.lang === "en" ? '<div style="font-size:11.5px;color:var(--ink-muted);margin-top:8px;">' + t("langNote") + '</div>' : '') + '</div>' +
      '<div class="profile-section"><div class="profile-label">' + t("appearance") + '</div>' +
      '<div class="seg-control"><button class="seg-btn' + (state.theme==="dark"?" active":"") + '" data-theme="dark">' + t("dark") + '</button>' +
      '<button class="seg-btn' + (state.theme==="light"?" active":"") + '" data-theme="light">' + t("light") + '</button></div></div>' +
      '<div class="profile-section"><div class="profile-label">' + t("contentPrefs") + '</div>' +
      Object.keys(CATEGORIES).map(function (key) {
        return '<label class="check-row"><input type="checkbox" data-catcheck="' + key + '"' + (state.activeCats.has(key) ? " checked" : "") + '>' + escapeHtml(catLabel(key)) + '</label>';
      }).join("") + '</div>' +
      '<div class="profile-section">' +
        '<button class="menu-link" id="btnGoHistory"><span>' + t("history") + ' (' + state.history.length + ')</span><span class="chev">›</span></button>' +
        '<button class="menu-link" id="btnGoSaved"><span>' + t("saved") + ' (' + state.saved.size + ')</span><span class="chev">›</span></button>' +
      '</div>' +
      '<div class="session-note">' + t("sessionNote") + '</div>';
    panel.innerHTML = html;

    document.getElementById("btnShuffleAvatar").onclick = function () { state.avatarSeed = Math.random(); updateAvatarButtons(); renderProfilePanel(); };
    panel.querySelectorAll("[data-lang]").forEach(function (b) { b.onclick = function () { state.lang = b.getAttribute("data-lang"); fullRerender(); }; });
    panel.querySelectorAll("[data-theme]").forEach(function (b) { b.onclick = function () { setTheme(b.getAttribute("data-theme")); renderProfilePanel(); }; });
    panel.querySelectorAll("[data-catcheck]").forEach(function (cb) {
      cb.onchange = function () {
        var key = cb.getAttribute("data-catcheck");
        if (cb.checked) {
          state.activeCats.add(key);
        } else if (state.activeCats.size > 1) {
          state.activeCats.delete(key);
        } else {
          cb.checked = true; // mindestens eine Kategorie muss aktiv bleiben
        }
        if (state.view === "home") renderHome();
      };
    });
    document.getElementById("btnGoHistory").onclick = function () { closeProfile(); openList("history"); };
    document.getElementById("btnGoSaved").onclick = function () { closeProfile(); openList("saved"); };
  }

  function updateAvatarButtons() {
    document.getElementById("btnProfile").innerHTML = avatarSVG(state.avatarSeed, 36);
  }

  function setTheme(mode) {
    state.theme = mode;
    document.documentElement.setAttribute("data-theme", mode);
  }

  var profileOpen = false;
  function toggleProfile() {
    profileOpen = !profileOpen;
    document.getElementById("profilePanel").classList.toggle("open", profileOpen);
    document.getElementById("profileScrim").classList.toggle("open", profileOpen);
    if (profileOpen) renderProfilePanel();
  }
  function closeProfile() {
    profileOpen = false;
    document.getElementById("profilePanel").classList.remove("open");
    document.getElementById("profileScrim").classList.remove("open");
  }

  /* ---------------- history / saved list views ---------------- */
  function openList(kind) {
    state.view = kind;
    document.getElementById("homeView").style.display = "none";
    document.getElementById("listView").style.display = "";
    document.getElementById("listTitle").textContent = kind === "history" ? t("history") : t("saved");
    var ids = kind === "history" ? state.history : Array.from(state.saved);
    var body = document.getElementById("listBody");
    if (!ids.length) {
      body.innerHTML = '<div class="empty-state">' + (kind === "history" ? t("emptyHistory") : t("emptySaved")) + "</div>";
      return;
    }
    body.innerHTML = ids.map(function (id) {
      var s = getStory(id);
      if (!s) return "";
      var thumb = mediaTag(s.image_url, { iconType: "event", catKey: s.theme_category, cls: "list-thumb", alt: s.title });
      return '<div class="list-row" data-id="' + id + '">' + thumb +
        '<div><div class="card-title-sm">' + escapeHtml(s.title) + '</div><div class="list-meta">' + escapeHtml(catLabel(s.theme_category)) + '</div></div></div>';
    }).join("");
    body.querySelectorAll(".list-row").forEach(function (row) {
      row.onclick = function () { openDetail(row.getAttribute("data-id")); };
    });
  }
  function goHome() {
    state.view = "home";
    document.getElementById("homeView").style.display = "";
    document.getElementById("listView").style.display = "none";
    closeDetail();
  }

  function fullRerender() {
    updateAvatarButtons();
    renderLastUpdated();
    if (state.view === "home") renderHome();
    else if (state.view === "history" || state.view === "saved") openList(state.view);
    if (document.getElementById("profilePanel").classList.contains("open")) renderProfilePanel();
  }

  /* ---------------- init ---------------- */
  function renderLastUpdated() {
    var el = document.getElementById("lastUpdated");
    if (!el) return;
    var iso = window.__BUILD_DATE__;
    var label = iso;
    try {
      var d = new Date(iso + "T00:00:00");
      if (!isNaN(d.getTime())) {
        label = d.toLocaleDateString(state.lang === "de" ? "de-DE" : "en-US", { day: "numeric", month: "long", year: "numeric" });
      }
    } catch (e) {}
    el.textContent = t("standLabel")(label);
  }

  function init() {
    document.documentElement.setAttribute("data-theme", state.theme);
    updateAvatarButtons();
    document.getElementById("btnProfile").onclick = toggleProfile;
    document.getElementById("profileScrim").onclick = closeProfile;
    document.getElementById("btnHome").onclick = goHome;
    document.getElementById("entityScrim").onclick = closeEntityModal;
    renderLastUpdated();
    renderHome();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
