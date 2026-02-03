import os
import subprocess
import threading
from threading import Lock
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO
from werkzeug.utils import secure_filename
from flask_sqlalchemy import SQLAlchemy  # 🔑 agregado

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "default-secret")

# Configuración de Postgres en Render
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
db = SQLAlchemy(app)

# Modelo de Pelis
class Movie(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120))
    url = db.Column(db.String(200))
    uploaded_by = db.Column(db.String(80))

# Modelo de Notitas
class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.String(500))
    author = db.Column(db.String(80))

# Usamos gevent para WebSocket estable
socketio = SocketIO(
    app,
    async_mode="gevent",
    cors_allowed_origins="*"
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

video_lock = Lock()

# Ruta absoluta a ffmpeg en Render/Linux
FFMPEG_PATH = "ffmpeg"

def convert_video(filepath, converted_path):
    """Versión rápida: transmuxing (sin recodificar)"""
    try:
        cmd = [
            FFMPEG_PATH, "-y", "-i", filepath,
            "-c:v", "copy", "-c:a", "copy", converted_path
        ]
        process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)

        def wait_and_emit():
            process.wait()
            final_url = f"/uploads/{os.path.basename(converted_path)}"
            print("Conversión rápida terminada:", final_url)
            socketio.emit("new_video", {"url": final_url})

            # Solución: abrir contexto de aplicación
            with app.app_context():
                movie = Movie(title=os.path.basename(converted_path), url=final_url, uploaded_by="Juan")
                db.session.add(movie)
                db.session.commit()

        threading.Thread(target=wait_and_emit).start()

    except Exception as e:
        print("Error en conversión rápida:", e)

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

        # Lanzamos conversión rápida en segundo plano
        converted_filename = "converted_" + os.path.splitext(filename)[0] + ".mp4"
        converted_path = os.path.join(UPLOAD_FOLDER, converted_filename)
        threading.Thread(target=convert_video, args=(filepath, converted_path)).start()

        # Respondemos de inmediato con el original
        final_url = f"/uploads/{filename}"
        socketio.emit("new_video", {"url": final_url})

        # Guardar original en la base
        movie = Movie(title=filename, url=final_url, uploaded_by="Juan")
        db.session.add(movie)
        db.session.commit()

        return jsonify({"url": final_url})

@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename, mimetype="video/mp4")

@app.route("/movies")
def movies():
    movies = Movie.query.all()
    return jsonify([{"title": m.title, "url": m.url} for m in movies])

@app.route("/notes")
def notes():
    notes = Note.query.all()
    return jsonify([{"content": n.content, "author": n.author} for n in notes])

@socketio.on("video_event")
def handle_video_event(data):
    socketio.emit("video_event", data, include_self=False)

@socketio.on("chat_message")
def handle_chat_message(msg):
    socketio.emit("chat_message", msg)

    # Guardar notita en la base
    with app.app_context():
        note = Note(content=msg, author="Juan")
        db.session.add(note)
        db.session.commit()

if __name__ == "__main__":
    # Con gevent no hace falta monkey_patch manual
    with app.app_context():
        db.create_all()  # 🔑 crea las tablas si no existen
    socketio.run(app, host="0.0.0.0", port=5000)