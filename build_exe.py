import os
import sys
import subprocess

def run_command(command):
    print(f"Running command: {' '.join(command)}")
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        print("Error during command execution:")
        print(result.stderr)
        return False
    print(result.stdout)
    return True

def build():
    print("=" * 60)
    print(" DONG GOI UNG DUNG DESKTOP (.EXE) CHO WINDOWS ")
    print("=" * 60)
    
    # 1. Kiểm tra và cài đặt pyinstaller
    print("[1/3] Kiem tra va cai dat PyInstaller...")
    try:
        import PyInstaller
        print("-> PyInstaller da duoc cai dat.")
    except ImportError:
        print("-> PyInstaller chua duoc cai dat. Dang tien hanh cai dat qua pip...")
        if not run_command([sys.executable, "-m", "pip", "install", "pyinstaller"]):
            print("Loi: Khong the cai dat PyInstaller. Vui long kiem tra ket noi internet.")
            return

    # 2. Chạy PyInstaller để đóng gói desktop_app.py
    print("\n[2/3] Dang dong goi ung dung bang PyInstaller (se mat 1-2 phut)...")
    build_cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--noconsole",
        "--name=SmartStudy",
        "desktop_app.py"
    ]
    
    if run_command(build_cmd):
        print("\n[3/3] Bien dich thanh cong!")
        exe_path = os.path.join("dist", "SmartStudy.exe")
        print(f"-> File ung dung da duoc tao tai: {os.path.abspath(exe_path)}")
        
        # Sao chép url.txt sang thư mục dist bên cạnh file .exe để tiện kiểm tra
        try:
            if os.path.exists("url.txt"):
                dist_dir = "dist"
                dest_file = os.path.join(dist_dir, "url.txt")
                with open("url.txt", "r", encoding="utf-8") as src, open(dest_file, "w", encoding="utf-8") as dst:
                    dst.write(src.read())
                print(f"-> Da sao chep file url.txt sang: {os.path.abspath(dest_file)}")
        except Exception as e:
            print(f"Loi khi copy url.txt: {e}")
            
        print("\n=> Ban co the gui file 'dist/SmartStudy.exe' va 'dist/url.txt' cho hoc vien.")
        print("Hoc vien chi can click dup vao SmartStudy.exe de vao hoc.")
    else:
        print("\nLoi: Bien dich that bai. Vui long xem log loi o tren.")

if __name__ == '__main__':
    build()
