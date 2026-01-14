
import React, { useState, useEffect } from 'react';
import { Plus, Check, Sparkles, Hash, Rocket, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Category } from '../types';

interface CategorySelectorProps {
  onConfirm: (selected: string[]) => void;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({ onConfirm }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customTag, setCustomTag] = useState('');
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_custom', false) // Fetch standard categories
        .order('id');

      if (error) throw error;
      if (data) {
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Fallback or empty
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showLimitWarning) {
      const timer = setTimeout(() => setShowLimitWarning(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showLimitWarning]);

  const toggleCategory = (name: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(name)) {
      newSelected.delete(name);
      setSelected(newSelected);
    } else {
      if (newSelected.size >= 3) {
        setShowLimitWarning(true);
        return;
      }
      newSelected.add(name);
      setSelected(newSelected);
    }
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim();
    if (!trimmed) return;

    if (selected.size >= 3) {
      setShowLimitWarning(true);
      return;
    }

    // Check if exists in current list
    if (!categories.some(c => c.name === trimmed)) {
      // Technically we should allow custom tags even if they don't exist in DB yet
      // For UI, we just treat it as selected. 
      // We could also add it to a 'custom' list in state if we want to show it as a pill immediately.
      const newCat = { id: `custom-${Date.now()}`, name: trimmed, isCustom: true };
      setCategories(prev => [...prev, newCat]);

      const newSelected = new Set(selected);
      newSelected.add(trimmed);
      setSelected(newSelected);
      setCustomTag('');
    } else {
      // If it exists, just select it
      toggleCategory(trimmed);
      setCustomTag('');
    }
  };

  return (
    <div className="relative h-screen flex flex-col bg-white overflow-hidden animate-in fade-in duration-700">
      {/* 顶部装饰性背景 */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-indigo-50 to-transparent -z-10 opacity-60"></div>
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-50"></div>

      {/* 限制警告 Toast */}
      {showLimitWarning && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-slate-900 text-white px-4 py-2 rounded-full text-[10px] font-bold flex items-center gap-2 shadow-2xl">
            <AlertCircle size={14} className="text-amber-400" />
            最多只能选择 3 个领域哦
          </div>
        </div>
      )}

      <div className="px-8 pt-16 pb-6 shrink-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 animate-in slide-in-from-top-4 duration-500">
          <Sparkles size={12} /> 开启进阶之旅
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2 font-serif-sc tracking-tight animate-in slide-in-from-top-6 duration-700">
          选择你的领域
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-[240px] animate-in slide-in-from-top-8 duration-700">
          专注成就卓越，<br />请选择最多 3 个你最想深耕的领域。
        </p>
      </div>

      <div className="flex-grow overflow-y-auto px-8 pt-4 pb-52 scrollbar-hide">
        {/* 已选计数 */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-slate-300" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">初始化分类</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-all ${selected.size === 3 ? 'bg-amber-100 text-amber-600' : 'bg-indigo-50 text-indigo-500'}`}>
                已选 {selected.size}/3
              </span>
            </div>

            {/* 标签网格 */}
            <div className="grid grid-cols-2 gap-3 mb-10">
              {categories.map((cat, index) => {
                const isSelected = selected.has(cat.name);
                const isDisabled = !isSelected && selected.size >= 3;
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.name)}
                    style={{ animationDelay: `${index * 30}ms` }}
                    className={`group relative flex items-center justify-center h-14 rounded-2xl transition-all duration-300 overflow-hidden animate-in zoom-in-95 fill-mode-both ${isSelected
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 ring-2 ring-indigo-600 ring-offset-2'
                        : isDisabled
                          ? 'bg-slate-50 border border-slate-50 text-slate-200 cursor-not-allowed opacity-50'
                          : 'bg-slate-50 border border-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-white'
                      }`}
                  >
                    {isSelected && (
                      <div className="absolute top-0 right-0 w-8 h-8 bg-white/20 rounded-bl-2xl flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                    <span className={`text-sm font-bold tracking-wide ${isSelected ? 'scale-105' : 'scale-100'} transition-transform`}>
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 自定义标签区域 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">自定义领域</span>
              </div>
              <div className="relative group">
                <input
                  type="text"
                  disabled={selected.size >= 3}
                  placeholder={selected.size >= 3 ? "已选达上限" : "例如：量子力学、陶艺..."}
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  className={`w-full rounded-2xl px-6 py-4 text-sm transition-all outline-none border ${selected.size >= 3
                      ? 'bg-slate-50 border-transparent text-slate-200 cursor-not-allowed'
                      : 'bg-slate-50 border-slate-100 text-slate-600 focus:ring-2 focus:ring-indigo-100 focus:bg-white'
                    }`}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                />
                <button
                  onClick={addCustomTag}
                  disabled={selected.size >= 3 || !customTag.trim()}
                  className={`absolute right-3 top-3 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${customTag.trim() && selected.size < 3
                      ? 'bg-indigo-600 text-white shadow-md rotate-0 scale-100'
                      : 'bg-slate-200 text-slate-400 rotate-90 scale-90 opacity-50'
                    }`}
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部确认按钮容器 */}
      <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-white via-white to-transparent pt-12 z-10">
        <button
          disabled={selected.size === 0}
          onClick={() => onConfirm(Array.from(selected))}
          className={`group relative w-full h-16 rounded-2xl font-bold text-base shadow-2xl transition-all flex items-center justify-center gap-3 overflow-hidden ${selected.size > 0
              ? 'bg-slate-900 text-white active:scale-95 shadow-slate-200'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none'
            }`}
        >
          {selected.size > 0 && (
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          )}
          开始无涯之旅
          <Rocket size={18} className={`${selected.size > 0 ? 'animate-bounce' : ''}`} />
        </button>
        <p className="text-center text-[10px] text-slate-400 mt-4 tracking-widest uppercase font-bold opacity-60">
          BOUNDLESS LEARNING · AT MOST 3 TAGS
        </p>
      </div>
    </div>
  );
};

export default CategorySelector;
