
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { PartCategory, PCPart, BuildSummary, ChatMessage, GamePerformance, SavedBuild } from './types';
import { getBuildAdvice, generateBuildImage, createChat, estimateGamePerformance, getPartSuggestions } from './services/geminiService';
import { 
  Cpu, 
  Gamepad2, 
  Layout, 
  MemoryStick, 
  Database, 
  Zap, 
  Box, 
  Fan, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Search,
  ExternalLink,
  Tag,
  ShoppingBag,
  BarChart3,
  Monitor,
  Trophy,
  Info,
  Save,
  Trash2,
  FolderOpen,
  ChevronDown,
  Ruler,
  Globe,
  Wind,
  TrendingUp,
  Lightbulb,
  ShieldCheck,
  ArrowRight,
  Share2,
  Download,
  Upload,
  Copy,
  Check
} from 'lucide-react';

const CATEGORIES = [
  { id: PartCategory.CPU, icon: Cpu, label: "CPU" },
  { id: PartCategory.GPU, icon: Gamepad2, label: "GPU" },
  { id: PartCategory.Motherboard, icon: Layout, label: "マザーボード" },
  { id: PartCategory.RAM, icon: MemoryStick, label: "メモリ" },
  { id: PartCategory.Storage, icon: Database, label: "ストレージ" },
  { id: PartCategory.PSU, icon: Zap, label: "電源" },
  { id: PartCategory.Case, icon: Box, label: "ケース" },
  { id: PartCategory.Cooler, icon: Fan, label: "CPUクーラー" },
  { id: PartCategory.CaseFan, icon: Wind, label: "ケースファン" },
];

const parsePrice = (priceStr: string): number => {
  return parseInt(priceStr.replace(/[^0-9]/g, '')) || 0;
};

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('ja-JP').format(price) + '円';
};

