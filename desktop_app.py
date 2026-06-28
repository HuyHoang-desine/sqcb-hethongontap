import sys
import os
from PySide6.QtCore import QUrl
from PySide6.QtWidgets import QApplication, QMainWindow
from PySide6.QtGui import QIcon
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEngineSettings

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        # Xác định thư mục cơ sở (Base Directory) của ứng dụng
        if getattr(sys, 'frozen', False):
            # Đang chạy từ file .exe đã biên dịch
            base_dir = os.path.dirname(sys.executable)
        else:
            # Đang chạy từ script python thông thường
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        self.setWindowTitle("Hệ thống đề cương - Trường SQCB")
        self.resize(1100, 800)
        
        # Thiết lập Icon cho cửa sổ và Thanh tác vụ (Taskbar)
        icon_path = os.path.join(base_dir, "logo_sqcb.png")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
            
        # Tạo Web View để hiển thị ứng dụng
        self.web_view = QWebEngineView()
        
        # Thiết lập User Agent tùy chỉnh để vượt qua rào cản bảo mật trên server
        profile = self.web_view.page().profile()
        profile.setHttpUserAgent("SmartStudyDesktopApp/1.0")
        
        # Bật các cấu hình hỗ trợ Javascript, Local Storage
        settings = self.web_view.settings()
        settings.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)
            
        url_file = os.path.join(base_dir, "url.txt")
        target_url = "http://localhost:5000" # Mặc định
        
        # Tạo file url.txt mặc định nếu chưa tồn tại bên cạnh file chạy
        if not os.path.exists(url_file):
            try:
                with open(url_file, "w", encoding="utf-8") as f:
                    f.write("http://localhost:5000\n# Thay the dong tren bang link Railway cua ban.")
            except Exception as e:
                print(f"Không thể tạo file url.txt: {e}")
        
        try:
            with open(url_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                if lines:
                    configured_url = lines[0].strip()
                    if configured_url and not configured_url.startswith("#"):
                        target_url = configured_url
        except Exception as e:
            print(f"Lỗi khi đọc file url.txt: {e}")
                
        print(f"Đang kết nối tới máy chủ học tập tại: {target_url}")
        self.web_view.setUrl(QUrl(target_url))
        self.setCentralWidget(self.web_view)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
