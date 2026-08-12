// ============================================================
// Glosario Ashaninka-Castellano
// ------------------------------------------------------------
// Este archivo hace cuatro cosas:
// 1. Lee los datos que llegan desde corpus-data.js.
// 2. Dibuja la lista de entradas.
// 3. Filtra la lista cuando se escribe en el buscador.
// 4. Abre/cierra el modal con el detalle de cada entrada.
// ============================================================

let corpus = null;
let searchText = "";

// ------------------------------------------------------------
// 1. Helpers generales
// ------------------------------------------------------------
// Son funciones pequenas que se reutilizan en varias partes.

const get = (id) => document.getElementById(id);

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

function escapeHTML(value) {
  // Evita que un texto del corpus sea interpretado como codigo HTML.
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalize(value) {
  // Permite buscar "aguila" aunque el texto diga "aguila" con tilde.
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function fileURL(path) {
  return encodeURI(`./${path}`);
}

function posLabel(pos) {
  return POS_LABELS[pos] || pos || "";
}

function domainLabel(domain) {
  // Quita numeraciones como "4.1.9 Parentesco".
  return String(domain || "").replace(/^\d+(?:\.\d+)*\s+/, "");
}

function visibleExamples(sense) {
  return (sense.examples || []).filter((example) => example.source_text || example.translation_text);
}

// ------------------------------------------------------------
// 2. Lectura simple del corpus
// ------------------------------------------------------------
// Estas funciones deciden que informacion se muestra o se busca.

function allEntries() {
  return corpus?.entries || [];
}

function entryTitle(entry) {
  return entry.headword || "";
}

function senseText(sense) {
  // En la practica, reversal/definition/gloss suelen ser la misma traduccion visible.
  return sense.reversal || sense.definition || sense.gloss || "";
}

function entrySummary(entry) {
  // En el indice mostramos maximo dos sentidos para no romper la tarjeta.
  const texts = (entry.senses || []).map(senseText).filter(Boolean);

  if (texts.length === 0) return "Sin definicion visible";
  if (texts.length === 1) return texts[0];

  const firstTwo = texts.slice(0, 2).map((text, index) => `${index + 1}) ${text}`);
  return texts.length > 2 ? `${firstTwo.join(" · ")} · ...` : firstTwo.join(" · ");
}

function entryDomains(entry) {
  return unique(
    (entry.senses || []).flatMap((sense) =>
      (sense.traits || []).map((trait) => domainLabel(trait.value))
    )
  );
}

function entryPosLabels(entry) {
  return unique((entry.senses || []).map((sense) => posLabel(sense.pos)));
}

function entryImageCount(entry) {
  return (entry.senses || []).reduce(
    (total, sense) => total + (sense.illustrations || []).length,
    0
  );
}

function entryExampleCount(entry) {
  return (entry.senses || []).reduce(
    (total, sense) => total + visibleExamples(sense).length,
    0
  );
}

function entryNoteCount(entry) {
  const entryNotes = entry.notes || [];
  const senseNotes = (entry.senses || []).flatMap((sense) => sense.notes || []);
  return entryNotes.length + senseNotes.length;
}

function entrySearchBlob(entry) {
  // Unimos todos los textos importantes en una sola cadena para buscar facil.
  const senseTexts = (entry.senses || []).flatMap((sense) => [
    senseText(sense),
    sense.pos,
    ...(sense.traits || []).map((trait) => trait.value),
    ...(sense.notes || []).map((note) => note.text),
    ...visibleExamples(sense).flatMap((example) => [
      example.source_text,
      example.translation_text,
    ]),
  ]);
  const etymologyTexts = entry.etymology
    ? [
        entry.etymology.type,
        entry.etymology.source,
        ...(entry.etymology.fields || []).flatMap((field) => [
          field.tag,
          field.type,
          field.lang,
          field.text,
        ]),
      ]
    : [];

  return normalize([
    entry.headword,
    entry.audio,
    ...(entry.lexical_units || []).map((unit) => unit.text),
    ...(entry.entry_traits || []).map((trait) => `${trait.name} ${trait.value}`),
    ...(entry.notes || []).map((note) => note.text),
    ...(entry.pronunciations || []).map((pron) => pron.text),
    ...senseTexts,
    ...etymologyTexts,
  ].filter(Boolean).join(" "));
}

function filteredEntries() {
  const q = normalize(searchText);
  const entries = allEntries();
  if (!q) return entries;
  return entries.filter((entry) => entrySearchBlob(entry).includes(q));
}

// ------------------------------------------------------------
// 3. Piezas pequenas de HTML
// ------------------------------------------------------------
// La estructura fija vive en app-piloto.html. Aqui solo generamos lo dinamico:
// tarjetas de entrada, sentidos, ejemplos, imagenes y etiquetas.

function Badge(text, extraClass = "") {
  if (!text) return "";
  return `<span class="badge ${extraClass}">${escapeHTML(text)}</span>`;
}

function DomainBadges(entry) {
  return entryDomains(entry).map((domain) => Badge(domain, "domain")).join("");
}

function ImageBadge(entry) {
  const count = entryImageCount(entry);
  if (!count) return "";

  const label = `${count} imagen${count === 1 ? "" : "es"}`;
  return `<span class="badge image" role="img" aria-label="${label}">🖼</span>`;
}

function EntryCard(entry, isSelected) {
  return `
    <button class="entry-row entry-card${isSelected ? " active" : ""}" type="button" data-id="${escapeHTML(entry.id)}">
      <div class="entry-main">
        <span class="entry-term" lang="cni">${escapeHTML(entryTitle(entry))}</span>
        <span class="entry-sep">·</span>
        <span class="entry-trans" lang="es">${escapeHTML(entrySummary(entry))}</span>
      </div>
      <div class="entry-badges">
        ${DomainBadges(entry)}
        ${ImageBadge(entry)}
      </div>
    </button>
  `;
}

function AudioButton(entry) {
  if (!entry.audio) return "";

  return `
    <button class="audio-btn" id="modal-audio-btn" type="button" aria-label="Reproducir audio" title="Reproducir audio">▶</button>
    <audio id="modal-audio" preload="none" src="${fileURL(entry.audio)}"></audio>
  `;
}

function ModalHeader(entry) {
  const pronunciation = entry.pronunciations?.[0]?.text
    ? `/${entry.pronunciations[0].text}/`
    : "";
  const entryNote = (entry.notes || []).find((note) =>
    ["comment", "anthropology", "default"].includes(note.type)
  )?.text;

  return `
    <div class="detail-header">
      <div class="xhtml-headline">
        <div class="xhtml-line xhtml-line-top">
          <h2 id="modal-title" class="detail-title xhtml-headword" lang="cni">${escapeHTML(entryTitle(entry))}</h2>
          ${pronunciation ? `<span class="xhtml-pron xhtml-pron-inline">${escapeHTML(pronunciation)}</span>` : ""}
          ${AudioButton(entry)}
        </div>
        <div class="xhtml-line xhtml-line-meta">
          ${entryPosLabels(entry).map((label) => `<span class="xhtml-pos">${escapeHTML(label)}</span>`).join("")}
          ${entryNote ? `<span class="xhtml-comment">${escapeHTML(entryNote)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function SenseNotes(sense) {
  const notes = sense.notes || [];
  if (!notes.length) return "";

  return `
    <div class="sense-inline-notes">
      ${notes.map((note) => `<span class="sense-inline-note">${escapeHTML(note.text)}</span>`).join("")}
    </div>
  `;
}

function ExamplesBox(sense) {
  const examples = visibleExamples(sense);
  if (!examples.length) return "";

  return `
    <section class="section-block">
      <div class="examples-box">
        ${examples.map((example) => `
          <div class="example-line">
            <span class="example-source" lang="${escapeHTML(example.source_lang || "cni")}">${escapeHTML(example.source_text)}</span>
            <span class="example-translation" lang="${escapeHTML(example.translation_lang || "es")}">${escapeHTML(example.translation_text)}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function ImageBlock(entry, sense) {
  const images = sense.illustrations || [];
  if (!images.length) return "";

  return `
    <section class="section-block">
      <div class="stack">
        ${images.map((image) => `
          <figure class="visual visual-sense">
            <img src="${fileURL(image.file)}" alt="${escapeHTML(senseText(sense) || entryTitle(entry) || "imagen")}">
          </figure>
        `).join("")}
      </div>
    </section>
  `;
}

function SenseBlock(entry, sense, index) {
  const hasManySenses = (entry.senses || []).length > 1;
  const number = index + 1;
  const text = senseText(sense);

  return `
    <section class="sense">
      <div class="sense-translation-row${hasManySenses ? " has-number" : ""}">
        ${hasManySenses ? `<div class="sense-index">${number})</div>` : ""}
        <div class="sense-body">
          ${text ? `<div class="sense-translation">${escapeHTML(text)}</div>` : ""}
          ${SenseNotes(sense)}
        </div>
      </div>
      ${ImageBlock(entry, sense)}
      ${ExamplesBox(sense)}
    </section>
  `;
}

function EtymologyBlock(entry) {
  if (!entry.etymology) return "";
  const fields = entry.etymology.fields || [];

  return `
    <section class="box">
      <h3 class="box-title">Etimología</h3>
      <div class="stack">
        <div class="note-row">
          ${Badge(entry.etymology.type || "etymology")}
          <span>${escapeHTML(entry.etymology.source || "")}</span>
        </div>
        ${fields.map((field) => `
          <div class="note-row">
            ${Badge(field.type || field.tag)}
            ${field.lang ? `<span class="tiny-label">${escapeHTML(field.lang)}</span>` : ""}
            <span>${escapeHTML(field.text || "")}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function EntryModal(entry) {
  const senses = (entry.senses || []).map((sense, index) => SenseBlock(entry, sense, index)).join("");
  const tags = DomainBadges(entry);

  return `
    ${ModalHeader(entry)}
    <div class="modal-body">
      ${senses || `<div class="value muted">Sin sentidos visibles.</div>`}
      ${EtymologyBlock(entry)}
    </div>
    ${tags ? `<div class="modal-tags-footer">${tags}</div>` : ""}
  `;
}

// ------------------------------------------------------------
// 4. Render de la pagina
// ------------------------------------------------------------
// Render significa "dibujar de nuevo" segun el estado actual.

function renderStats() {
  const entries = allEntries();
  const stats = [
    `entradas ${entries.length}`,
    `ejemplos ${entries.reduce((sum, entry) => sum + entryExampleCount(entry), 0)}`,
    `imágenes ${entries.reduce((sum, entry) => sum + entryImageCount(entry), 0)}`,
    `notas ${entries.reduce((sum, entry) => sum + entryNoteCount(entry), 0)}`,
  ];

  get("stats").innerHTML = stats.map((text) => `<span class="stat">${escapeHTML(text)}</span>`).join("");
}

function renderList() {
  const selectedId = location.hash.slice(1);
  const entries = filteredEntries().sort((a, b) =>
    normalize(entryTitle(a)).localeCompare(normalize(entryTitle(b)), "es")
  );

  if (!entries.length) {
    get("entry-list").innerHTML = `<div class="empty-state">No se encontraron entradas.</div>`;
    return;
  }

  get("entry-list").innerHTML = entries
    .map((entry) => EntryCard(entry, selectedId === entry.id || selectedId === entry.entry_id))
    .join("");
}

function findSelectedEntry() {
  const id = location.hash.slice(1);
  if (!id) return null;
  return allEntries().find((entry) => entry.id === id || entry.entry_id === id) || null;
}

function renderModal() {
  const entry = findSelectedEntry();
  const modalContent = get("modal-content");
  const backdrop = get("modal-backdrop");

  if (!entry) {
    modalContent.innerHTML = "";
    backdrop.classList.remove("is-open");
    backdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    return;
  }

  modalContent.innerHTML = EntryModal(entry);
  backdrop.classList.add("is-open");
  backdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function render() {
  renderStats();
  renderList();
  renderModal();
}

// ------------------------------------------------------------
// 5. Acciones del usuario
// ------------------------------------------------------------
// Eventos: escribir, hacer click, cerrar modal, tocar Escape.

function openEntry(id) {
  location.hash = `#${id}`;
}

function closeEntry() {
  const audio = get("modal-audio");
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }

  history.replaceState(null, "", location.pathname + location.search);
  render();
}

function toggleAudio() {
  const audio = get("modal-audio");
  if (!audio) return;

  if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
}

function setupEvents() {
  get("search").addEventListener("input", (event) => {
    searchText = event.target.value;
    renderList();
  });

  get("entry-list").addEventListener("click", (event) => {
    const card = event.target.closest("[data-id]");
    if (card) openEntry(card.dataset.id);
  });

  get("modal-close").addEventListener("click", closeEntry);

  get("modal-backdrop").addEventListener("click", (event) => {
    if (event.target.id === "modal-backdrop") closeEntry();
    if (event.target.id === "modal-audio-btn") toggleAudio();
  });

  window.addEventListener("hashchange", render);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && get("modal-backdrop").classList.contains("is-open")) {
      closeEntry();
    }
  });
}

// ------------------------------------------------------------
// 6. Inicio
// ------------------------------------------------------------

function init() {
  if (!window.CORPUS_DATA) {
    get("entry-list").innerHTML = `<div class="empty-state">No se pudo cargar corpus-data.js.</div>`;
    return;
  }

  corpus = window.CORPUS_DATA;
  setupEvents();
  render();
}

init();
