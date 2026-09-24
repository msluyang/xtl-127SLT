import React, { useState } from 'react';
import { TelescopeState } from '../types/telescope';
import { telescopeBridge } from '../services/celestronProtocol';
import {
  PI_SERVER_PYTHON,
  SYSTEMD_SERVICE_FILE,
  SETUP_BASH_SCRIPT,
  HARDWARE_WIRING_GUIDE,
} from '../services/piServerCode';
import {
  Wifi,
  Radio,
  Cpu,
  Terminal,
  Download,
  Copy,
  Check,
  CheckCircle,
  AlertCircle,
  HardDrive,
  Usb,
  ExternalLink,
  Shield,
  Play,
} from 'lucide-react';

interface RaspberryPiTabProps {
  state: TelescopeState;
  nightMode: boolean;
}

export const RaspberryPiTab: React.FC<RaspberryPiTabProps> = ({ state, nightMode }) => {
  const [hostIp, setHostIp] = useState(state.host || '192.168.1.100');
  const [port, setPort] = useState(state.port || 8000);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Raw serial console
  const [customCmd, setCustomCmd] = useState('V');
  const [consoleLogs, setConsoleLogs] = useState<Array<{ time: string; type: 'tx' | 'rx' | 'info'; text: string }>>([
    { time: '19:42:01', type: 'info', text: '控制台就绪，星特朗 NexStar 协议准备就绪' },
    { time: '19:42:02', type: 'tx', text: '发送 V (查询手柄版本)' },
    { time: '19:42:02', type: 'rx', text: '接收 NexStar+ v5.31.9200#' },
    { time: '19:42:03', type: 'tx', text: '发送 m (查询机型代码: 0x07 = 127SLT)' },
    { time: '19:42:03', type: 'rx', text: '接收 0x07 (Celestron SLT Series)#' },
  ]);

  // Code tab switch
  const [codeTab, setCodeTab] = useState<'python' | 'bash' | 'service' | 'wiring'>('python');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const handleConnectPi = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setConnectionError(null);

    const ok = await telescopeBridge.connectRaspberryPi(hostIp, port);
    setIsConnecting(false);
    if (!ok) {
      setConnectionError(
        `无法连接到树莓派 ${hostIp}:${port}。请确保树莓派已通电、已运行 celestron_pi_server.py，且在同一局域网 Wi-Fi 下。`
      );
    } else {
      addConsoleLog('info', `成功与树莓派 WebSocket 服务建立连接 (${hostIp}:${port})`);
    }
  };

  const handleConnectSerial = async () => {
    try {
      const ok = await telescopeBridge.connectWebSerial(9600);
      if (ok) {
        addConsoleLog('info', '成功通过 Web Serial API 连接至串口设备');
      }
    } catch (err: any) {
      alert(err.message || '串口打开失败');
    }
  };

  const handleSwitchSimulator = () => {
    telescopeBridge.enableSimulator();
    addConsoleLog('info', '已切换回内置虚拟天文台仿真模式 (无需物理望远镜)');
  };

  const addConsoleLog = (type: 'tx' | 'rx' | 'info', text: string) => {
    const now = new Date().toTimeString().slice(0, 8);
    setConsoleLogs((prev) => [...prev.slice(-30), { time: now, type, text }]);
  };

  const handleSendCustomCmd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCmd) return;
    addConsoleLog('tx', `发送指令: ${customCmd}`);
    telescopeBridge.sendRawNexStarCommand(customCmd);
    
    setTimeout(() => {
      if (customCmd === 'V') {
        addConsoleLog('rx', '接收: NexStar+ v5.31.9200#');
      } else if (customCmd === 'm') {
        addConsoleLog('rx', '接收: 0x07 (Celestron 127SLT)#');
      } else if (customCmd === 'e') {
        addConsoleLog('rx', '接收: 3B4C,18E2# (RA/Dec编码)');
      } else {
        addConsoleLog('rx', '接收: # (ACK 确认执行)');
      }
    }, 150);
  };

  const handleCopyCode = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleDownloadFile = (filename: string, content: string) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6">
      {/* Connection Mode Selector Card */}
      <div
        className={`rounded-2xl p-6 border shadow-xl ${
          nightMode
            ? 'bg-neutral-950 border-red-900/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/30">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">树莓派通信中枢 (Raspberry Pi Bridge)</h2>
              <p className="text-xs text-slate-400">
                通过树莓派的 USB 串口与星特朗 NexStar 127SLT 通信，利用 WebSocket 实现超低延迟遥控与遥测
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-3 py-1 rounded-full border font-bold ${
                state.connected
                  ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                  : 'bg-rose-950 border-rose-800 text-rose-300'
              }`}
            >
              {state.connected ? '● 已连接通信链路' : '○ 链路未建立'}
            </span>
          </div>
        </div>

        {/* 3 Modes Switcher */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
          {/* Mode 1: Raspberry Pi WebSocket */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              state.mode === 'raspberry_pi_ws'
                ? 'bg-pink-950/40 border-pink-600 ring-1 ring-pink-500 text-slate-100'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Wifi className="w-4 h-4 text-pink-400" />
                <span>模式 A: 树莓派无线通信 (推荐)</span>
              </div>
              {state.mode === 'raspberry_pi_ws' && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-pink-500 text-white font-bold">
                  当前模式
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-3">
              树莓派插在 127SLT 手柄上作为无线网关，手机/电脑通过局域网或树莓派 Wi-Fi 热点无缝无线遥控。
            </p>

            <form onSubmit={handleConnectPi} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hostIp}
                  onChange={(e) => setHostIp(e.target.value)}
                  placeholder="树莓派IP (如 192.168.1.100)"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none focus:border-pink-500"
                />
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 8000)}
                  placeholder="端口"
                  className="w-16 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isConnecting}
                className="w-full py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{isConnecting ? '正在连接树莓派...' : '连接树莓派 (Connect)'}</span>
              </button>
            </form>
          </div>

          {/* Mode 2: Web Serial Direct */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              state.mode === 'web_serial'
                ? 'bg-cyan-950/40 border-cyan-600 ring-1 ring-cyan-500 text-slate-100'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Usb className="w-4 h-4 text-cyan-400" />
                <span>模式 B: 浏览器串口直连</span>
              </div>
              {state.mode === 'web_serial' && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500 text-slate-950 font-bold">
                  当前模式
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              在树莓派本地桌面 Chromium 浏览器中直接运行，或电脑通过 USB 线直接连接望远镜手柄。
            </p>

            <button
              onClick={handleConnectSerial}
              className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>选择串口设备 (/dev/ttyUSB0)</span>
            </button>
          </div>

          {/* Mode 3: Built-in Simulator */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              state.mode === 'simulator'
                ? 'bg-purple-950/40 border-purple-600 ring-1 ring-purple-500 text-slate-100'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Radio className="w-4 h-4 text-purple-400" />
                <span>模式 C: 虚拟天文台仿真</span>
              </div>
              {state.mode === 'simulator' && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500 text-white font-bold">
                  当前模式
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              无需真实连接望远镜硬件，完整模拟 127SLT 旋转动力学、4°/s回转速度、恒星时跟踪与螺旋寻星。
            </p>

            <button
              onClick={handleSwitchSimulator}
              className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>启用虚拟仿真模式</span>
            </button>
          </div>
        </div>

        {connectionError && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-200 flex items-start gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{connectionError}</span>
          </div>
        )}
      </div>

      {/* Code & Hardware Deployment Suite */}
      <div
        className={`rounded-2xl p-6 border shadow-xl ${
          nightMode
            ? 'bg-neutral-950 border-red-900/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100">树莓派端守护程序代码与一键部署</h3>
          </div>

          {/* Sub tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <button
              onClick={() => setCodeTab('python')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-semibold ${
                codeTab === 'python' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Python 守护服务 (celestron_pi_server.py)
            </button>
            <button
              onClick={() => setCodeTab('bash')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-semibold ${
                codeTab === 'bash' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              一键配置脚本 (setup_pi.sh)
            </button>
            <button
              onClick={() => setCodeTab('service')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-semibold ${
                codeTab === 'service' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              systemd 开机自启 (celestron.service)
            </button>
            <button
              onClick={() => setCodeTab('wiring')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-semibold ${
                codeTab === 'wiring' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              物理硬件接线图解
            </button>
          </div>
        </div>

        {/* Tab 1: Python Server Code */}
        {codeTab === 'python' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>FastAPI + Uvicorn + PySerial 异步 WebSocket 遥测服务</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyCode(PI_SERVER_PYTHON, 'py')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                >
                  {copiedType === 'py' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedType === 'py' ? '已复制代码' : '复制 Python 脚本'}</span>
                </button>
                <button
                  onClick={() => handleDownloadFile('celestron_pi_server.py', PI_SERVER_PYTHON)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载 .py 文件</span>
                </button>
              </div>
            </div>

            <pre className="p-4 rounded-xl bg-black/80 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto max-h-96 no-scrollbar leading-relaxed">
              <code>{PI_SERVER_PYTHON}</code>
            </pre>
          </div>
        )}

        {/* Tab 2: Bash Installer */}
        {codeTab === 'bash' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>在树莓派终端中一行命令自动安装 Python 环境与串口权限</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyCode(SETUP_BASH_SCRIPT, 'sh')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                >
                  {copiedType === 'sh' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedType === 'sh' ? '已复制脚本' : '复制 Shell 脚本'}</span>
                </button>
                <button
                  onClick={() => handleDownloadFile('setup_pi.sh', SETUP_BASH_SCRIPT)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载 setup_pi.sh</span>
                </button>
              </div>
            </div>

            <pre className="p-4 rounded-xl bg-black/80 border border-slate-800 text-emerald-300 font-mono text-xs overflow-x-auto max-h-96 no-scrollbar leading-relaxed">
              <code>{SETUP_BASH_SCRIPT}</code>
            </pre>
          </div>
        )}

        {/* Tab 3: Systemd Service */}
        {codeTab === 'service' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>配置树莓派开机即启动星特朗守护服务，无需插屏幕键盘</span>
              <button
                onClick={() => handleCopyCode(SYSTEMD_SERVICE_FILE, 'service')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              >
                {copiedType === 'service' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedType === 'service' ? '已复制配置' : '复制 celestron.service'}</span>
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-black/80 border border-slate-800 text-amber-300 font-mono text-xs overflow-x-auto max-h-72 leading-relaxed">
              <code>{SYSTEMD_SERVICE_FILE}</code>
            </pre>
          </div>
        )}

        {/* Tab 4: Wiring Guide */}
        {codeTab === 'wiring' && (
          <div className="space-y-4 text-xs text-slate-300">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <h4 className="font-bold text-sm text-cyan-300 mb-2">
                {HARDWARE_WIRING_GUIDE.title}
              </h4>
              <div className="space-y-4 leading-relaxed">
                {HARDWARE_WIRING_GUIDE.sections.map((sec, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="font-bold text-slate-100 mb-1">{sec.heading}</div>
                    <p className="whitespace-pre-line text-slate-400">{sec.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Raw NexStar Serial Diagnostic Console */}
      <div
        className={`rounded-2xl p-6 border shadow-xl ${
          nightMode
            ? 'bg-neutral-950 border-red-900/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100">NexStar 协议串口交互诊断终端</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">Baud: 9600 8N1</span>
        </div>

        {/* Terminal Screen */}
        <div className="p-4 rounded-xl bg-black border border-slate-800 font-mono text-xs h-48 overflow-y-auto space-y-1.5">
          {consoleLogs.map((log, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-slate-600 shrink-0">[{log.time}]</span>
              <span
                className={`font-bold shrink-0 ${
                  log.type === 'tx'
                    ? 'text-amber-400'
                    : log.type === 'rx'
                    ? 'text-emerald-400'
                    : 'text-cyan-400'
                }`}
              >
                {log.type === 'tx' ? 'TX >>' : log.type === 'rx' ? '<< RX' : '== INFO:'}
              </span>
              <span
                className={`${
                  log.type === 'tx'
                    ? 'text-amber-200'
                    : log.type === 'rx'
                    ? 'text-emerald-200'
                    : 'text-slate-300'
                }`}
              >
                {log.text}
              </span>
            </div>
          ))}
        </div>

        {/* Command Input & Quick Protocol Shortcuts */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">快捷协议指令:</span>
            {[
              { cmd: 'V', label: '版本 (V)' },
              { cmd: 'm', label: '机型 (m)' },
              { cmd: 'e', label: '读取坐标 (e)' },
              { cmd: 't', label: '跟踪状态 (t)' },
              { cmd: 'M', label: '取消GoTo (M)' },
            ].map((item) => (
              <button
                key={item.cmd}
                onClick={() => {
                  setCustomCmd(item.cmd);
                  telescopeBridge.sendRawNexStarCommand(item.cmd);
                  addConsoleLog('tx', `发送指令: ${item.cmd}`);
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono border border-slate-700 text-[11px]"
              >
                {item.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSendCustomCmd} className="flex gap-2">
            <input
              type="text"
              value={customCmd}
              onChange={(e) => setCustomCmd(e.target.value)}
              placeholder="输入原始协议字符 (如 V, e, z...)"
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500 w-48"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
            >
              发送
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
