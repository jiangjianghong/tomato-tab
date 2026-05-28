import { useState } from 'react';
import { toast } from 'sonner';
import { useSearchEngine } from '@/contexts/SearchEngineContext';
import { SearchEngineIcon } from '@/components/SearchEngineIcon';
import { SearchEngine } from '@/types/searchEngine';
import { EngineEditModal } from './EngineEditModal';

export function SearchEngineManager() {
  const { engines, toggleEngineEnabled, deleteCustomEngine } = useSearchEngine();
  const [editingEngine, setEditingEngine] = useState<SearchEngine | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const builtins = engines.filter((e) => e.isBuiltin);
  const customs = engines.filter((e) => !e.isBuiltin);

  const handleToggle = (id: string) => {
    const ok = toggleEngineEnabled(id);
    if (!ok) {
      toast.error('至少保留一个搜索引擎');
    }
  };

  const handleDelete = (engine: SearchEngine) => {
    if (window.confirm(`确认删除"${engine.name}"?`)) {
      deleteCustomEngine(engine.id);
      toast.success(`已删除 ${engine.name}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* 内置引擎 */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2.5">内置引擎</h4>
        <div className="space-y-2">
          {builtins.map((engine) => (
            <EngineRow
              key={engine.id}
              engine={engine}
              onToggle={() => handleToggle(engine.id)}
            />
          ))}
        </div>
      </div>

      {/* 自定义引擎 */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">自定义引擎</h4>
          <button
            onClick={() => setIsAdding(true)}
            className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 rounded-md text-white transition-colors"
          >
            <i className="fa-solid fa-plus mr-1"></i>添加
          </button>
        </div>
        {customs.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 italic py-4 text-center bg-gray-50 dark:bg-gray-900/30 rounded-md">
            还没有自定义引擎,点 + 添加
          </div>
        ) : (
          <div className="space-y-2">
            {customs.map((engine) => (
              <EngineRow
                key={engine.id}
                engine={engine}
                onToggle={() => handleToggle(engine.id)}
                onEdit={() => setEditingEngine(engine)}
                onDelete={() => handleDelete(engine)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑模态 */}
      {(isAdding || editingEngine) && (
        <EngineEditModal
          engine={editingEngine}
          onClose={() => {
            setIsAdding(false);
            setEditingEngine(null);
          }}
        />
      )}
    </div>
  );
}

interface EngineRowProps {
  engine: SearchEngine;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function EngineRow({ engine, onToggle, onEdit, onDelete }: EngineRowProps) {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-900/50 rounded-md transition-colors">
      <SearchEngineIcon engine={engine} size={20} />
      <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">{engine.name}</span>
      {!engine.isBuiltin && onEdit && (
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
          title="编辑"
        >
          <i className="fa-solid fa-pencil text-xs"></i>
        </button>
      )}
      {!engine.isBuiltin && onDelete && (
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
          title="删除"
        >
          <i className="fa-solid fa-trash text-xs"></i>
        </button>
      )}
      <button
        onClick={onToggle}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          engine.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
        }`}
        title={engine.enabled ? '已启用' : '已禁用'}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
            engine.enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
