import socket
import os
import json
from flask import Flask, send_from_directory, request, jsonify

app = Flask(__name__, static_folder='.', static_url_path='')

DATABASE_FILE = os.getenv('DATABASE_PATH', 'database.json')

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    if not os.path.exists(DATABASE_FILE):
        return jsonify({"status": "empty"})
    try:
        with open(DATABASE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/data', methods=['POST'])
def save_data():
    try:
        data = request.json
        with open(DATABASE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/log-error', methods=['POST'])
def log_error():
    err_data = request.json
    print("\n" + "!"*40)
    print(" BROWSER CLIENT ERROR DETECTED:")
    print(f" Message: {err_data.get('message')}")
    print(f" Source: {err_data.get('source')}")
    print(f" Line: {err_data.get('lineno')}, Col: {err_data.get('colno')}")
    print(f" Stack: {err_data.get('error')}")
    print("!"*40 + "\n")
    return jsonify({"status": "ok"})

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

def get_ip_address():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

if __name__ == '__main__':
    local_ip = get_ip_address()
    print("=" * 60)
    print(" STARTING LEARNING PWA FLASK SERVER ")
    print("=" * 60)
    print(f" -> Localhost: http://localhost:5000")
    print(f" -> Network (Wi-Fi): http://{local_ip}:5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
