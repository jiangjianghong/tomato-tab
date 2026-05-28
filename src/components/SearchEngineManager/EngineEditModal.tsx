import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { SearchEngine, validateUrlTemplate } from '@/types/searchEngine';
import { useSearchEngine } from '@/contexts/SearchEngineContext';
import { SearchEngineIcon } from '@/components/SearchEngineIcon';

interface Props {
  engine: SearchEngine | null;
  onClose: () => void;
}

export function EngineEditModal({ engine, onClose }: Props) {
  const { addCustomEngine, updateCustomEngine } = useSearchEngine();
  const [name, setName] = useState(engine?.name || '');
  const [urlTemplate, setUrlTemplate] = useState(engine?.urlTemplate || '');
  const [touched, setTouched] = useState(false);

  const nameError = useMemo(() => {
    if (!touched && !engine) return '';
    const trimmed = name.trim();
    if (trimmed.length === 0) return '名称不能为空';
    if (trimmed.length > 20) return '名称不能超过 20 字符';
    return '';
  }, [name, touched, engine]);

  const urlError = useMemo(() => {
    if (!touched && !engine) return '';
    if (!urlTemplate.trim()) return 'URL 不能为空';
    const v = validateUrlTemplate(urlTemplate.trim());
    return v.ok ? '' : v.reason;
  }, [urlTemplate, touched, engine]);

  const previewEngine: SearchEngine = useMemo(() => {
    const trimmedUrl = urlTemplate.trim();
    let host: string | undefined;
    if (!urlError && trimmedUrl) {
      try {
        host = new URL(trimmedUrl.replace('{query}', 'test')).hostname;
      } catch {
        host = undefined;
      }
    }
    return {
      id: engine?.id || 'preview',
      name: name.trim() || '预览',
      urlTemplate: trimmedUrl || 'https://example.com/?q={query}',
      iconType: urlError || !trimmedUrl ? 'fallback' : 'favicon',
      iconValue: host,
      isBuiltin: false,
      enabled: true,
    };
  }, [name, urlTemplate, urlError, engine]);

  const handleSubmit = () => {
    setTouched(true);
    if (nameError || urlError) return;
    const trimmedName = name.trim();
    const trimmedUrl = urlTemplate.trim();
    if (engine) {
      updateCustomEngine(engine.id, { name: trimmedName, urlTemplate: trimmedUrl });
      toast.success(`已更新 ${trimmedName}`);
    } else {
      addCustomEngine({ name: trimmedName, urlTemplate: trimmedUrl });
      toast.success(`已添加 ${trimmedName}`);
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 border border-white/10 rounded-lg p-6 w-[90vw] max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-white mb-4">
          {engine ? '编辑搜索引擎' : '添加搜索引擎'}
        </h3>

        {/* 预览 */}
        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-md mb-4">
          <SearchEngineIcon engine={previewEngine} size={24} />
          <span className="text-sm text-white/80">{previewEngine.name}</span>
        </div>

        {/* 名称 */}
        <div className="mb-3">
          <label className="block text-xs text-white/70 mb-1">名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setTouched(true);
            }}
            placeholder="例如:GitHub"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white text-sm outline-none focus:border-white/30"
            maxLength={20}
            autoFocus
          />
          {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
        </div>

        {/* URL */}
        <div className="mb-4">
          <label className="block text-xs text-white/70 mb-1">
            搜索 URL(用 {'{query}'} 占位)
          </label>
          <input
            type="text"
            value={urlTemplate}
            onChange={(e) => {
              setUrlTemplate(e.target.value);
              setTouched(true);
            }}
            placeholder="https://example.com/search?q={query}"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white text-sm font-mono outline-none focus:border-white/30"
          />
          {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
        </div>

        {/* 按钮 */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!!nameError || !!urlError || !name.trim() || !urlTemplate.trim()}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed rounded-md text-white transition-colors"
          >
            {engine ? '保存' : '添加'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
