export const PI_SERVER_PYTHON = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Celestron NexStar 127SLT Raspberry Pi WebSocket / REST Control Daemon
====================================================================
支持星特朗 NexStar 127SLT / SE / Evolution / CPC / LCM 等系列望远镜。
通过树莓派 USB 串口 (如 /dev/ttyUSB0 或 /dev/ttyACM0) 通信，并提供高频 WebSocket 遥测与 Web 控制接口。

安装依赖:
    pip3 install fastapi uvicorn pyserial websockets
运行:
    python3 celestron_pi_server.py --port 8000 --serial /dev/ttyUSB0
"""

import sys
import time
import glob
import asyncio
import argparse
import serial
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Celestron NexStar 127SLT Pi Bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TelescopeDriver:
    def __init__(self, port_pattern="/dev/ttyUSB*", baudrate=9600):
        self.port_pattern = port_pattern
        self.baudrate = baudrate
        self.ser = None
        self.lock = asyncio.Lock()
        self.model_name = "Celestron NexStar 127SLT"
        self.version = "Unknown"
        self.is_connected = False
        self.last_ra = 0.0
        self.last_dec = 0.0
        self.last_alt = 45.0
        self.last_az = 180.0
        self.is_slewing = False
        self.tracking_mode = "alt_az"

    def find_serial_port(self):
        # Scan common USB serial devices on Raspberry Pi
        candidates = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*') + glob.glob('/dev/serial/by-id/*')
        if candidates:
            return candidates[0]
        return None

    def connect(self):
        port = self.find_serial_port()
        if not port:
            print("[WARN] 未检测到星特朗望远镜串口，请检查USB线缆连接 (或NexStar手柄已通电)")
            return False
        try:
            self.ser = serial.Serial(
                port=port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1.0
            )
            self.is_connected = True
            print(f"[OK] 成功连接星特朗望远镜于串口: {port} (Baud: {self.baudrate})")
            
            # Query firmware version
            self.write_raw(b'V')
            resp = self.read_until_hash()
            if len(resp) >= 2:
                self.version = f"NexStar Hand Controller v{resp[0]}.{resp[1]}"
            return True
        except Exception as e:
            print(f"[ERR] 串口打开失败: {e}")
            self.is_connected = False
            return False

    def write_raw(self, data: bytes):
        if self.ser and self.ser.is_open:
            self.ser.write(data)
            self.ser.flush()

    def read_until_hash(self, timeout=2.0) -> bytes:
        if not self.ser or not self.ser.is_open:
            return b""
        start = time.time()
        buf = bytearray()
        while time.time() - start < timeout:
            if self.ser.in_waiting:
                ch = self.ser.read(1)
                if ch == b'#':
                    return bytes(buf)
                buf.extend(ch)
            else:
                time.sleep(0.01)
        return bytes(buf)

    async def get_ra_dec(self):
        async with self.lock:
            if not self.is_connected or not self.ser:
                return self.last_ra, self.last_dec
            try:
                # 'e' command returns 16-bit RA/Dec: '34AB,12CE#'
                self.write_raw(b'e')
                resp = self.read_until_hash()
                text = resp.decode('ascii', errors='ignore')
                if ',' in text:
                    parts = text.split(',')
                    ra_raw = int(parts[0], 16)
                    dec_raw = int(parts[1], 16)
                    self.last_ra = (ra_raw / 0x10000) * 24.0 # Hours
                    self.last_dec = (dec_raw / 0x10000) * 360.0
                    if self.last_dec > 180:
                        self.last_dec -= 360.0
            except Exception as e:
                pass
            return self.last_ra, self.last_dec

    async def goto_ra_dec(self, ra_hours: float, dec_deg: float):
        async with self.lock:
            # 32-bit Goto RA/Dec command: R<RA_HEX>,<DEC_HEX>
            ra_norm = ((ra_hours % 24) + 24) % 24
            ra_val = int((ra_norm / 24.0) * 0x100000000)
            dec_norm = ((dec_deg % 360) + 360) % 360
            dec_val = int((dec_norm / 360.0) * 0x100000000)
            
            cmd = f"R{ra_val:08X},{dec_val:08X}".encode('ascii')
            self.write_raw(cmd)
            self.read_until_hash()
            self.is_slewing = True

    async def abort_slew(self):
        async with self.lock:
            # 'M' command cancels GoTo
            self.write_raw(b'M')
            self.read_until_hash()
            # Stop motors
            self.write_raw(b'P\\x03\\x10\\x24\\x00\\x00\\x00\\x00')
            self.write_raw(b'P\\x03\\x11\\x24\\x00\\x00\\x00\\x00')
            self.is_slewing = False

    async def manual_slew(self, axis: str, direction: int, rate: int):
        async with self.lock:
            # axis: 'az' (16) or 'alt' (17)
            # dir: 36 (+) or 37 (-)
            dev = 0x10 if axis == 'az' else 0x11
            d_cmd = 0x24 if direction > 0 else 0x25
            r_byte = max(0, min(9, rate))
            packet = bytes([ord('P'), 3, dev, d_cmd, r_byte, 0, 0, 0])
            self.write_raw(packet)
            self.read_until_hash()

    async def check_slewing(self):
        async with self.lock:
            self.write_raw(b'L')
            resp = self.read_until_hash()
            self.is_slewing = (resp == b'1')
            return self.is_slewing

driver = TelescopeDriver()

class SlewRequest(BaseModel):
    direction: str # 'N', 'S', 'E', 'W', 'STOP'
    rate: int = 5

class GotoRequest(BaseModel):
    ra: float
    dec: float
    target_name: str = "Target"

active_websockets: Set[WebSocket] = set()

@app.on_event("startup")
async def startup_event():
    driver.connect()
    asyncio.create_task(telemetry_loop())

async def telemetry_loop():
    while True:
        try:
            if not driver.is_connected:
                driver.connect()
            else:
                ra, dec = await driver.get_ra_dec()
                is_slewing = await driver.check_slewing()
                payload = {
                    "type": "telemetry",
                    "ra": ra,
                    "dec": dec,
                    "isSlewing": is_slewing,
                    "model": driver.model_name,
                    "version": driver.version,
                    "trackingMode": driver.tracking_mode,
                    "timestamp": time.time(),
                    "ping": 8
                }
                for ws in list(active_websockets):
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        active_websockets.discard(ws)
        except Exception as e:
            pass
        await asyncio.sleep(0.2)

@app.get("/api/status")
async def get_status():
    return {
        "connected": driver.is_connected,
        "model": driver.model_name,
        "version": driver.version,
        "ra": driver.last_ra,
        "dec": driver.last_dec,
        "isSlewing": driver.is_slewing
    }

@app.post("/api/goto")
async def goto_target(req: GotoRequest):
    await driver.goto_ra_dec(req.ra, req.dec)
    return {"status": "ok", "target": req.target_name}

@app.post("/api/stop")
async def stop_telescope():
    await driver.abort_slew()
    return {"status": "stopped"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            cmd_type = data.get("type")
            if cmd_type == "goto":
                await driver.goto_ra_dec(data["ra"], data["dec"])
            elif cmd_type == "stop":
                await driver.abort_slew()
            elif cmd_type == "slew":
                direction = data.get("direction")
                rate = data.get("rate", 5)
                if direction == "N":
                    await driver.manual_slew('alt', 1, rate)
                elif direction == "S":
                    await driver.manual_slew('alt', -1, rate)
                elif direction == "W":
                    await driver.manual_slew('az', 1, rate)
                elif direction == "E":
                    await driver.manual_slew('az', -1, rate)
                elif direction in ["STOP_N_S", "STOP"]:
                    await driver.manual_slew('alt', 1, 0)
                elif direction in ["STOP_E_W", "STOP"]:
                    await driver.manual_slew('az', 1, 0)
    except WebSocketDisconnect:
        active_websockets.discard(websocket)

if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description="Celestron NexStar Pi Bridge")
    parser.add_argument("--host", default="0.0.0.0", help="Listen host")
    parser.add_argument("--port", type=int, default=8000, help="Listen port")
    args = parser.parse_args()
    print(f"Starting Celestron 127SLT daemon on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)
`;

export const SYSTEMD_SERVICE_FILE = `[Unit]
Description=Celestron NexStar 127SLT Raspberry Pi Auto-GoTo Daemon
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/celestron
ExecStart=/usr/bin/python3 /home/pi/celestron/celestron_pi_server.py --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

export const SETUP_BASH_SCRIPT = `#!/usr/bin/env bash
# ==================================================================
# 树莓派 Celestron 127SLT 自动寻星后台服务一键安装脚本
# ==================================================================
set -e

echo "🌟 开始部署星特朗 127SLT 树莓派自动寻星服务..."

# 1. 更新包列表并安装 Python 串口及网络依赖
sudo apt update
sudo apt install -y python3 python3-pip python3-serial

# 2. 安装 FastAPI 与 Uvicorn
pip3 install fastapi uvicorn pyserial websockets --break-system-packages || pip3 install fastapi uvicorn pyserial websockets

# 3. 将当前用户加入 dialout 串口访问权限组
sudo usermod -a -G dialout $USER

# 4. 创建工作目录
mkdir -p /home/$USER/celestron

# 5. 写入主服务文件
cat << 'EOF' > /home/$USER/celestron/celestron_pi_server.py
${PI_SERVER_PYTHON}
EOF

# 6. 配置 systemd 守护进程开机自启
sudo bash -c 'cat << EOF > /etc/systemd/system/celestron.service
[Unit]
Description=Celestron NexStar 127SLT Raspberry Pi Auto-GoTo Daemon
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/celestron
ExecStart=/usr/bin/python3 /home/$USER/celestron/celestron_pi_server.py --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF'

# 7. 重载并启动服务
sudo systemctl daemon-reload
sudo systemctl enable celestron.service
sudo systemctl restart celestron.service

echo "✅ 部署完成！"
echo "望远镜服务已开机自启，本地测试访问: http://localhost:8000/api/status"
echo "局域网内任意手机/电脑打开本控制台，输入树莓派IP即可无缝连接！"
`;

export const HARDWARE_WIRING_GUIDE = {
  title: '星特朗 127SLT 与树莓派物理连接接线指南',
  sections: [
    {
      heading: '1. 望远镜手柄接口类型确认',
      content:
        '星特朗 NexStar 127SLT 配备带有 LCD 屏的 NexStar+ 或经典手柄。请检查手柄底部的通信端口：\n' +
        '• 新版 NexStar+ 手柄：底部为标准 Mini-USB 或 Micro-USB 接口，只需一根普通 USB 数据线直接插入树莓派 USB 口即可（自带 FTDI/Prolific USB 转串口芯片，即插即用）。\n' +
        '• 早期版 NexStar 手柄：底部为 RJ12 (6P4C) 类似电话线接口，需要一根星特朗专用 RJ12 转 RS-232 串口线，配合 USB 转 RS232 (FTDI芯片) 转换器接入树莓派。',
    },
    {
      heading: '2. 早期 RJ12 6P4C 自制串口线线序 (如需自制)',
      content:
        'RJ12 插头引脚定义 (卡扣朝下，金手指朝上，从左到右 1-6 引脚)：\n' +
        '• Pin 1: 未使用\n' +
        '• Pin 2: 地线 GND (连接至树莓派 USB 转串口 GND)\n' +
        '• Pin 4: 望远镜数据接收 RX (连接至转换器 TXD)\n' +
        '• Pin 5: 望远镜数据发送 TX (连接至转换器 RXD)\n' +
        '• Pin 3 & Pin 6: 未连接',
    },
    {
      heading: '3. 树莓派野外无公网 / 无路由器热点配置 (AP Mode)',
      content:
        '在野外观星（如无家庭 Wi-Fi 时），可将树莓派配置为 Wi-Fi 热点：\n' +
        '1. 运行 `sudo raspi-config` -> Advanced Options -> Network Config -> AP Mode，或使用 `nmcli` 创建热点：\n' +
        '   `sudo nmcli dev wifi hotspot ifname wlan0 ssid Celestron-127SLT password "astronomy888"`\n' +
        '2. 手机或平板直接连接该 Wi-Fi 热点，浏览器打开控制台输入 `192.168.4.1:8000` 即可在野外荒原畅享全自动寻星！',
    },
  ],
};
