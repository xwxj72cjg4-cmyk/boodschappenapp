(function () {
  "use strict";

  const app = document.getElementById("app");
  const audio = document.getElementById("player");
  const STORAGE_KEY = "tijdlijn.v1";
  const MAX_PLAYERS = 8;

  // ---------- Opslag (instellingen en eigen kaarten) ----------

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function save(patch) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign(load(), patch)));
    } catch (e) {
      /* privévenster of geen opslag: spel werkt gewoon door */
    }
  }

  function customDeck() {
    const stored = load().custom;
    if (!stored || !stored.cards || !stored.cards.length) return null;
    return {
      id: "eigen",
      name: stored.name || "Eigen kaarten",
      emoji: "✏️",
      music: !!stored.music,
      description: stored.cards.length + " eigen kaarten",
      cards: stored.cards,
    };
  }

  // Genre-sets uit js/muziek-db.js (gemaakt uit Wikidata door tools/bouw-muziek.mjs).
  function genreDecks() {
    return (window.MUSIC_DB || [])
      .filter((d) => d.cards.length)
      .map((d) => Object.assign({ description: "Nummers via Wikipedia" }, d));
  }

  function allDecks() {
    const own = customDeck();
    return window.DECKS.concat(genreDecks(), own ? [own] : []);
  }

  // ---------- Hulpjes ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sortedTimeline(player) {
    return player.timeline.slice().sort((a, b) => a.year - b.year);
  }

  // Positie i betekent: tussen kaart i-1 en kaart i. Gelijke jaren tellen aan beide kanten goed.
  function isCorrect(timeline, slot, year) {
    const before = timeline[slot - 1];
    const after = timeline[slot];
    return (!before || before.year <= year) && (!after || year <= after.year);
  }

  // ---------- Muziekfragmenten via de iTunes Search API ----------

  const previewCache = new Map();
  // Al gevonden fragmenten, zodat we ze direct (binnen dezelfde tik) kunnen afspelen.
  // iOS laat geluid alleen starten als dat rechtstreeks op een tik gebeurt.
  const previewReady = new Map();

  function normalize(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  }

  function findPreview(card) {
    const key = card.sub + "|" + card.title;
    if (previewCache.has(key)) return previewCache.get(key);
    const term = encodeURIComponent((card.sub + " " + card.title).replace(/ft\.|feat\.|&/gi, " "));
    const controller = "AbortController" in window ? new AbortController() : null;
    const timer = setTimeout(() => controller && controller.abort(), 7000);
    // Kaarten uit de genre-database hebben al een vaste Apple-ID; de rest zoeken we op.
    const promise = fetch(
      card.itunes
        ? "https://itunes.apple.com/lookup?country=NL&id=" + card.itunes
        : "https://itunes.apple.com/search?media=music&entity=song&limit=10&country=NL&term=" + term,
      controller ? { signal: controller.signal } : undefined
    )
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data) => {
        const results = (data.results || []).filter((r) => r.previewUrl);
        const artist = normalize(card.sub.split(/ ft\.| feat\.| &/)[0]);
        const title = normalize(card.title).slice(0, 8);
        const best =
          (card.itunes && results[0]) ||
          results.find((r) => normalize(r.artistName).includes(artist) && normalize(r.trackName).includes(title)) ||
          results.find((r) => normalize(r.artistName).includes(artist)) ||
          null;
        const url = best ? best.previewUrl : null;
        previewReady.set(key, url);
        return url;
      })
      .catch(() => null)
      .then((url) => {
        clearTimeout(timer);
        return url;
      });
    previewCache.set(key, promise);
    return promise;
  }

  function playFragment(fromTap) {
    if (audio.getAttribute("src") !== game.preview) audio.src = game.preview;
    audio.play().catch(() => {
      // Automatisch starten mag soms niet (browserbeleid); dan gewoon op de knop drukken.
      if (fromTap) {
        game.revealedTitle = true;
        render();
      }
    });
  }

  function stopAudio() {
    audio.pause();
    audio.removeAttribute("src");
  }

  // ---------- Afspelen en Spotify-links ----------

  const PLAYBACK = [
    ["fragment", "🔊 Fragment (30 sec.)", "Het fragment speelt direct in de app zodra je een kaart pakt. Het komt van Apple Music en heeft internet nodig."],
    ["lezen", "📖 Voorlezen", "Titel en artiest staan op de kaart; iemand anders leest ze voor of zingt het nummer."],
  ];

  function isSpotifyRef(s) {
    return /^(https?:\/\/open\.spotify\.com\/|spotify:track:|[A-Za-z0-9]{22}$)/.test(s || "");
  }

  // Na het onthullen kun je het hele nummer op Spotify openen. Een kaart kan een eigen
  // Spotify-link of track-ID hebben; anders zoeken we op artiest + titel.
  function spotifyUrl(card) {
    const ref = card.spotify;
    if (/^https?:\/\//.test(ref)) return ref;
    const id = (ref.match(/^(?:spotify:track:)?([A-Za-z0-9]{22})$/) || [])[1];
    if (id) return "https://open.spotify.com/track/" + id;
    return "https://open.spotify.com/search/" + encodeURIComponent(card.sub + " " + card.title);
  }

  // ---------- Spelstatus ----------

  const saved = load();
  let settings = {
    players: saved.players || ["Speler 1", "Speler 2"],
    decks: saved.decks || ["muziek"],
    target: saved.target || 10,
    // "fragment" = 30 sec. via Apple, direct in de app; "lezen" = kaart voorlezen
    playback: saved.playback === "lezen" || saved.audio === false ? "lezen" : "fragment",
  };

  let game = null;

  function newGame() {
    const decks = allDecks().filter((d) => settings.decks.includes(d.id));
    const cards = [];
    const seen = new Set();
    decks.forEach((d) =>
      d.cards.forEach(([year, title, sub, spotify, itunes]) => {
        // Een nummer kan in meerdere genres staan; dan maar één keer in de stapel.
        const key = normalize(title) + "|" + normalize(sub || "");
        if (seen.has(key)) return;
        seen.add(key);
        cards.push({ year, title, sub: sub || "", spotify: spotify || "", itunes: itunes || 0, deck: d.id, music: !!d.music });
      })
    );
    const pile = shuffle(cards);
    const players = settings.players.map((name) => ({ name, timeline: [pile.pop()], coins: 2 }));
    game = { players, pile, current: Math.floor(Math.random() * players.length), card: null, slot: 0, result: null };
    prefetchNext();
  }

  function player() {
    return game.players[game.current];
  }

  function drawCard() {
    game.card = game.pile.pop() || null;
    game.slot = Math.floor(sortedTimeline(player()).length / 2);
    game.revealedTitle = !game.card || !game.card.music || settings.playback === "lezen";
    game.preview = undefined;
    if (game.card && game.card.music && settings.playback === "fragment") {
      const card = game.card;
      const key = card.sub + "|" + card.title;
      if (previewReady.has(key)) {
        game.preview = previewReady.get(key);
        if (!game.preview) game.revealedTitle = true;
      }
      findPreview(card).then((url) => {
        if (game && game.card === card && game.preview === undefined) {
          game.preview = url;
          if (!url) game.revealedTitle = true;
          if (screen === "play") render();
        }
      });
    }
    prefetchNext();
  }

  // Volgende kaart alvast opzoeken zodat het fragment meteen klaarstaat.
  function prefetchNext() {
    const next = game.pile[game.pile.length - 1];
    if (next && next.music && settings.playback === "fragment") findPreview(next);
  }

  // ---------- Schermen ----------

  let screen = "home";
  const backTargets = { setup: "home", rules: "home", custom: "home", turn: "quit", play: "quit", reveal: "quit", end: "home" };

  function go(name) {
    if (name !== "play") stopAudio();
    screen = name;
    render();
  }

  function render() {
    app.innerHTML = views[screen]();
    app.className = "screen screen-" + screen;
    const auto = app.querySelector("[autofocus]") || app.querySelector(".slot.selected") || app.querySelector("button, input, textarea");
    if (auto) auto.focus({ preventScroll: screen !== "play" });
    const sel = app.querySelector(".slot.selected");
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function scoreboard() {
    return (
      '<ul class="scores">' +
      game.players
        .map(
          (p, i) =>
            '<li class="' + (i === game.current ? "active" : "") + '">' +
            '<span class="name">' + esc(p.name) + "</span>" +
            '<span class="count">' + p.timeline.length + "/" + settings.target + "</span>" +
            '<span class="coins" title="Munten">🪙' + p.coins + "</span></li>"
        )
        .join("") +
      "</ul>"
    );
  }

  function cardHtml(card, opts) {
    opts = opts || {};
    const deck = allDecks().find((d) => d.id === card.deck);
    const hidden = opts.hideTitle;
    return (
      '<div class="card ' + (opts.cls || "") + '">' +
      '<div class="card-deck">' + (deck ? deck.emoji : "") + "</div>" +
      '<div class="card-year">' + (opts.hideYear ? "?" : card.year) + "</div>" +
      '<div class="card-title">' + (hidden ? "???" : esc(card.title)) + "</div>" +
      (card.sub ? '<div class="card-sub">' + (hidden ? "" : esc(card.sub)) + "</div>" : "") +
      "</div>"
    );
  }

  function timelineHtml(cards, opts) {
    opts = opts || {};
    let html = '<div class="timeline" data-row="timeline">';
    for (let i = 0; i <= cards.length; i++) {
      if (opts.slots) {
        html +=
          '<button class="slot' + (i === game.slot ? " selected" : "") + '" data-slot="' + i + '" aria-label="Plaats ' +
          (i === 0 ? "vóór alles" : i === cards.length ? "na alles" : "tussen " + cards[i - 1].year + " en " + cards[i].year) +
          '"><span>＋</span></button>';
      }
      if (i < cards.length) {
        const c = cards[i];
        html += cardHtml(c, { cls: "mini" + (c === opts.highlight ? " highlight " + (opts.good ? "good" : "bad") : "") });
      }
    }
    return html + "</div>";
  }

  function deckGroup(heading, decks, row, autofocus, extra) {
    if (!decks.length) return "";
    return (
      "<h3>" + heading + "</h3>" +
      '<div class="decks" data-row="' + row + '">' +
      (extra || "") +
      decks
        .map(
          (d, i) =>
            '<button class="deck' + (settings.decks.includes(d.id) ? " on" : "") + '" data-deck="' + d.id + '"' +
            (autofocus && i === 0 ? " autofocus" : "") + ' aria-pressed="' + settings.decks.includes(d.id) + '">' +
            '<span class="deck-emoji">' + d.emoji + "</span>" +
            '<span class="deck-name">' + esc(d.name) + "</span>" +
            '<span class="deck-desc">' + esc(d.description) + " · " + d.cards.length + " kaarten</span>" +
            "</button>"
        )
        .join("") +
      "</div>"
    );
  }

  // Eén knop die alle genres tegelijk aan- of uitzet.
  function allGenresButton(genres) {
    const on = genres.every((d) => settings.decks.includes(d.id));
    const keys = new Set();
    genres.forEach((d) => d.cards.forEach((c) => keys.add(normalize(c[1]) + "|" + normalize(c[2] || ""))));
    const count = keys.size;
    return (
      '<button class="deck' + (on ? " on" : "") + '" data-all-genres aria-pressed="' + on + '">' +
      '<span class="deck-emoji">🎶</span>' +
      '<span class="deck-name">Alles door elkaar</span>' +
      '<span class="deck-desc">Alle genres samen · ' + count + " kaarten</span>" +
      "</button>"
    );
  }

  const views = {
    home() {
      return (
        '<div class="center">' +
        '<h1 class="logo">Tijd<span>lijn</span></h1>' +
        '<p class="tagline">Leg de kaarten in de juiste volgorde. Wie het eerst ' + settings.target + " kaarten heeft, wint.</p>" +
        '<div class="stack" data-row="menu">' +
        '<button class="btn primary big" data-go="setup" autofocus>Nieuw spel</button>' +
        '<button class="btn" data-go="rules">Spelregels</button>' +
        '<button class="btn" data-go="custom">Eigen kaarten</button>' +
        "</div></div>"
      );
    },

    rules() {
      return (
        '<div class="panel">' +
        "<h2>Spelregels</h2>" +
        "<ol class='rules'>" +
        "<li>Iedere speler begint met één open kaart op zijn of haar tijdlijn.</li>" +
        "<li>Om de beurt krijg je een nieuwe kaart. Bij <b>Muziekhits</b> hoor je een fragment; bij andere sets zie je de gebeurtenis, maar niet het jaar.</li>" +
        "<li>Kies waar de kaart op jouw tijdlijn hoort: ervoor, ertussen of erna.</li>" +
        "<li>Goed? Dan mag je de kaart houden. Fout? Dan gaat hij weg.</li>" +
        "<li>Wie als eerste het doelaantal kaarten heeft, wint.</li>" +
        "<li><b>Munten 🪙</b>: je start met 2. Raad je bij muziek titel én artiest goed, dan krijg je er een bij. Met 1 munt mag je een kaart overslaan.</li>" +
        "</ol>" +
        "<h3>Bediening</h3>" +
        "<p>Tik op een <b>＋</b> om een plek te kiezen en tik nog een keer (of op <i>Plaats hier</i>) om te bevestigen. " +
        "Op de tv: pijltjes ◀ ▶ om een plek te kiezen, <b>OK</b> om te bevestigen, ▲ ▼ voor de knoppen en <b>Terug</b> om te stoppen.</p>" +
        '<div class="row" data-row="actions"><button class="btn primary" data-go="home" autofocus>Terug</button></div>' +
        "</div>"
      );
    },

    setup() {
      const decks = allDecks();
      const genres = decks.filter((d) => d.id.startsWith("genre-"));
      return (
        '<div class="panel">' +
        "<h2>Nieuw spel</h2>" +
        "<h3>Spelers</h3>" +
        '<div class="players">' +
        settings.players
          .map(
            (name, i) =>
              '<div class="player-row" data-row="p' + i + '">' +
              '<input class="input" data-player="' + i + '" value="' + esc(name) + '" maxlength="16" aria-label="Naam speler ' + (i + 1) + '">' +
              (settings.players.length > 1
                ? '<button class="btn icon" data-remove="' + i + '" aria-label="Verwijder speler">✕</button>'
                : "") +
              "</div>"
          )
          .join("") +
        "</div>" +
        (settings.players.length < MAX_PLAYERS
          ? '<div class="row" data-row="add"><button class="btn" data-add>+ Speler toevoegen</button></div>'
          : "") +
        deckGroup("Scenario's", decks.filter((d) => !d.id.startsWith("genre-")), "decks", true) +
        deckGroup("Muziek per genre", genres, "genres", false, allGenresButton(genres)) +
        "<h3>Opties</h3>" +
        '<div class="row wrap" data-row="target">' +
        [5, 8, 10, 12]
          .map((n) => '<button class="chip' + (settings.target === n ? " on" : "") + '" data-target="' + n + '">' + n + " kaarten</button>")
          .join("") +
        "</div>" +
        "<h3>Muziek afspelen</h3>" +
        '<div class="row wrap" data-row="playback">' +
        PLAYBACK.map(
          ([id, label]) => '<button class="chip' + (settings.playback === id ? " on" : "") + '" data-playback="' + id + '">' + label + "</button>"
        ).join("") +
        "</div>" +
        '<p class="hint">' + PLAYBACK.find(([id]) => id === settings.playback)[2] + "</p>" +
        '<p class="error" id="setup-error"></p>' +
        '<div class="row" data-row="actions">' +
        '<button class="btn" data-go="home">Terug</button>' +
        '<button class="btn primary big" data-start>Start spel</button>' +
        "</div></div>"
      );
    },

    custom() {
      const stored = load().custom || {};
      const text = (stored.cards || []).map((c) => c.filter((x, i) => i < 2 || x !== "").join("; ")).join("\n");
      return (
        '<div class="panel">' +
        "<h2>Eigen kaarten</h2>" +
        "<p>Maak je eigen scenario, bijvoorbeeld familiemomenten, je favoriete band of een quiz voor de klas. " +
        "Eén kaart per regel: <code>jaar; titel; extra info</code>. " +
        "Bij nummers kun je er een Spotify-link achter zetten (in Spotify: Delen → Kopieer link) om na afloop het hele nummer te openen.</p>" +
        '<div data-row="name"><input class="input" id="custom-name" placeholder="Naam van de set" value="' + esc(stored.name || "") + '"></div>' +
        '<div data-row="text"><textarea class="input" id="custom-text" rows="9" placeholder="1998; Oma en opa trouwen; In Utrecht\n2005; Verhuizing naar Zwolle\n2012; Geboorte van Sam">' +
        esc(text) +
        "</textarea></div>" +
        '<div class="row" data-row="music"><button class="chip' + (stored.music ? " on" : "") + '" data-custom-music>🎵 Dit zijn nummers (extra info = artiest)</button></div>' +
        '<p class="hint" id="custom-msg"></p>' +
        '<div class="row" data-row="actions">' +
        '<button class="btn" data-go="home">Terug</button>' +
        '<button class="btn primary" data-custom-save>Opslaan</button>' +
        "</div></div>"
      );
    },

    turn() {
      return (
        '<div class="center">' +
        scoreboard() +
        '<p class="eyebrow">Aan de beurt</p>' +
        '<h1 class="turn-name">' + esc(player().name) + "</h1>" +
        '<p class="tagline">Nog ' + game.pile.length + " kaarten op de stapel</p>" +
        '<div class="row" data-row="actions"><button class="btn primary big" data-begin autofocus>Pak een kaart</button></div>' +
        "</div>"
      );
    },

    play() {
      const p = player();
      const card = game.card;
      const timeline = sortedTimeline(p);
      let media = "";
      if (card.music && settings.playback === "fragment") {
        if (game.preview === undefined) {
          media = '<p class="hint">Fragment zoeken…</p>';
        } else if (game.preview) {
          media =
            '<button class="btn play" data-play>' + (audio.paused ? "▶ Speel fragment" : "⏸ Pauze") + "</button>" +
            '<div class="eq' + (audio.paused ? "" : " on") + '"><i></i><i></i><i></i><i></i><i></i></div>';
        } else {
          media = '<p class="hint">Geen fragment gevonden — lees de kaart voor.</p>';
        }
      }
      return (
        scoreboard() +
        '<div class="play-top">' +
        '<div class="mystery">' + cardHtml(card, { hideYear: true, hideTitle: !game.revealedTitle, cls: "big" }) + "</div>" +
        '<div class="play-actions" data-row="controls">' +
        media +
        (!game.revealedTitle && game.preview ? '<button class="btn small" data-show-title>Toon titel</button>' : "") +
        (p.coins > 0 && game.pile.length ? '<button class="btn small" data-skip>Overslaan (🪙1)</button>' : "") +
        "</div></div>" +
        '<p class="instruction"><b>' + esc(p.name) + "</b>, waar hoort deze kaart?</p>" +
        timelineHtml(timeline, { slots: true }) +
        '<div class="row" data-row="confirm"><button class="btn primary big" data-place>Plaats hier</button></div>'
      );
    },

    reveal() {
      const r = game.result;
      const p = player();
      const won = p.timeline.length >= settings.target;
      const shown = sortedTimeline(p);
      if (!r.good) {
        shown.push(r.card);
        shown.sort((a, b) => a.year - b.year);
      }
      return (
        scoreboard() +
        '<div class="reveal-top">' +
        cardHtml(r.card, { cls: "big flip " + (r.good ? "good" : "bad") }) +
        '<div class="verdict ' + (r.good ? "good" : "bad") + '">' +
        "<h2>" + (r.good ? "Goed! 🎉" : "Helaas…") + "</h2>" +
        "<p>" + (r.good ? esc(p.name) + " houdt de kaart." : "De kaart hoorde op een andere plek en gaat weg.") + "</p>" +
        "</div></div>" +
        timelineHtml(shown, { highlight: r.card, good: r.good }) +
        '<div class="row" data-row="actions">' +
        (r.card.music && !r.bonusAsked
          ? '<button class="btn" data-bonus>Titel + artiest goed? +🪙</button>'
          : "") +
        (r.card.music
          ? '<a class="btn" href="' + esc(spotifyUrl(r.card)) + '" target="_blank" rel="noopener">Hele nummer op Spotify</a>'
          : "") +
        '<button class="btn primary big" data-next autofocus>' + (won ? "Bekijk de winnaar" : "Volgende speler") + "</button>" +
        "</div>"
      );
    },

    end() {
      const ranked = game.players.slice().sort((a, b) => b.timeline.length - a.timeline.length);
      const winner = ranked[0];
      return (
        '<div class="center">' +
        '<p class="eyebrow">' + (game.pile.length ? "Winnaar" : "De stapel is op! Winnaar") + "</p>" +
        '<h1 class="turn-name">🏆 ' + esc(winner.name) + "</h1>" +
        '<ol class="ranking">' +
        ranked.map((p) => "<li><span>" + esc(p.name) + "</span><b>" + p.timeline.length + " kaarten</b></li>").join("") +
        "</ol>" +
        timelineHtml(sortedTimeline(winner)) +
        '<div class="row" data-row="actions">' +
        '<button class="btn" data-go="home">Menu</button>' +
        '<button class="btn primary big" data-again autofocus>Nog een keer</button>' +
        "</div></div>"
      );
    },
  };

  // ---------- Acties ----------

  function readPlayerInputs() {
    app.querySelectorAll("[data-player]").forEach((input) => {
      settings.players[+input.dataset.player] = input.value.trim() || "Speler " + (+input.dataset.player + 1);
    });
  }

  function placeCard() {
    const p = player();
    const timeline = sortedTimeline(p);
    const good = isCorrect(timeline, game.slot, game.card.year);
    if (good) p.timeline.push(game.card);
    game.result = { card: game.card, good, bonusAsked: false };
    game.card = null;
    go("reveal");
  }

  function nextTurn() {
    if (player().timeline.length >= settings.target || !game.pile.length) return go("end");
    game.current = (game.current + 1) % game.players.length;
    go("turn");
  }

  function quit() {
    if (confirm("Spel stoppen en terug naar het menu?")) go("home");
  }

  app.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    const d = el.dataset;

    if (d.go) {
      if (screen === "setup") readPlayerInputs();
      return go(d.go);
    }
    if ("add" in d) {
      readPlayerInputs();
      settings.players.push("Speler " + (settings.players.length + 1));
      render();
      const inputs = app.querySelectorAll("[data-player]");
      inputs[inputs.length - 1].select();
      return;
    }
    if (d.remove) {
      readPlayerInputs();
      settings.players.splice(+d.remove, 1);
      return render();
    }
    if (d.deck) {
      readPlayerInputs();
      const i = settings.decks.indexOf(d.deck);
      if (i >= 0) settings.decks.splice(i, 1);
      else settings.decks.push(d.deck);
      render();
      return app.querySelector('[data-deck="' + d.deck + '"]').focus();
    }
    if ("allGenres" in d) {
      readPlayerInputs();
      const ids = allDecks().filter((x) => x.id.startsWith("genre-")).map((x) => x.id);
      const allOn = ids.every((id) => settings.decks.includes(id));
      settings.decks = settings.decks.filter((id) => !ids.includes(id)).concat(allOn ? [] : ids);
      render();
      return app.querySelector("[data-all-genres]").focus();
    }
    if (d.target) {
      readPlayerInputs();
      settings.target = +d.target;
      render();
      return app.querySelector('[data-target="' + d.target + '"]').focus();
    }
    if (d.playback) {
      readPlayerInputs();
      settings.playback = d.playback;
      render();
      return app.querySelector('[data-playback="' + d.playback + '"]').focus();
    }
    if ("start" in d) {
      readPlayerInputs();
      settings.decks = settings.decks.filter((id) => allDecks().some((x) => x.id === id));
      const available = allDecks()
        .filter((x) => settings.decks.includes(x.id))
        .reduce((n, x) => n + x.cards.length, 0);
      const err = app.querySelector("#setup-error");
      if (!settings.decks.length) return (err.textContent = "Kies minstens één scenario.");
      if (available < settings.players.length + 5)
        return (err.textContent = "Te weinig kaarten voor zoveel spelers. Kies meer scenario's.");
      save({ players: settings.players, decks: settings.decks, target: settings.target, playback: settings.playback });
      newGame();
      return go("turn");
    }
    if ("begin" in d) {
      drawCard();
      go("play");
      if (game.preview) playFragment(false);
      return;
    }
    if (d.slot !== undefined) {
      const slot = +d.slot;
      if (slot === game.slot) return placeCard();
      game.slot = slot;
      return render();
    }
    if ("place" in d) return placeCard();
    if ("play" in d) {
      if (audio.paused) {
        playFragment(true);
      } else {
        audio.pause();
      }
      return;
    }
    if ("showTitle" in d) {
      game.revealedTitle = true;
      return render();
    }
    if ("skip" in d) {
      player().coins--;
      stopAudio();
      drawCard();
      render();
      if (game.preview) playFragment(false);
      return;
    }
    if ("bonus" in d) {
      player().coins++;
      game.result.bonusAsked = true;
      return render();
    }
    if ("next" in d) return nextTurn();
    if ("again" in d) {
      newGame();
      return go("turn");
    }
    if ("customMusic" in d) {
      el.classList.toggle("on");
      return;
    }
    if ("customSave" in d) {
      const lines = app.querySelector("#custom-text").value.split("\n");
      const cards = [];
      const bad = [];
      lines.forEach((line, i) => {
        if (!line.trim()) return;
        const parts = line.split(/[;|\t]/).map((s) => s.trim());
        const year = parseInt(parts[0], 10);
        if (!parts[1] || isNaN(year)) return bad.push(i + 1);
        const link = parts.slice(2).find(isSpotifyRef);
        cards.push([year, parts[1], parts.slice(2).filter((x) => x && x !== link).join(", "), link || ""]);
      });
      const music = app.querySelector("[data-custom-music]").classList.contains("on");
      save({ custom: { name: app.querySelector("#custom-name").value.trim(), music, cards } });
      if (!cards.length) settings.decks = settings.decks.filter((id) => id !== "eigen");
      else if (!settings.decks.includes("eigen")) settings.decks.push("eigen");
      app.querySelector("#custom-msg").textContent =
        cards.length + " kaarten opgeslagen" + (bad.length ? " · regel " + bad.join(", ") + " overgeslagen (geen jaar of titel)" : "") + ".";
      return;
    }
  });

  // Met de afstandsbediening selecteert focus op een plek die plek meteen; OK bevestigt dan.
  // Bij tikken/klikken niet, anders zou de eerste tik al bevestigen.
  let keyboardNav = false;
  document.addEventListener("pointerdown", () => (keyboardNav = false), true);
  document.addEventListener("keydown", () => (keyboardNav = true), true);

  app.addEventListener("focusin", (e) => {
    const slot = e.target.closest && e.target.closest(".slot");
    if (!slot || screen !== "play" || !keyboardNav) return;
    const n = +slot.dataset.slot;
    if (n === game.slot) return;
    game.slot = n;
    app.querySelectorAll(".slot").forEach((s) => s.classList.toggle("selected", +s.dataset.slot === n));
    slot.scrollIntoView && slot.scrollIntoView({ block: "nearest", inline: "center" });
  });

  ["play", "pause", "ended"].forEach((ev) =>
    audio.addEventListener(ev, () => {
      const btn = app.querySelector("[data-play]");
      const eq = app.querySelector(".eq");
      if (btn) btn.textContent = audio.paused ? "▶ Speel fragment" : "⏸ Pauze";
      if (eq) eq.classList.toggle("on", !audio.paused);
    })
  );

  // ---------- Afstandsbediening / toetsenbord ----------
  // Links/rechts beweegt binnen een rij (data-row), omhoog/omlaag springt naar de vorige/volgende rij.

  const KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461, ESC: 27, BACKSPACE: 8 };

  function focusables() {
    return Array.from(app.querySelectorAll("button, a[href], input, textarea")).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function rowOf(el) {
    const row = el.closest("[data-row]");
    return row || el;
  }

  function moveFocus(dir) {
    const items = focusables();
    if (!items.length) return;
    const current = document.activeElement;
    let idx = items.indexOf(current);
    if (idx < 0) return items[0].focus();

    if (dir === "left" || dir === "right") {
      const step = dir === "right" ? 1 : -1;
      const next = items[idx + step];
      if (next && rowOf(next) === rowOf(current)) next.focus();
      return;
    }

    const rows = [];
    items.forEach((el) => {
      const r = rowOf(el);
      if (!rows.includes(r)) rows.push(r);
    });
    const r = rows.indexOf(rowOf(current)) + (dir === "down" ? 1 : -1);
    if (r < 0 || r >= rows.length) return;
    const target = rows[r];
    const inRow = items.filter((el) => rowOf(el) === target);
    (target.querySelector(".slot.selected, .on, [autofocus]") || inRow[0]).focus();
  }

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
    const k = e.keyCode;

    if (k === KEY.BACK || k === KEY.ESC || (k === KEY.BACKSPACE && !typing)) {
      e.preventDefault();
      const target = backTargets[screen];
      if (target === "quit") quit();
      else if (target) {
        if (screen === "setup") readPlayerInputs();
        go(target);
      } else if (window.webOS && window.webOS.platformBack) {
        window.webOS.platformBack();
      }
      return;
    }

    if (typing && (k === KEY.LEFT || k === KEY.RIGHT)) return;
    if (typing && document.activeElement.tagName === "TEXTAREA" && (k === KEY.UP || k === KEY.DOWN)) return;

    const dir = { 37: "left", 38: "up", 39: "right", 40: "down" }[k];
    if (dir) {
      e.preventDefault();
      moveFocus(dir);
    }
  });

  // ---------- Start ----------

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  render();
})();
