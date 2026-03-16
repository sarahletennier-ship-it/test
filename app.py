from flask import Flask, send_from_directory


app = Flask(__name__, static_folder=".", static_url_path="")


@app.get("/")
def index():
    # Sert le même fichier que celui qu'on peut ouvrir en local.
    return send_from_directory(".", "index.html")


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    # Pour lancer en local: python app.py
    # Railway utilisera le Procfile.
    app.run(host="0.0.0.0", port=5000, debug=True)

