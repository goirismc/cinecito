import os
import subprocess
import threading
from threading import Lock
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config["SECRET_KEY"] = "cinnamoroll-secret"

# Usamos gevent para WebSocket estable
socketio = SocketIO(
    app,
    async_mode="gevent",
    cors_allowed_origins="*"
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

video_lock = Lock()

# Ruta absoluta a ffmpeg en Windows
FFMPEG_PATH = r"C:\ffmpeg\bin\ffmpeg.exe"

def convert_video(filepath, converted_path):
    """Conversión en segundo plano con preset ultrafast"""
    try:
        subprocess.run([
            FFMPEG_PATH, "-y", "-i", filepath,
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac", converted_path
        ], check=True)
        final_url = f"/uploads/{os.path.basename(converted_path)}"
        print("Conversión terminada:", final_url)
        socketio.emit("new_video", {"url": final_url})
    except Exception as e:
        print("Error en conversión:", e)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    with video_lock:
        file = request.files.get("video")
        if not file:
            return jsonify({"error": "No file"}), 400

        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        # Lanzamos conversión en segundo plano
        converted_filename = "converted_" + filename
        converted_path = os.path.join(UPLOAD_FOLDER, converted_filename)
        threading.Thread(target=convert_video, args=(filepath, converted_path)).start()

        # Respondemos de inmediato con el original
        final_url = f"/uploads/{filename}"
        socketio.emit("new_video", {"url": final_url})
        return jsonify({"url": final_url})

@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename, mimetype="video/mp4")

@socketio.on("video_event")
def handle_video_event(data):
    socketio.emit("video_event", data, include_self=False)

@socketio.on("chat_message")
def handle_chat_message(msg):
    socketio.emit("chat_message", msg)

if __name__ == "__main__":
    # Con gevent no hace falta monkey_patch manual
    socketio.run(app, host="0.0.0.0", port=5000)