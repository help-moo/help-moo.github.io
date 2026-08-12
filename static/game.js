// ============================================================
// Juego del glosario
// ------------------------------------------------------------
// Prototipo simple:
// - No tiene preguntas escritas a mano.
// - Elige una entrada del corpus.
// - Arma la pregunta segun el modo elegido.
// - Guarda un puntaje basico en localStorage.
// ============================================================

let corpus = null;
let mode = "ash-es";
let currentQuestion = null;
let attemptsLeft = 3;
let hintLetters = 0;

const SCORE_KEY = "ashaninka-game-score-v1";

const get = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAnswer(value) {
  // Hacemos la correccion flexible: sin tildes, sin mayusculas y sin signos finales.
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fileURL(path) {
  return encodeURI(`./${path}`);
}

function allEntries() {
  return corpus?.entries || [];
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function senseText(sense) {
  return sense.reversal || sense.definition || sense.gloss || "";
}

function spanishAnswers(entry) {
  // Una entrada puede tener varios sentidos. Aceptamos todos como posibles respuestas.
  const answers = (entry.senses || []).flatMap((sense) => splitSpanishAnswer(senseText(sense)));
  return [...new Set(answers.map(normalizeAnswer).filter(Boolean))];
}

function splitSpanishAnswer(text) {
  if (!text) return [];

  const withoutParentheses = text.replace(/\([^)]*\)/g, "").trim();
  const parts = text
    .split(/[,;/]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return [text, withoutParentheses, ...parts].filter(Boolean);
}

function firstSpanishText(entry) {
  return (entry.senses || []).map(senseText).find(Boolean) || "";
}

function firstImage(entry) {
  for (const sense of entry.senses || []) {
    const image = (sense.illustrations || [])[0];
    if (image?.file) return image.file;
  }
  return "";
}

function entriesForCurrentMode() {
  if (mode === "image-ash") {
    return allEntries().filter(firstImage);
  }

  if (mode === "audio-ash") {
    return allEntries().filter((entry) => entry.audio);
  }

  return allEntries().filter((entry) => entry.headword && spanishAnswers(entry).length);
}

function buildQuestion(entry) {
  if (mode === "ash-es") {
    return {
      entry,
      prompt: entry.headword,
      answers: spanishAnswers(entry),
      visibleAnswer: firstSpanishText(entry),
      media: "",
    };
  }

  if (mode === "es-ash") {
    return {
      entry,
      prompt: firstSpanishText(entry),
      answers: [normalizeAnswer(entry.headword)],
      visibleAnswer: entry.headword,
      media: "",
    };
  }

  if (mode === "audio-ash") {
    return {
      entry,
      prompt: "Escucha el audio y escribe la palabra en asháninka.",
      answers: [normalizeAnswer(entry.headword)],
      visibleAnswer: entry.headword,
      media: `<audio class="game-audio" controls preload="none" src="${fileURL(entry.audio)}"></audio>`,
    };
  }

  return {
    entry,
    prompt: "Mira la imagen y escribe la palabra en asháninka.",
    answers: [normalizeAnswer(entry.headword)],
    visibleAnswer: entry.headword,
    media: `
      <figure class="game-image">
        <img src="${fileURL(firstImage(entry))}" alt="Imagen para adivinar la palabra">
      </figure>
    `,
  };
}

function newQuestion() {
  const validEntries = entriesForCurrentMode();

  if (!validEntries.length) {
    currentQuestion = null;
    get("question-prompt").textContent = "No hay entradas disponibles para este modo.";
    get("question-media").innerHTML = "";
    get("game-feedback").textContent = "";
    return;
  }

  attemptsLeft = 3;
  hintLetters = 0;
  currentQuestion = buildQuestion(randomItem(validEntries));

  get("question-prompt").textContent = currentQuestion.prompt;
  get("question-media").innerHTML = currentQuestion.media;
  get("answer").value = "";
  get("answer").disabled = false;
  get("game-feedback").textContent = "Tienes 3 intentos.";
  get("answer").focus();
}

function score() {
  const saved = localStorage.getItem(SCORE_KEY);
  if (!saved) return { played: 0, correct: 0, streak: 0, bestStreak: 0 };

  try {
    return JSON.parse(saved);
  } catch {
    return { played: 0, correct: 0, streak: 0, bestStreak: 0 };
  }
}

function saveScore(nextScore) {
  localStorage.setItem(SCORE_KEY, JSON.stringify(nextScore));
  renderScore();
}

function renderScore() {
  const data = score();
  get("game-score").innerHTML = `
    <span class="stat">jugadas ${data.played}</span>
    <span class="stat">aciertos ${data.correct}</span>
    <span class="stat">racha ${data.streak}</span>
    <span class="stat">mejor ${data.bestStreak}</span>
  `;
}

function finishQuestion(wasCorrect) {
  const data = score();
  const streak = wasCorrect ? data.streak + 1 : 0;

  saveScore({
    played: data.played + 1,
    correct: data.correct + (wasCorrect ? 1 : 0),
    streak,
    bestStreak: Math.max(data.bestStreak, streak),
  });

  get("answer").disabled = true;
}

function checkAnswer(userAnswer) {
  if (!currentQuestion) return;

  const answer = normalizeAnswer(userAnswer);
  const isCorrect = currentQuestion.answers.includes(answer);

  if (isCorrect) {
    get("game-feedback").innerHTML = `Correcto. Respuesta: <strong>${escapeHTML(currentQuestion.visibleAnswer)}</strong>.`;
    finishQuestion(true);
    return;
  }

  attemptsLeft -= 1;
  hintLetters += 1;

  if (attemptsLeft <= 0) {
    get("game-feedback").innerHTML = `No era. Respuesta: <strong>${escapeHTML(currentQuestion.visibleAnswer)}</strong>.`;
    finishQuestion(false);
    return;
  }

  get("game-feedback").innerHTML = `Intenta otra vez. Quedan ${attemptsLeft}. Pista: <strong>${escapeHTML(currentHint())}</strong>`;
}

function currentHint() {
  const answer = currentQuestion?.visibleAnswer || "";
  const clean = answer.replace(/\([^)]*\)/g, "").trim() || answer;
  const shown = clean.slice(0, hintLetters);
  const hidden = clean.slice(hintLetters).replace(/[^\s]/g, "_");
  return shown + hidden;
}

function setMode(nextMode) {
  mode = nextMode;

  document.querySelectorAll(".mode-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  newQuestion();
}

function setupEvents() {
  get("answer-form").addEventListener("submit", (event) => {
    event.preventDefault();
    checkAnswer(get("answer").value);
  });

  get("next-btn").addEventListener("click", newQuestion);

  get("hint-btn").addEventListener("click", () => {
    if (!currentQuestion) return;
    hintLetters += 1;
    get("game-feedback").innerHTML = `Pista: <strong>${escapeHTML(currentHint())}</strong>`;
  });

  get("reset-score-btn").addEventListener("click", () => {
    localStorage.removeItem(SCORE_KEY);
    renderScore();
  });

  document.querySelectorAll(".mode-btn").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
}

function init() {
  if (!window.CORPUS_DATA) {
    get("question-prompt").textContent = "No se pudo cargar corpus-data.js.";
    return;
  }

  corpus = window.CORPUS_DATA;
  setupEvents();
  renderScore();
  newQuestion();
}

init();
