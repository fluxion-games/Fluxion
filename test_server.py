from flask import Flask, send_from_directory
import os

app = Flask(__name__)

@app.route("/")
def hello():
    return "Hello, please go to <a href='/games/sample-game.html'>/games/sample-game.html</a>"

@app.route('/games/<path:filename>')
def serve_game_file(filename):
    return send_from_directory('games', filename)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)