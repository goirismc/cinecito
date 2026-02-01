// Conexión (forzar websocket para menor latencia)
const socket = io({ transports: ["websocket"] });

// Referencias a elementos (diseño intacto)
const video = document.getElementById("video");
const uploadInput = document.getElementById("uploadVideo");
const chatBox = document.getElementById("chat");
const messageInput = document.getElementById("message");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const status = document.getElementById("status");

// Estado de conexión
socket.on("connect", () => {
  status.textContent = "☁️ Conectado 💙";
});
socket.on("disconnect", () => {
  status.textContent = "⚠️ Desconectado";
});

// --- Subir video con feedback visual ---
// Para pruebas rápidas: descomentar formData.append("no_convert","1")
uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("video", file);
  // formData.append("no_convert", "1"); // descomentar para respuesta inmediata en pruebas

  status.textContent = "☁️ Subiendo peli…";

  try {
    const res = await fetch("/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (data.url) {
      video.src = data.url;
      status.textContent = "☁️ Peli lista para ver juntitos 💙";
    } else {
      status.textContent = "❌ Error al subir la peli";
    }
  } catch (err) {
    status.textContent = "❌ Error de conexión";
  }
});

// --- Control de emisión y prevención de loops ---
let suppressEmit = false; // true cuando aplicamos un evento remoto
let seekDebounce = null;

// Emitir play/pause desde controles personalizados
function playVideo() {
  if (!suppressEmit) socket.emit("video_event", { action: "play", time: video.currentTime });
  animateButton("▶︎");
  video.play();
}

function pauseVideo() {
  if (!suppressEmit) socket.emit("video_event", { action: "pause", time: video.currentTime });
  animateButton("❚❚");
  video.pause();
}

// Si el usuario usa los controles nativos, capturamos y emitimos
video.addEventListener("play", () => {
  if (!suppressEmit) socket.emit("video_event", { action: "play", time: video.currentTime });
});
video.addEventListener("pause", () => {
  if (!suppressEmit) socket.emit("video_event", { action: "pause", time: video.currentTime });
});

// Fullscreen (diseño intacto)
fullscreenBtn.addEventListener("click", () => {
  if (video.requestFullscreen) video.requestFullscreen();
});

// Emitir seek con debounce para no spamear
video.addEventListener("seeking", () => {
  if (seekDebounce) clearTimeout(seekDebounce);
  seekDebounce = setTimeout(() => {
    if (!suppressEmit) socket.emit("video_event", { action: "seek", time: video.currentTime });
    seekDebounce = null;
  }, 150);
});

// --- Aplicar tiempo de forma segura (esperar metadata si hace falta) ---
function applyTimeSafely(t, cb) {
  if (isNaN(t)) { if (cb) cb(); return; }
  if (video.readyState >= 1) {
    try { video.currentTime = t; } catch (e) { /* ignore */ }
    if (cb) cb();
  } else {
    video.addEventListener("loadedmetadata", function once() {
      try { video.currentTime = t; } catch (e) { /* ignore */ }
      if (cb) cb();
    }, { once: true });
  }
}

// --- Recibir eventos de video (sincronización incluida) ---
socket.on("video_event", (data) => {
  // Protegemos para no reemitir lo que aplicamos
  suppressEmit = true;

  if (data.action === "play") {
    applyTimeSafely(data.time, () => video.play());
  } else if (data.action === "pause") {
    applyTimeSafely(data.time, () => video.pause());
  } else if (data.action === "seek") {
    applyTimeSafely(data.time);
  }

  // Pequeña espera para evitar eco de eventos
  setTimeout(() => { suppressEmit = false; }, 250);
});

// --- Chat (diseño y animación intactos) ---
function sendMessage() {
  const msg = messageInput.value.trim();
  if (msg) {
    socket.emit("chat_message", msg);
    messageInput.value = "";
  }
}

socket.on("chat_message", (msg) => {
  const p = document.createElement("p");
  p.textContent = msg;
  p.classList.add("chat-msg");
  chatBox.appendChild(p);

  // Animación suave
  p.style.opacity = 0;
  setTimeout(() => (p.style.opacity = 1), 50);
});

// --- Animación de botones (mantener diseño) ---
function animateButton(symbol) {
  const btn = document.createElement("div");
  btn.textContent = symbol;
  btn.className = "btn-float";
  document.body.appendChild(btn);
  setTimeout(() => btn.remove(), 800);
}

// --- Cuando alguien sube una peli, todos la reciben (diseño intacto) ---
socket.on("new_video", (data) => {
  // Si ya hay la misma URL, no recargamos; si es distinta, cargamos y mostramos estado
  if (data && data.url && video.src !== data.url) {
    video.src = data.url;
    status.textContent = "☁️ Peli lista para ver juntitos 💙";
  }
});