import React, { useState } from 'react';
import { TelescopeState, ObservationLogEntry } from '../types/telescope';
import { formatRA, formatDec } from '../services/astronomy';
import { TrackingPrecisionChart } from './TrackingPrecisionChart';
import {
  BookOpen,
  Plus,
  Trash2,
  Download,
  Share2,
  Calendar,
  Eye,
  Star,
  Sparkles,
} from 'lucide-react';

interface ObservationLogTabProps {
  state: TelescopeState;
  nightMode: boolean;
}

export const ObservationLogTab: React.FC<ObservationLogTabProps> = ({ state, nightMode }) => {
  const [logs, setLogs] = useState<ObservationLogEntry[]>([
    {
      id: '1',
      timestamp: '2026-09-23 21:15',
      targetName: '木星 (气态巨行星)',
      targetCategory: '太阳系',
      ra: '05h 39m 00s',
      dec: '+22° 06\' 00"',
      eyepiece: '9mm 高倍目镜 (167x)',
      bortle: 4,
      seeing: 4,
      transparency: 4,
      notes: '视宁度极佳！清晰看到木星两条主红棕色赤道带（NEB和SEB），4颗伽利略卫星如珍珠般一字排开，卡西尼缝若隐若现。',
    },
    {
      id: '2',
      timestamp: '2026-09-23 22:40',
      targetName: '猎户座大星云 (M42)',
      targetCategory: '梅西耶深空',
      ra: '05h 35m 17s',
      dec: '-05° 23\' 28"',
      eyepiece: '25mm 广角目镜 (60x)',
      bortle: 4,
      seeing: 4,
      transparency: 5,
      notes: '127SLT 25mm目镜视场极度惊艳！中央梯形四合星（Trapezium）四颗子星极为锐利分立，周围如蝙蝠双翼般舒展的发光弥漫气体云层次丰富。',
    },
    {
      id: '3',
      timestamp: '2026-09-24 00:10',
      targetName: '辇道增七 (Albireo)',
      targetCategory: '经典双星',
      ra: '19h 30m 43s',
      dec: '+27° 57\' 35"',
      eyepiece: '25mm 广角目镜 (60x)',
      bortle: 5,
      seeing: 3,
      transparency: 4,
      notes: '夜空中最美的黄金与蓝宝石色彩对比双星。主星璀璨金黄，伴星青翠黄玉蓝，两色交相辉映，极富美感。',
    },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTarget, setNewTarget] = useState(state.targetName || '当前观测天体');
  const [newEyepiece, setNewEyepiece] = useState('25mm 广角目镜 (60x)');
  const [newBortle, setNewBortle] = useState(4);
  const [newSeeing, setNewSeeing] = useState(4);
  const [newTransparency, setNewTransparency] = useState(4);
  const [newNotes, setNewNotes] = useState('');

  const handleAddCurrentScopeTarget = () => {
    setNewTarget(state.targetName || '当前指向天区');
    setShowAddModal(true);
  };

  const handleSaveLog = (e: React.FormEvent) => {
    e.preventDefault();
    const entry: ObservationLogEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
      targetName: newTarget,
      targetCategory: '实测目标',
      ra: formatRA(state.ra),
      dec: formatDec(state.dec),
      eyepiece: newEyepiece,
      bortle: newBortle,
      seeing: newSeeing,
      transparency: newTransparency,
      notes: newNotes || '通过星特朗 127SLT 成功自动寻星定位并完成目视观测。',
    };

    setLogs([entry, ...logs]);
    setShowAddModal(false);
    setNewNotes('');
  };

  const handleDelete = (id: string) => {
    setLogs(logs.filter((l) => l.id !== id));
  };

  const handleExportMarkdown = () => {
    const md = logs
      .map(
        (l) => `## 观测记录: ${l.targetName}
- **观测时间**: ${l.timestamp}
- **望远镜设备**: Celestron NexStar 127SLT (127/1500mm f/11.8)
- **使用目镜**: ${l.eyepiece}
- **天球坐标**: RA ${l.ra} | Dec ${l.dec}
- **夜空环境**: 波特尔暗空等级 Bortle ${l.bortle} | 视宁度 Seeing ${l.seeing}/5 | 透明度 ${l.transparency}/5
- **观测笔记**:
  ${l.notes}

---
`
      )
      .join('\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `celestron_127slt_observation_log_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`rounded-2xl p-6 border shadow-xl ${
          nightMode
            ? 'bg-neutral-950 border-red-900/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">星特朗 127SLT 天文观测日志</h2>
              <p className="text-xs text-slate-400">
                记录每一次深空寻星与行星目视细节，沉淀您的专属星空观测手帐
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 transition-colors font-semibold"
            >
              <Download className="w-4 h-4" />
              <span>导出 Markdown 日志</span>
            </button>
            <button
              onClick={handleAddCurrentScopeTarget}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>记录当前指向天体</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Tracking Precision and Error Curve (Recharts) */}
      <TrackingPrecisionChart
        state={state}
        nightMode={nightMode}
        title="观测时段望远镜赤经/赤纬追踪精度与导星稳定性监视"
      />

      {/* Log Cards List */}
      <div className="space-y-4">
        {logs.map((log) => (
          <div
            key={log.id}
            className={`rounded-2xl p-5 border transition-all ${
              nightMode
                ? 'bg-neutral-950/80 border-red-900/50 hover:border-red-700'
                : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-slate-100">{log.targetName}</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                    {log.targetCategory}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                  <span>{log.timestamp}</span>
                  <span>•</span>
                  <span>RA {log.ra}</span>
                  <span>•</span>
                  <span>Dec {log.dec}</span>
                </div>
              </div>

              <button
                onClick={() => handleDelete(log.id)}
                className="p-1.5 rounded-lg hover:bg-rose-950/50 text-slate-500 hover:text-rose-400 transition-colors"
                title="删除记录"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 my-3 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                🔭 目镜: {log.eyepiece}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                🌃 波特尔光污染: Bortle {log.bortle} 级
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                🌀 视宁度: {log.seeing}/5
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                ✨ 透明度: {log.transparency}/5
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              {log.notes}
            </p>
          </div>
        ))}
      </div>

      {/* Add Log Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl p-6 bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">新建天文观测手帐记录</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLog} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">天体名称</label>
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">所用目镜配置</label>
                <select
                  value={newEyepiece}
                  onChange={(e) => setNewEyepiece(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none"
                >
                  <option value="25mm 广角目镜 (60x)">25mm 标准广角目镜 (60倍，视场约 0.87°)</option>
                  <option value="9mm 高倍目镜 (167x)">9mm 高倍行星目镜 (167倍，视场约 0.31°)</option>
                  <option value="15mm 中倍目镜 (100x)">15mm 中倍目镜 (100倍)</option>
                  <option value="2x 巴洛镜 + 9mm (333x)">2x 巴洛增倍镜 + 9mm (333倍极限)</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Bortle 暗空等级 (1-9)</label>
                  <input
                    type="number"
                    min="1"
                    max="9"
                    value={newBortle}
                    onChange={(e) => setNewBortle(parseInt(e.target.value) || 4)}
                    className="w-full p-2 rounded-lg bg-slate-800 border border-slate-700 text-center font-bold text-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">视宁度 Seeing (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={newSeeing}
                    onChange={(e) => setNewSeeing(parseInt(e.target.value) || 4)}
                    className="w-full p-2 rounded-lg bg-slate-800 border border-slate-700 text-center font-bold text-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">透明度 Trans (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={newTransparency}
                    onChange={(e) => setNewTransparency(parseInt(e.target.value) || 4)}
                    className="w-full p-2 rounded-lg bg-slate-800 border border-slate-700 text-center font-bold text-cyan-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">目视细节与观测随笔</label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="例如：看到几条木星条纹、光环卡西尼缝、星云气体云明暗层次..."
                  className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
                ></textarea>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg"
                >
                  保存记录
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