const App: React.FC = () => {
  const [parts, setParts] = useState<Record<PartCategory, string>>({
    [PartCategory.CPU]: '', [PartCategory.GPU]: '', [PartCategory.Motherboard]: '',
    [PartCategory.RAM]: '', [PartCategory.Storage]: '', [PartCategory.PSU]: '',
    [PartCategory.Case]: '', [PartCategory.Cooler]: '', [PartCategory.CaseFan]: '',
  });

  const [summary, setSummary] = useState<BuildSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [gameTitle, setGameTitle] = useState('');
  const [isEstimatingFPS, setIsEstimatingFPS] = useState(false);
  const [gamePerf, setGamePerf] = useState<GamePerformance | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [savedBuilds, setSavedBuilds] = useState<SavedBuild[]>([]);
  const [showSavedBuilds, setShowSavedBuilds] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<any>(null);

  useEffect(() => {
    const storedBuilds = localStorage.getItem('pc_builder_saved_builds_v1');
    if (storedBuilds) setSavedBuilds(JSON.parse(storedBuilds));

    const draft = localStorage.getItem('pc_builder_draft_v1');
    if (draft && !window.location.search.includes('build=')) {
      setParts(JSON.parse(draft));
    }
    setIsDraftLoaded(true);

    // Check for shared build in URL
    const params = new URLSearchParams(window.location.search);
    const sharedBuildData = params.get('build');
    if (sharedBuildData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(sharedBuildData)));
        setParts(decoded);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error('Failed to load shared build', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pc_builder_saved_builds_v1', JSON.stringify(savedBuilds));
  }, [savedBuilds]);

  useEffect(() => {
    if (isDraftLoaded) {
      localStorage.setItem('pc_builder_draft_v1', JSON.stringify(parts));
    }
  }, [parts, isDraftLoaded]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const saveBuild = () => {
    const activeParts = Object.values(parts).some(v => typeof v === 'string' && v.trim() !== '');
    if (!activeParts) return;

    const buildName = prompt('構成の名前を入力してください', `構成 ${savedBuilds.length + 1}`);
    if (!buildName) return;

    const newBuild: SavedBuild = {
      id: crypto.randomUUID(),
      name: buildName,
      parts: { ...parts },
      timestamp: Date.now()
    };

    setSavedBuilds(prev => [newBuild, ...prev]);
  };

  const resetBuild = () => {
    if (!confirm('現在の構成をリセットして新しく作成しますか？')) return;
    setParts({
      [PartCategory.CPU]: '', [PartCategory.GPU]: '', [PartCategory.Motherboard]: '',
      [PartCategory.RAM]: '', [PartCategory.Storage]: '', [PartCategory.PSU]: '',
      [PartCategory.Case]: '', [PartCategory.Cooler]: '', [PartCategory.CaseFan]: '',
    });
    setSummary(null);
    setGeneratedImage(null);
    setGamePerf(null);
    setChatMessages([]);
  };

  const loadBuild = (build: SavedBuild) => {
    setParts(build.parts);
    setSummary(null);
    setGeneratedImage(null);
    setGamePerf(null);
    setChatMessages([]);
    setShowSavedBuilds(false);
  };

  const deleteBuild = (id: string) => {
    if (!confirm('この構成を削除してもよろしいですか？')) return;
    setSavedBuilds(prev => prev.filter(b => b.id !== id));
  };

  const duplicateBuild = (build: SavedBuild) => {
    const newBuild: SavedBuild = {
      ...build,
      id: crypto.randomUUID(),
      name: `${build.name} (コピー)`,
      timestamp: Date.now()
    };
    setSavedBuilds(prev => [newBuild, ...prev]);
  };

  const renameBuild = (id: string, currentName: string) => {
    const newName = prompt('新しい名前を入力してください', currentName);
    if (!newName || newName === currentName) return;
    setSavedBuilds(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));
  };

  const shareCurrentBuild = () => {
    const activeParts = Object.entries(parts).filter(([_, v]) => v.trim() !== '');
    if (activeParts.length === 0) return;

    const buildData = btoa(encodeURIComponent(JSON.stringify(parts)));
    const shareUrl = `${window.location.origin}${window.location.pathname}?build=${buildData}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const exportBuilds = () => {
    const dataStr = JSON.stringify(savedBuilds, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'pc_builds_backup.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importBuilds = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          setSavedBuilds(prev => [...imported, ...prev]);
          alert(`${imported.length}件の構成をインポートしました。`);
        }
      } catch (err) {
        alert('インポートに失敗しました。ファイル形式を確認してください。');
      }
    };
    reader.readAsText(file);
  };

  const totals = useMemo(() => {
    if (!summary) return { new: 0, used: 0 };
    return summary.partsWithPrices.reduce((acc, p) => ({
      new: acc.new + parsePrice(p.priceNew),
      used: acc.used + parsePrice(p.priceUsed)
    }), { new: 0, used: 0 });
  }, [summary]);

  const analyzeBuild = async () => {
    const activeParts = (Object.entries(parts) as [PartCategory, string][])
      .filter(([_, name]) => name.trim() !== '')
      .map(([category, name]) => ({ category: category as PartCategory, name, wattage: 0 }));
    
    if (activeParts.length === 0) return;
    setIsAnalyzing(true);
    setGamePerf(null);
    try {
      const result = await getBuildAdvice(activeParts);
      setSummary(result);
      
      const updatedParts = { ...parts };
      result.partsWithPrices.forEach(p => updatedParts[p.category as PartCategory] = p.name);
      setParts(updatedParts);
      
      chatSessionRef.current = null;
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateImage = async () => {
    const activeParts = (Object.entries(parts) as [PartCategory, string][])
      .filter(([_, name]) => name.trim() !== '')
      .map(([category, name]) => ({ category: category as PartCategory, name, wattage: 0 }));
    if (activeParts.length === 0) return;
    setIsGeneratingImage(true);
    try {
      const img = await generateBuildImage(activeParts);
      setGeneratedImage(img);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const calculateFPS = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeParts = (Object.entries(parts) as [PartCategory, string][])
      .filter(([_, name]) => name.trim() !== '')
      .map(([category, name]) => ({ category: category as PartCategory, name, wattage: 0 }));
    if (activeParts.length === 0 || !gameTitle) return;
    setIsEstimatingFPS(true);
    try {
      const result = await estimateGamePerformance(activeParts, gameTitle);
      setGamePerf(result);
    } finally {
      setIsEstimatingFPS(false);
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim()) return;
    const userMsg = inputMessage;
    setInputMessage('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);
    try {
      if (!chatSessionRef.current) {
        const buildContext = Object.entries(parts)
          .filter(([_, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        chatSessionRef.current = createChat(`あなたはPCハードウェアの専門家です。現在のユーザーの構成: ${buildContext || '未定'}。ユーザーの相談に乗り、最適な選択をサポートしてください。`);
      }
      const result = await chatSessionRef.current.sendMessage({ message: userMsg });
      setChatMessages(prev => [...prev, { role: 'model', text: result.text }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'model', text: "エラーが発生しました。" }]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <ShieldCheck className="w-6 h-6 text-green-400" />;
      case 'warning': return <AlertTriangle className="w-6 h-6 text-yellow-400" />;
      case 'error': return <XCircle className="w-6 h-6 text-red-400" />;
      default: return <Info className="w-6 h-6 text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-['Inter']">
      {/* Sidebar - Fixed width to keep it constant */}
      <aside className="w-96 flex-shrink-0 bg-slate-900/40 border-r border-slate-800 p-6 flex flex-col z-30 h-screen overflow-hidden">
        <div className="flex items-center justify-between mb-8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg shadow-blue-500/20">
              <Cpu className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter">BUILDER PRO</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Powered by Gemini AI</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={shareCurrentBuild}
              className={`p-2 rounded-xl transition-all relative ${copySuccess ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              title="共有リンクをコピー"
            >
              {copySuccess ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
              {copySuccess && (
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-green-600 text-[8px] px-2 py-1 rounded font-bold whitespace-nowrap">コピー完了</span>
              )}
            </button>
            <button 
              onClick={() => setShowSavedBuilds(!showSavedBuilds)}
              className={`p-2 rounded-xl transition-all ${showSavedBuilds ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              title="保存済み構成"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
            <button 
              onClick={resetBuild}
              className="p-2 bg-slate-800 text-slate-400 hover:text-red-400 rounded-xl transition-all"
              title="新規作成 (リセット)"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button 
              onClick={saveBuild}
              className="p-2 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
              title="現在の構成を保存"
            >
              <Save className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showSavedBuilds ? (
          <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 mb-6 space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">保存済み構成</h2>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer text-slate-500 hover:text-blue-400 transition-colors" title="バックアップをインポート">
                  <Upload className="w-4 h-4" />
                  <input type="file" accept=".json" onChange={importBuilds} className="hidden" />
                </label>
                <button onClick={exportBuilds} className="text-slate-500 hover:text-blue-400 transition-colors" title="バックアップをエクスポート">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={() => setShowSavedBuilds(false)} className="text-[10px] font-bold text-blue-400 hover:underline">戻る</button>
              </div>
            </div>
            {savedBuilds.length === 0 ? (
              <div className="text-center py-12 text-slate-600 italic text-xs">
                保存された構成はありません
              </div>
            ) : (
              savedBuilds.map(build => (
                <div key={build.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 group hover:border-blue-500/50 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <button 
                      onClick={() => loadBuild(build)}
                      className="text-sm font-bold text-slate-200 group-hover:text-blue-400 transition-colors text-left line-clamp-1 flex-grow"
                    >
                      {build.name}
                    </button>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => renameBuild(build.id, build.name)}
                        className="text-slate-600 hover:text-blue-400 transition-colors"
                        title="名前を変更"
                      >
                        <Layout className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => duplicateBuild(build)}
                        className="text-slate-600 hover:text-green-400 transition-colors"
                        title="複製"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => deleteBuild(build.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    {new Date(build.timestamp).toLocaleDateString('ja-JP')}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(build.parts).filter(([_, v]) => v).slice(0, 3).map(([k, v]) => (
                      <span key={k} className="text-[8px] bg-slate-900/50 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/30 truncate max-w-[80px]">{v}</span>
                    ))}
                    {Object.values(build.parts).filter(v => v).length > 3 && (
                      <span className="text-[8px] text-slate-600">...</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4 flex-grow overflow-y-auto custom-scrollbar pr-2 mb-6">
            {CATEGORIES.map(({ id, icon: Icon, label }) => (
              <div key={id} className="group">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block flex items-center gap-2 group-focus-within:text-blue-400 transition-colors">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </label>
                <input
                  type="text"
                  placeholder={`${label}名を入力...`}
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-600"
                  value={parts[id]}
                  onChange={(e) => setParts(p => ({ ...p, [id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex-shrink-0 pt-6 border-t border-slate-800/50 space-y-4">
          <button
            onClick={analyzeBuild}
            disabled={isAnalyzing}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98]"
          >
            {isAnalyzing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            構成を分析・最適化
          </button>
          <button
            onClick={handleGenerateImage}
            disabled={isGeneratingImage}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all border border-slate-700 active:scale-[0.98]"
          >
            {isGeneratingImage ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            外観イメージ生成
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-8 overflow-y-auto custom-scrollbar flex flex-col gap-8">
        {!summary ? (
          <div className="flex-grow flex flex-col items-center justify-center text-center p-12 max-w-2xl mx-auto opacity-50">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-20"></div>
              <Box className="w-20 h-20 text-slate-700 relative z-10 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black mb-4 tracking-tight">理想の1台を、AIと共に。</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              パーツ名を入力して「分析」を開始してください。<br/>
              Gemini AIが物理的な干渉や相場情報を瞬時に計算します。
            </p>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { label: "互換性スコア", val: `${summary.compatibilityScore}%`, icon: ShieldCheck, color: "text-green-400", bg: "bg-green-500/10" },
                { label: "推定消費電力", val: `${summary.totalWattage}W`, icon: Zap, color: "text-blue-400", bg: "bg-blue-500/10" },
                { label: "Amazon新品合計価格", val: formatPrice(totals.new), icon: ShoppingBag, color: "text-indigo-400", bg: "bg-indigo-500/10", note: summary.partsWithPrices.some(p => p.priceNew.includes('終了') || p.priceNew.includes('コン')) ? "※販売終了品の参考価格を含む" : null },
                { label: "中古合計価格", val: formatPrice(totals.used), icon: RefreshCw, color: "text-slate-300", bg: "bg-slate-500/10" },
              ].map((s, i) => (
                <div key={i} className={`border border-slate-800/50 p-6 rounded-[2rem] flex flex-col justify-between shadow-2xl backdrop-blur-sm ${s.bg}`}>
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                    <s.icon className={`w-4 h-4 ${s.color}`} /> {s.label}
                  </div>
                  <div className="flex flex-col">
                    <div className={`text-3xl font-black tracking-tighter ${s.color}`}>{s.val}</div>
                    {s.note && <div className="text-[9px] font-bold text-amber-500/70 mt-1">{s.note}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Interference & Standard Checks (Moved Up and Detailed) */}
            <section className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="bg-red-500/20 p-3 rounded-2xl"><Ruler className="w-6 h-6 text-red-400" /></div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">物理干渉・規格詳細チェック</h3>
                    <p className="text-xs text-slate-500">パーツ同士の物理的な収まりと規格の適合性を確認しました</p>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-3">
                   <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-400 uppercase tracking-widest bg-green-500/5 px-3 py-1 rounded-full border border-green-500/10"><CheckCircle2 className="w-3 h-3" /> 正常</div>
                   <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-400 uppercase tracking-widest bg-yellow-500/5 px-3 py-1 rounded-full border border-yellow-500/10"><AlertTriangle className="w-3 h-3" /> 注意</div>
                   <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 uppercase tracking-widest bg-red-500/5 px-3 py-1 rounded-full border border-red-500/10"><XCircle className="w-3 h-3" /> 重大</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {summary.detailedChecks.map((check, i) => (
                  <div key={i} className="flex gap-5 p-6 bg-slate-950/40 rounded-3xl border border-slate-800/50 group hover:border-slate-600 transition-all">
                    <div className="shrink-0 mt-1">{renderStatusIcon(check.status)}</div>
                    <div>
                      <div className="text-sm font-black text-slate-100 mb-1.5">{check.item}</div>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">{check.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Middle Section: Benchmarks & Game Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-orange-500/20 p-2 rounded-xl"><BarChart3 className="w-6 h-6 text-orange-400" /></div>
                        <div>
                            <h3 className="text-lg font-black tracking-tight">AI ベンチマーク予測スコア</h3>
                            <p className="text-xs text-slate-500">ハードウェア性能の客観的な推定値</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {summary.benchmarks.map((b, i) => (
                        <div key={i} className="bg-slate-950/40 border border-slate-800/50 p-5 rounded-3xl hover:border-orange-500/30 transition-all flex items-center justify-between">
                            <div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{b.name}</div>
                                <div className="text-xl font-black text-orange-400">{b.score}</div>
                            </div>
                            <p className="text-[10px] text-slate-500 max-w-[50%] text-right font-medium">{b.description}</p>
                        </div>
                        ))}
                    </div>
                </section>

                <section className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-blue-500/20 p-2 rounded-xl"><Monitor className="w-5 h-5 text-blue-400" /></div>
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">ゲーム動作(FPS)予測</h4>
                    </div>
                    <form onSubmit={calculateFPS} className="flex gap-2 mb-8">
                        <input
                        type="text"
                        disabled={isEstimatingFPS}
                        placeholder="ゲーム名 (例: FF14, Valorant, Cyberpunk)..."
                        className="flex-grow bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all disabled:opacity-50"
                        value={gameTitle}
                        onChange={(e) => setGameTitle(e.target.value)}
                        />
                        <button 
                          type="submit" 
                          disabled={isEstimatingFPS || !gameTitle.trim()}
                          className="bg-blue-600 hover:bg-blue-500 p-3.5 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
                        >
                        {isEstimatingFPS ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        </button>
                    </form>
                    {isEstimatingFPS ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-4 bg-slate-950/40 rounded-3xl border border-slate-800/50 animate-pulse">
                            <div className="relative">
                                <Monitor className="w-12 h-12 text-blue-500/20" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="text-xs font-black text-blue-400 uppercase tracking-widest mb-1">AIが性能を分析中...</div>
                                <div className="text-[10px] text-slate-500 font-medium">最新のベンチマークデータを参照しています</div>
                            </div>
                        </div>
                    ) : gamePerf ? (
                        <div className="grid grid-cols-3 gap-4 animate-in zoom-in duration-300">
                        {[
                            { label: "1080p", val: gamePerf.fps1080p, color: "text-green-400" },
                            { label: "1440p", val: gamePerf.fps1440p, color: "text-blue-400" },
                            { label: "4K", val: gamePerf.fps4k, color: "text-indigo-400" }
                        ].map((f, i) => (
                            <div key={i} className="text-center p-4 bg-slate-950/60 rounded-3xl border border-slate-800/50">
                            <div className="text-[9px] font-black text-slate-600 uppercase mb-2 tracking-widest">{f.label}</div>
                            <div className={`text-xl font-black ${f.color}`}>{f.val}</div>
                            </div>
                        ))}
                        <div className="col-span-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-[10px] text-center italic text-slate-400">
                            設定: {gamePerf.settings}
                        </div>
                        </div>
                    ) : (
                        <div className="text-center py-6 text-slate-600 italic text-[11px] border-2 border-dashed border-slate-800 rounded-3xl">
                        ゲーム名を入力してFPSをチェック
                        </div>
                    )}
                </section>
            </div>

            {/* Price & Trend Table */}
            <section className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-500/20 p-2 rounded-xl"><Tag className="w-6 h-6 text-indigo-400" /></div>
                  <h3 className="text-lg font-black tracking-tight">全パーツ価格詳細 & トレンド</h3>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/60 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="px-8 py-5">パーツ詳細</th>
                      <th className="px-8 py-5 text-center">Amazon新品価格</th>
                      <th className="px-8 py-5 text-center">中古相場</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {summary.partsWithPrices.map((p, i) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="px-8 py-6">
                          <div className="text-[10px] font-black text-indigo-500 uppercase mb-1">{p.category}</div>
                          <div className="font-bold text-slate-200 group-hover:text-white transition-colors line-clamp-1">{p.name}</div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {p.amazonUrl ? (
                              <a 
                                href={p.amazonUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={`px-4 py-1.5 rounded-full font-black text-xs border transition-all hover:scale-105 flex items-center gap-1.5 ${
                                  p.priceNew.includes('終了') || p.priceNew.includes('コン') 
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20' 
                                    : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20'
                                }`}
                              >
                                {p.priceNew}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className={`px-4 py-1.5 rounded-full font-black text-xs border ${
                                p.priceNew.includes('終了') || p.priceNew.includes('コン') 
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                                  : 'bg-blue-600/10 text-blue-400 border-blue-500/20'
                              }`}>
                                {p.priceNew}
                              </span>
                            )}
                            {(p.priceNew.includes('終了') || p.priceNew.includes('コン')) && (
                              <span className="text-[9px] font-bold text-amber-500/70 uppercase tracking-tighter">参考価格</span>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className="bg-slate-800 text-slate-400 border border-slate-700 px-4 py-1.5 rounded-full font-black text-xs">
                            {p.priceUsed}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Visualization */}
            <section className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800 p-4 overflow-hidden shadow-2xl">
              <div className="p-6 flex items-center justify-between">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" /> AI完成予想図 (ビジュアルシミュレーション)
                  </h4>
                  {isGeneratingImage && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
              </div>
              <div className="aspect-video flex items-center justify-center bg-slate-950/40 rounded-[2rem] border border-slate-800/50 overflow-hidden relative">
                {generatedImage ? (
                  <img src={generatedImage} alt="Build Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-8">
                    <Trophy className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                    <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">サイドバーの「外観イメージ生成」から<br/>ビジュアルを確認できます</p>
                  </div>
                )}
              </div>
            </section>

            {/* AI Overall Advice Section (New) */}
            <section className="bg-blue-600/5 rounded-[2.5rem] border border-blue-500/20 p-10 shadow-2xl">
              <div className="flex items-center gap-4 mb-10">
                <div className="bg-blue-600 p-3 rounded-2xl shadow-xl shadow-blue-600/20">
                  <Lightbulb className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight">AI 総合アドバイス & 最適化案</h3>
                  <p className="text-sm text-slate-500">この構成をさらに洗練させるためのヒント</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <h4 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                     <CheckCircle2 className="w-4 h-4" /> 推奨されるアクション
                  </h4>
                  <ul className="space-y-4">
                    {summary.recommendations.map((rec, i) => (
                      <li key={i} className="flex gap-4 p-5 bg-blue-500/5 border border-blue-500/10 rounded-3xl text-sm text-slate-300 leading-relaxed group hover:bg-blue-500/10 transition-colors">
                        <ArrowRight className="w-5 h-5 text-blue-500 shrink-0 group-hover:translate-x-1 transition-transform" />
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown components={{
                            a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-bold" />
                          }}>{rec}</ReactMarkdown>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-6">
                  <h4 className="text-xs font-black text-yellow-400 uppercase tracking-[0.2em] flex items-center gap-2">
                     <AlertTriangle className="w-4 h-4" /> 潜在的なリスク・留意点
                  </h4>
                  <ul className="space-y-4">
                    {summary.issues.length > 0 ? (
                      summary.issues.map((issue, i) => (
                        <li key={i} className="flex gap-4 p-5 bg-yellow-500/5 border border-yellow-500/10 rounded-3xl text-sm text-slate-300 leading-relaxed group hover:bg-yellow-500/10 transition-colors">
                          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown components={{
                              a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-bold" />
                            }}>{issue}</ReactMarkdown>
                          </div>
                        </li>
                      ))
                    ) : (
                      <li className="flex gap-4 p-5 bg-green-500/5 border border-green-500/10 rounded-3xl text-sm text-slate-400 italic">重大な問題は見つかりませんでした。</li>
                    )}
                  </ul>
                </div>
              </div>
            </section>

            {/* AI Supporter Chat Section */}
            <section className="bg-slate-900 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col min-h-[500px] max-h-[700px]">
              <div className="p-8 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-600/20">
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-100 tracking-tight">AI パーツサポーター</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">リアルタイム相談チャット</p>
                  </div>
                </div>
                {chatMessages.length > 0 && (
                  <button 
                    onClick={() => setChatMessages([])}
                    className="text-[10px] font-black text-slate-600 hover:text-red-400 transition-colors uppercase tracking-widest"
                  >
                    履歴消去
                  </button>
                )}
              </div>
              
              <div className="flex-grow overflow-y-auto p-8 space-y-5 custom-scrollbar bg-slate-950/30">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-12">
                    <Sparkles className="w-16 h-16 mb-4 text-indigo-500" />
                    <p className="text-sm font-bold text-slate-400">構成への質問、トラブル、代替案の提案など<br/>お気軽に入力してください。</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-[1.8rem] px-6 py-4 text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white font-medium rounded-tr-none' 
                        : 'bg-slate-800 text-slate-200 border border-slate-700/50 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 border border-slate-700/50 rounded-[1.8rem] px-6 py-4 flex gap-1.5 items-center shadow-sm rounded-tl-none">
                      <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={sendMessage} className="p-6 bg-slate-900 border-t border-slate-800 flex gap-3">
                <input 
                  type="text" 
                  value={inputMessage} 
                  onChange={(e) => setInputMessage(e.target.value)} 
                  placeholder="メッセージを入力..." 
                  className="flex-grow bg-slate-800 border border-slate-700 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-600 font-medium" 
                />
                <button 
                  type="submit" 
                  disabled={isTyping || !inputMessage.trim()} 
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-10 rounded-2xl transition-all active:scale-95 shadow-xl shadow-indigo-600/20 flex items-center justify-center"
                >
                  <Zap className="w-6 h-6 fill-current" />
                </button>
              </form>
            </section>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
};

export default App;
