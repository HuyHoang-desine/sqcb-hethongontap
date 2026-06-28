import socket
import os
import json
from flask import Flask, send_from_directory, request, jsonify, send_file, render_template_string

app = Flask(__name__, static_folder='.', static_url_path='')

DATABASE_FILE = os.getenv('DATABASE_PATH', 'database.json')

@app.before_request
def block_browsers():
    # Cho phép truy cập bình thường tới route tải phần mềm
    if request.path == '/download/app':
        return None
        
    user_agent = request.headers.get('User-Agent', '')
    # Nếu không phải yêu cầu từ ứng dụng Desktop App, chặn truy cập và hiển thị trang thông báo tải app
    if "SmartStudyDesktopApp" not in user_agent:
        blocked_html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Trường SQCB - Yêu cầu tải ứng dụng</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body {
                    background-color: #0b0f19;
                    color: #f1f5f9;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    text-align: center;
                }
                .card {
                    background: rgba(30, 41, 59, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    padding: 40px;
                    border-radius: 24px;
                    backdrop-filter: blur(12px);
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                    max-width: 500px;
                }
                .icon {
                    font-size: 4rem;
                    margin-bottom: 20px;
                }
                h1 { color: #f59e0b; margin-top: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: 0.5px; }
                p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 10px 0 20px 0; }
                .btn {
                    display: inline-block;
                    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                    color: white;
                    padding: 12px 32px;
                    border-radius: 50px;
                    text-decoration: none;
                    font-weight: 700;
                    font-size: 14px;
                    box-shadow: 0 10px 15px -3px rgba(37,99,235,0.3);
                    transition: transform 0.2s;
                }
                .btn:hover {
                    transform: translateY(-2px);
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">⚠️</div>
                <h1>HỆ THỐNG ĐÃ CHUYỂN SANG PHẦN MỀM</h1>
                <p>Hệ thống ôn tập và thi thử của <strong>Trường Sĩ quan Công binh</strong> đã chuyển sang phiên bản phần mềm máy tính và ngừng hỗ trợ truy cập bằng trình duyệt web thông thường.</p>
                <p>Vui lòng tải xuống phần mềm <strong>SmartStudy.exe</strong> dưới đây để tiếp tục sử dụng ứng dụng.</p>
                <a href="/download/app" class="btn">Tải xuống Phần mềm (.EXE)</a>
            </div>
        </body>
        </html>
        """
        return render_template_string(blocked_html), 403

@app.route('/download/app')
def download_app():
    exe_file = "SmartStudy.exe"
    if os.path.exists(exe_file):
        return send_file(exe_file, as_attachment=True)
    else:
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Lỗi tải xuống</title>
            <meta charset="utf-8">
            <style>
                body { background-color: #0b0f19; color: #94a3b8; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .box { border: 1px solid rgba(255,255,255,0.1); padding: 30px; border-radius: 12px; background: rgba(30,41,59,0.3); max-width: 450px; text-align: center; }
                h2 { color: #f87171; }
            </style>
        </head>
        <body>
            <div class="box">
                <h2>⚠️ File cài đặt chưa được tải lên</h2>
                <p>File phần mềm <strong>SmartStudy.exe</strong> chưa được đưa lên máy chủ hoặc link tải trực tiếp chưa khả dụng.</p>
                <p>Vui lòng liên hệ Ban quản trị để nhận file cài đặt ứng dụng trực tiếp qua USB, Zalo hoặc ổ đĩa dùng chung.</p>
            </div>
        </body>
        </html>
        """, 404

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
