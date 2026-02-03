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
uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("video", file);

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
let suppressEmit = false;
let seekDebounce = null;

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

video.addEventListener("play", () => {
  if (!suppressEmit) socket.emit("video_event", { action: "play", time: video.currentTime });
});
video.addEventListener("pause", () => {
  if (!suppressEmit) socket.emit("video_event", { action: "pause", time: video.currentTime });
});

fullscreenBtn.addEventListener("click", () => {
  if (video.requestFullscreen) video.requestFullscreen();
});

video.addEventListener("seeking", () => {
  if (seekDebounce) clearTimeout(seekDebounce);
  seekDebounce = setTimeout(() => {
    if (!suppressEmit) socket.emit("video_event", { action: "seek", time: video.currentTime });
    seekDebounce = null;
  }, 150);
});

function applyTimeSafely(t, cb) {
  if (isNaN(t)) { if (cb) cb(); return; }
  if (video.readyState >= 1) {
    try { video.currentTime = t; } catch (e) {}
    if (cb) cb();
  } else {
    video.addEventListener("loadedmetadata", function once() {
      try { video.currentTime = t; } catch (e) {}
      if (cb) cb();
    }, { once: true });
  }
}

socket.on("video_event", (data) => {
  suppressEmit = true;

  if (data.action === "play") {
    applyTimeSafely(data.time, () => video.play());
  } else if (data.action === "pause") {
    applyTimeSafely(data.time, () => video.pause());
  } else if (data.action === "seek") {
    applyTimeSafely(data.time);
  }

  setTimeout(() => { suppressEmit = false; }, 250);
});

// --- Chat persistente ---
function sendMessage() {
  const msg = messageInput.value.trim();
  if (msg) {
    socket.emit("chat_message", msg);
    messageInput.value = "";
  }
}

// Al cargar la página, traer historial de notitas
fetch("/notes")
  .then(res => res.json())
  .then(data => {
    const messagesList = document.getElementById("messages");
    data.forEach(n => {
      const li = document.createElement("li");
      li.textContent = `${n.author}: ${n.content}`;
      li.classList.add("chat-msg");
      messagesList.appendChild(li);
    });
  });

socket.on("chat_message", (msg) => {
  const messagesList = document.getElementById("messages");
  const li = document.createElement("li");
  li.textContent = `Juan: ${msg}`;
  li.classList.add("chat-msg");
  messagesList.appendChild(li);

  li.style.opacity = 0;
  setTimeout(() => (li.style.opacity = 1), 50);
});

// --- Animación de botones ---
function animateButton(symbol) {
  const btn = document.createElement("div");
  btn.textContent = symbol;
  btn.className = "btn-float";
  document.body.appendChild(btn);
  setTimeout(() => btn.remove(), 800);
}

// --- Cuando alguien sube una peli, todos la reciben ---
socket.on("new_video", (data) => {
  if (data && data.url && video.src !== data.url) {
    video.src = data.url;
    status.textContent = "☁️ Peli lista para ver juntitos 💙";
  }
});