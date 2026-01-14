
import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { noteService } from '../services/noteService';
import { Note, UserProfile } from '../types';
import { ChevronLeft, ChevronRight, Plus, Edit3, Trash2, X, Check, Clock, Hash, Calendar as CalendarIcon, Zap } from 'lucide-react';

interface HomeViewProps {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  user: UserProfile;
}

const HomeView: React.FC<HomeViewProps> = ({ notes, setNotes, user }) => {
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const todayStr = getLocalDateString(new Date());
  const selectedDateStr = getLocalDateString(selectedDate);

  const filteredNotes = useMemo(() => {
    return notes.filter(note => note.date === selectedDateStr);
  }, [notes, selectedDateStr]);

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();
  const days = Array.from({ length: new Date(currentYear, currentMonth + 1, 0).getDate() }, (_, i) => i + 1);
  const offset = new Date(currentYear, currentMonth, 1).getDay();
  const emptyDays = Array.from({ length: offset }, (_, i) => i);

  const hasNoteOnDay = (day: number) => {
    const dStr = getLocalDateString(new Date(currentYear, currentMonth, day));
    return notes.some(n => n.date === dStr);
  };

  const isFuture = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d > now;
  };

  const handleDayClick = (day: number) => {
    if (isFuture(day)) return;
    setSelectedDate(new Date(currentYear, currentMonth, day));
  };

  const handleAddNote = () => {
    setEditingNote({
      id: Date.now().toString(),
      title: '',
      content: '',
      category: user.selectedCategories[0] || '学习',
      date: selectedDateStr,
      lastEdited: Date.now()
    });
    setIsEditorOpen(true);
  };

  const handleEditNote = (note: Note) => {
    setEditingNote({ ...note });
    setIsEditorOpen(true);
  };


  const handleSaveNote = async () => {
    if (!editingNote || !editingNote.title.trim()) return;

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Check if temporary ID (timestamp) or real ID (UUID usually)
      // Since we used Date.now().toString() for new notes in handleAddNote, 
      // we can check if it exists in the current list with a REAL id or if we are creating new.
      // Actually simpler: just assume if it's in the list it's an update, but we need to track if it's a "new" note being verified.
      // Better strategy: The note ID in handleAddNote is temporary.

      const isNew = !notes.some(n => n.id === editingNote.id && n.id.length > 20); // UUIDs are long
      // OR simpler: check if we are editing an existing note from the list

      let savedNote: Note;
      // Note: editingNote.id is Date.now() for new notes.
      // We should check if the note exists in the DB. Best way is to use the "notes" state to see if valid.
      const existing = notes.find(n => n.id === editingNote.id);

      if (existing) {
        // UPDATE
        // Optimistic Update
        const originalNotes = [...notes];
        const updatedListing = notes.map(n => n.id === editingNote.id ? editingNote : n);
        setNotes(updatedListing);
        setIsEditorOpen(false); // Close immediately

        try {
          await noteService.updateNote(editingNote.id, {
            title: editingNote.title,
            content: editingNote.content,
            category: editingNote.category,
          });
        } catch (e) {
          console.error('Update failed', e);
          alert('保存失败，正在撤销');
          setNotes(originalNotes); // Revert
        }
      } else {
        // CREATE
        const tempId = editingNote.id; // Currently Date.now() string
        const tempNote = { ...editingNote };

        // 1. Optimistic Add
        setNotes([tempNote, ...notes]);
        setIsEditorOpen(false); // Close immediately

        try {
          const newNoteData = await noteService.createNote(authUser.id, {
            title: editingNote.title,
            content: editingNote.content,
            category: editingNote.category,
            date: editingNote.date
          });

          // 2. Replace Temp Note with Real Note (Real ID)
          setNotes(currentNotes => currentNotes.map(n => n.id === tempId ? newNoteData : n));

        } catch (e) {
          console.error('Create failed', e);
          alert('保存失败，正在撤销');
          setNotes(currentNotes => currentNotes.filter(n => n.id !== tempId)); // Remove temp note
        }
      }

    } catch (e) {
      console.error('Failed to save note:', e);
      alert('保存失败，请重试');
    }
  };

  const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定删除这篇笔记吗？')) {
      try {
        await noteService.deleteNote(id);
        setNotes(notes.filter(n => n.id !== id));
      } catch (e) {
        console.error('Failed to delete note', e);
        alert('删除失败');
      }
    }
  };

  const isSelectedToday = selectedDateStr === todayStr;

  return (
    <div className="flex flex-col bg-slate-50 min-h-full">
      {/* 日历模块 */}
      <section className="m-4 p-5 bg-white rounded-3xl shadow-sm border border-slate-100/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <span className="text-indigo-600"><CalendarIcon size={18} /></span>
            {currentYear}年 {currentMonth + 1}月
          </h3>
          <div className="flex bg-slate-50 rounded-xl p-1">
            <button
              onClick={() => setViewDate(new Date(currentYear, currentMonth - 1, 1))}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setViewDate(new Date(currentYear, currentMonth + 1, 1))}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-400"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-300 font-bold mb-3 uppercase tracking-widest">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {emptyDays.map(i => <div key={`empty-${i}`} className="h-10"></div>)}
          {days.map(day => {
            const hasNote = hasNoteOnDay(day);
            const future = isFuture(day);
            const dateStr = getLocalDateString(new Date(currentYear, currentMonth, day));
            const isSelected = dateStr === selectedDateStr;
            const isTodayCell = dateStr === todayStr;

            return (
              <button
                key={day}
                disabled={future}
                onClick={() => handleDayClick(day)}
                className={`relative h-10 flex flex-col items-center justify-center rounded-2xl text-xs transition-all duration-200 ${isSelected ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 font-bold' :
                  isTodayCell ? 'bg-indigo-50 text-indigo-600 font-bold border border-indigo-100/50' :
                    future ? 'text-slate-200 cursor-not-allowed opacity-50' :
                      hasNote ? 'bg-indigo-50/30 text-indigo-600 font-medium' : 'text-slate-500 hover:bg-slate-50'
                  }`}
              >
                <span className={hasNote && !isSelected ? 'mt-[-4px]' : ''}>{day}</span>
                {hasNote && (
                  <div className={`absolute bottom-1 flex items-center justify-center ${isSelected ? 'text-white/80' : 'text-indigo-400'}`}>
                    <Check size={8} strokeWidth={4} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 打卡引导 - 仅在今日未打卡时显示 */}
      {isSelectedToday && filteredNotes.length === 0 && (
        <div className="mx-4 mb-4">
          <button
            onClick={handleAddNote}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-200 flex items-center justify-center gap-2 active:scale-95 transition-all font-bold group"
          >
            <Zap size={18} className="fill-yellow-400 text-yellow-400" />
            今日打卡学习
          </button>
        </div>
      )}

      {/* 笔记列表 - 容器背景色统一 */}
      <section className="flex-grow bg-white rounded-t-[40px] px-6 pt-8 pb-10 shadow-[0_-8px_30px_rgba(0,0,0,0.02)] border-t border-slate-50">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {isSelectedToday ? '今日' : `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日`} 笔记
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium uppercase tracking-widest">
              {filteredNotes.length} 篇足迹
            </p>
          </div>
          <button
            onClick={handleAddNote}
            className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 mb-4">
                <Edit3 size={32} />
              </div>
              <p className="text-sm font-medium">此刻空空如也...</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <div
                key={note.id}
                onClick={() => handleEditNote(note)}
                className="group p-5 rounded-3xl bg-slate-50/50 border border-slate-100 hover:bg-white hover:border-indigo-100 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 cursor-pointer"
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[10px] font-bold text-indigo-500 bg-white px-2 py-0.5 rounded-lg border border-slate-100 shadow-sm">
                    {note.category}
                  </span>
                  <button
                    onClick={(e) => handleDeleteNote(note.id, e)}
                    className="p-1 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <h4 className="font-bold text-slate-800 text-base mb-1">
                  {note.title || '记录中...'}
                </h4>
                <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                  {note.content || '未填写内容'}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 编辑器弹窗 */}
      {isEditorOpen && editingNote && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-50 shrink-0">
            <button onClick={() => setIsEditorOpen(false)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-full">
              <X size={24} />
            </button>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">记录所学</h3>
            <button onClick={handleSaveNote} disabled={!editingNote.title.trim()} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${editingNote.title.trim() ? 'text-white bg-indigo-600 shadow-md active:scale-95' : 'text-slate-300 bg-slate-50'}`}>
              保存
            </button>
          </div>
          <div className="flex-grow overflow-y-auto px-8 py-8 scrollbar-hide">
            <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
              <Hash size={14} className="text-slate-300 flex-shrink-0" />
              {user.selectedCategories.map(cat => (
                <button key={cat} onClick={() => setEditingNote({ ...editingNote, category: cat })} className={`px-4 py-1.5 rounded-2xl text-[10px] font-bold transition-all border whitespace-nowrap ${editingNote.category === cat ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <input autoFocus type="text" placeholder="在这里输入标题..." value={editingNote.title} onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })} className="w-full text-2xl font-bold mb-6 focus:outline-none placeholder:text-slate-100 text-slate-900 border-none bg-transparent" />
            <textarea placeholder="今天有什么心得体会？" value={editingNote.content} onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })} className="w-full h-[50vh] resize-none text-slate-600 focus:outline-none leading-relaxed text-base border-none bg-transparent placeholder:text-slate-200" />
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeView;
