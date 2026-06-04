let CORPUS = null;
let query = "";
let selectedId = null;

// ===== Ajustes base =====
const getEl = (id) => document.getElementById(id);
const POS_LABELS = {
  Noun: "sustantivo",
  Verb: "verbo",
  Adjective: "adjetivo",
  Pronoun: "pronombre",
  "Interrogative phrase": "frase interrogativa",
  "Imperative phrase": "frase imperativa",
  "Noun phrase": "frase nominal",
  "Verb phrase": "frase verbal",
};

function escapeHTML(text) {
  return (text ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalize(text) {
  return (text || "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function joinTexts(values) {
  return values.filter(Boolean).join(" ");
}

function assetURL(path) {
  return encodeURI(`./${path}`);
}

function posLabel(pos) {
  return POS_LABELS[pos] || pos || "";
}

function semanticDomainLabel(value) {
  if (!value) return "";
  return value.replace(/^\d+(?:\.\d+)*\s+/, "");
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

// ===== Resumen corto para el índice =====
// El resumen del índice mira todos los sentidos, no solo el primero.
function entryPosLabels(entry) {
  return uniqueList(entry.senses.map((sense) => posLabel(sense.pos)));
}

function entryDomainLabels(entry) {
  return uniqueList(
    entry.senses.flatMap((sense) => sense.traits.map((trait) => semanticDomainLabel(trait.value || "")))
  );
}

function exampleLines(sense) {
  return sense.examples.filter((example) => example.source_text || example.translation_text);
}

// En el índice solo mostramos una línea corta por entrada.
function entryLabel(entry) {
  return entry.headword || "";
}

function entrySummary(entry) {
  // Si hay varios sentidos, resumimos solo los dos primeros y luego cortamos.
  const texts = entry.senses
    .map((sense) => sense.reversal || sense.definition || sense.gloss || "")
    .filter(Boolean);

  if (!texts.length) return "";
  if (texts.length === 1) return texts[0];

  const summary = texts.slice(0, 2).map((text, index) => `${index + 1}) ${text}`);
  if (texts.length > 2) summary.push("...");
  return summary.join(" · ");
}

function listSortKey(entry) {
  return normalize(entryLabel(entry));
}

function flattenEntry(entry) {
  // Un solo texto por entrada para buscar sin tener varios índices aparte.
  const senseTexts = entry.senses.flatMap((sense) => [
    sense.gloss,
    sense.definition,
    sense.reversal,
    ...sense.traits.map((t) => t.value),
    ...sense.notes.map((n) => n.text),
    ...sense.examples.flatMap((example) => [example.source_text, example.translation_text]),
    ...sense.illustrations.map((i) => i.file),
  ]);

  const etymologyTexts = entry.etymology
    ? [
        entry.etymology.type,
        entry.etymology.source,
        ...entry.etymology.fields.flatMap((field) => [field.tag, field.type, field.text]),
      ]
    : [];

  return normalize(
    joinTexts([
      entry.headword,
      entry.audio,
      ...entry.lexical_units.map((u) => u.text),
      ...entry.entry_traits.map((t) => `${t.name} ${t.value}`),
      ...entry.notes.map((n) => n.text),
      ...senseTexts,
      ...etymologyTexts,
    ])
  );
}

// ===== Conteos y filtros =====
function countExamples(entry) {
  return entry.senses.reduce((acc, sense) => acc + exampleLines(sense).length, 0);
}

function countIllustrations(entry) {
  return entry.senses.reduce((acc, sense) => acc + sense.illustrations.length, 0);
}

function countNotes(entry) {
  return entry.notes.length + entry.senses.reduce((acc, sense) => acc + sense.notes.length, 0);
}

function currentEntries() {
  const entries = CORPUS.entries || [];
  const q = normalize(query);
  if (!q) return entries;
  return entries.filter((entry) => flattenEntry(entry).includes(q));
}

function updateStats(entries) {
  const totalEntries = CORPUS.entries.length;
  const totalExamples = CORPUS.entries.reduce((acc, entry) => acc + countExamples(entry), 0);
  const totalImages = CORPUS.entries.reduce((acc, entry) => acc + countIllustrations(entry), 0);
  const totalNotes = CORPUS.entries.reduce((acc, entry) => acc + countNotes(entry), 0);

  getEl("stats").innerHTML = [
    `entradas ${totalEntries}`,
    `ejemplos ${totalExamples}`,
    `imágenes ${totalImages}`,
    `notas ${totalNotes}`,
  ]
    .map((s) => `<span class="stat">${escapeHTML(s)}</span>`)
    .join("");
}

// ===== Lista principal =====
function renderList() {
  const entries = currentEntries().sort((a, b) => listSortKey(a).localeCompare(listSortKey(b), "es"));
  updateStats(entries);

  const selected = selectedId || location.hash.slice(1) || null;
  const list = getEl("entry-list");
  list.innerHTML = "";

  if (!entries.length) {
    list.innerHTML = `<div class="empty-state">No se encontraron entradas.</div>`;
    return;
  }

  for (const entry of entries) {
    const semanticTags = entryDomainLabels(entry);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `entry-row entry-card${selected === entry.id ? " active" : ""}`;
    card.dataset.id = entry.id;
    card.innerHTML = `
      <div class="entry-main">
        <span class="entry-term" lang="cni">${escapeHTML(entryLabel(entry) || "")}</span>
        <span class="entry-sep">·</span>
        <span class="entry-trans" lang="es">${escapeHTML(entrySummary(entry) || "Sin definición visible")}</span>
      </div>
      <div class="entry-badges">
        ${semanticTags.map((tag) => `<span class="badge domain">${escapeHTML(tag)}</span>`).join("")}
        ${countIllustrations(entry) ? `<span class="badge image" role="img" aria-label="${countIllustrations(entry)} imagen${countIllustrations(entry) === 1 ? "" : "es"}">🖼</span>` : ""}
      </div>
    `;
    card.addEventListener("click", () => openEntry(entry.id));
    list.appendChild(card);
  }
}

// ===== Modal de detalle =====
function renderEtymology(entry) {
  if (!entry.etymology) return "";
  return `
    <section class="box">
      <h3 class="box-title">Etimología</h3>
      <div class="stack">
        <div class="note-row">
          <span class="badge">${escapeHTML(entry.etymology.type || "etymology")}</span>
          <span>${escapeHTML(entry.etymology.source || "")}</span>
        </div>
        ${entry.etymology.fields
          .map(
            (field) => `
              <div class="note-row">
                <span class="badge">${escapeHTML(field.type || field.tag || "")}</span>
                <span class="tiny-label">${escapeHTML(field.lang || "")}</span>
                <span>${escapeHTML(field.text || "")}</span>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSense(entry, sense, index) {
  const multipleSenses = entry.senses.length > 1;
  const senseNumber = index + 1;
  const senseText = sense.reversal || sense.definition || sense.gloss || "";
  // La nota va junto al sentido, pero sin mostrar el tipo técnico.
  const senseNotes = sense.notes.length
    ? `
      <div class="sense-inline-notes">
        ${sense.notes
          .map(
            (note) => `
              <span class="sense-inline-note">${escapeHTML(note.text || "")}</span>
            `
          )
          .join("")}
      </div>
    `
    : "";
  const examplesList = exampleLines(sense);
  const examples = examplesList.length
    ? `
      <section class="section-block">
        <div class="examples-box">
          ${examplesList
            .map(
              (example) => `
                <div class="example-line">
                  <span class="example-source" lang="${escapeHTML(example.source_lang || "cni")}">${escapeHTML(example.source_text || "")}</span>
                  <span class="example-translation" lang="${escapeHTML(example.translation_lang || "es")}">${escapeHTML(example.translation_text || "")}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const illustrations = sense.illustrations.length
    ? `
      <section class="section-block">
        <div class="stack">
          ${sense.illustrations
            .map(
              (img) => `
                <figure class="visual visual-sense">
                  <img src="${assetURL(img.file)}" alt="${escapeHTML(senseText || entry.headword || "imagen")}">
                </figure>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  return `
    <section class="sense">
      ${senseText
        ? `
          <div class="sense-translation-row${multipleSenses ? " has-number" : ""}">
            ${multipleSenses ? `<div class="sense-index">${senseNumber})</div>` : ""}
            <div class="sense-body">
              <div class="sense-translation">${escapeHTML(senseText)}</div>
              ${senseNotes}
            </div>
          </div>
        `
        : ""}
      ${illustrations}
      ${examples}
    </section>
  `;
}

function renderEntry(entry) {
  const pronunciation = entry.pronunciations?.[0]?.text ? `/${entry.pronunciations[0].text}/` : "";
  const entryNote = entry.notes.find((note) => note.type === "comment" || note.type === "anthropology" || note.type === "default")?.text || "";
  const posLabels = entryPosLabels(entry);
  const semanticTags = entryDomainLabels(entry);
  const mainTitle = entry.headword || "";
  const senses = entry.senses
    .map((sense, index) => renderSense(entry, sense, index))
    .join("");

  return `
    <div class="detail-header">
      <div class="xhtml-headline">
        <div class="xhtml-line xhtml-line-top">
          <h2 id="modal-title" class="detail-title xhtml-headword" lang="cni">${escapeHTML(mainTitle)}</h2>
          ${pronunciation ? `<span class="xhtml-pron xhtml-pron-inline">${escapeHTML(pronunciation)}</span>` : ""}
          ${entry.audio ? `
            <button class="audio-btn" id="modal-audio-btn" type="button" aria-label="Reproducir audio" title="Reproducir audio">▶</button>
            <audio id="modal-audio" preload="none" src="${assetURL(entry.audio)}"></audio>
          ` : ""}
        </div>
        ${entryNote || posLabels.length ? `
          <div class="xhtml-line xhtml-line-meta">
            ${posLabels.map((label) => `<span class="xhtml-pos">${escapeHTML(label)}</span>`).join("")}
            ${entryNote ? `<span class="xhtml-comment">${escapeHTML(entryNote)}</span>` : ""}
          </div>
        ` : ""}
      </div>
    </div>

    <div class="modal-body">
      ${senses || `<div class="value muted">Sin sentidos visibles.</div>`}
      ${entry.etymology ? renderEtymology(entry) : ""}
    </div>

    ${semanticTags.length ? `
      <div class="modal-tags-footer">
        ${semanticTags.map((tag) => `<span class="badge">${escapeHTML(tag)}</span>`).join("")}
      </div>
    ` : ""}
  `;
}

// ===== Abrir y cerrar entradas =====
function openEntry(id) {
  selectedId = id;
  location.hash = `#${id}`;
  render();
  setModalOpen(true);
}

function closeEntry() {
  const audio = getEl("modal-audio");
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  selectedId = null;
  if (location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
  render();
  setModalOpen(false);
}

// ===== Estado del modal =====
function setModalOpen(open) {
  const backdrop = getEl("modal-backdrop");
  backdrop.classList.toggle("is-open", open);
  backdrop.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.classList.toggle("modal-open", open);
}

// ===== Render general =====
function render() {
  const selected = location.hash.slice(1);
  const entry = CORPUS.entries.find((item) => item.id === selected || item.entry_id === selected);

  renderList();

  if (entry) {
    selectedId = entry.id;
    getEl("modal-content").innerHTML = renderEntry(entry);
    setModalOpen(true);
  } else {
    selectedId = null;
    getEl("modal-content").innerHTML = "";
    setModalOpen(false);
  }
}

// ===== Inicio =====
async function init() {
  if (!window.CORPUS_DATA) {
    getEl("entry-list").innerHTML = `<div class="empty-state">No se pudo cargar corpus-data.js.</div>`;
    return;
  }

  CORPUS = window.CORPUS_DATA;

  getEl("search").addEventListener("input", (ev) => {
    query = ev.target.value;
    render();
  });

  getEl("modal-backdrop").addEventListener("click", (ev) => {
    if (ev.target.id === "modal-backdrop") {
      closeEntry();
      return;
    }

    if (ev.target.id === "modal-audio-btn") {
      const audio = getEl("modal-audio");
      if (audio) {
        if (audio.paused) {
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      }
    }
  });

  getEl("modal-close").addEventListener("click", closeEntry);

  window.addEventListener("hashchange", render);
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && getEl("modal-backdrop").classList.contains("is-open")) {
      closeEntry();
    }
  });

  render();
}

init();
