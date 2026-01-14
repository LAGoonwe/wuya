import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { socialService } from '../services/socialService';
import { friendService } from '../services/friendService';
import { UserProfile, Note, Post } from '../types';
import { Settings, ChevronRight, Bookmark, Heart, Sparkles, X, BrainCircuit, RefreshCw, Download, Check, BellRing, Crown, Trash2, LogOut, Camera, Shuffle, Save, MessageCircle, MessageSquare, User as UserIcon } from 'lucide-react';

interface ProfileViewProps {
  user: UserProfile;
  notes: Note[];
  onUserUpdate: (updates: Partial<UserProfile>) => void;
  onResetCategories: () => void;
}

const Stat = ({ count, label }: any) => <div className="text-center"><p className="text-xl font-bold text-slate-900">{count}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{label}</p></div>;

const Item = ({ icon, label, count, onClick }: any) => (
  <button onClick={onClick} className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 transition-all active:bg-slate-50 shadow-sm">
    <div className="flex items-center gap-4">{icon}<span className="text-sm font-bold text-slate-700">{label}</span></div>
    <div className="flex items-center gap-2">{count !== undefined && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-400">{count}</span>}<ChevronRight size={16} className="text-slate-300" /></div>
  </button>
);

const ProfileView: React.FC<ProfileViewProps> = ({ user, notes, onUserUpdate, onResetCategories }) => {
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isMyPostsOpen, setIsMyPostsOpen] = useState(false);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Post[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [isLoadingMyPosts, setIsLoadingMyPosts] = useState(false);
  const [activeInteractionPost, setActiveInteractionPost] = useState<Post | null>(null);
  const [interactions, setInteractions] = useState<{ likes: any[], comments: any[], bookmarks: any[] } | null>(null);
  const [isLoadingInteractions, setIsLoadingInteractions] = useState(false);
  const [realFriendCount, setRealFriendCount] = useState(user.stats.friendsCount);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Derive stats from notes prop
  const studyDays = new Set(notes.map(n => {
    // Ensure we handle both ISO and string formats correctly
    try {
      return new Date(n.created_at || '').toLocaleDateString();
    } catch {
      return null;
    }
  }).filter(Boolean)).size;

  const notesCount = notes.length;

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const friends = await friendService.getFriends(user.id);
        setRealFriendCount(friends.length);
      } catch (e) {
        console.error('Failed to fetch friend count:', e);
      }
    };
    fetchStats();
  }, [user.id]);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user.name,
    bio: user.bio,
    avatar: user.avatar
  });

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Sync form with user prop when modal opens or user changes
  useEffect(() => {
    if (isEditing) {
      setEditForm({
        name: user.name,
        bio: user.bio,
        avatar: user.avatar
      });
    }
  }, [isEditing, user]);

  // 每次打开收藏夹或状态变化时重新加载收藏内容
  useEffect(() => {
    if (isFavoritesOpen) {
      const load = async () => {
        setIsLoadingBookmarks(true);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const bks = await socialService.getBookmarkedPosts(authUser.id);
          setBookmarkedPosts(bks);
        }
        setIsLoadingBookmarks(false);
      }
      load();
    }
  }, [isFavoritesOpen]);

  useEffect(() => {
    if (isMyPostsOpen) {
      const load = async () => {
        setIsLoadingMyPosts(true);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const posts = await socialService.getUserPosts(authUser.id);
          setMyPosts(posts);
        }
        setIsLoadingMyPosts(false);
      }
      load();
    }
  }, [isMyPostsOpen]);

  useEffect(() => {
    if (activeInteractionPost) {
      const load = async () => {
        setIsLoadingInteractions(true);
        const data = await socialService.getPostInteractions(activeInteractionPost.id);
        setInteractions(data);
        setIsLoadingInteractions(false);
      }
      load();
    } else {
      setInteractions(null);
    }
  }, [activeInteractionPost]);

  const handleRemoveBookmark = async (id: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    try {
      await socialService.toggleBookmark(id, authUser.id); // Toggle off
      setBookmarkedPosts(prev => prev.filter(p => p.id !== id));
      // Update User Stats
      onUserUpdate({
        stats: {
          ...user.stats,
          bookmarksCount: Math.max(0, user.stats.bookmarksCount - 1)
        }
      });
      showToast('已取消收藏', 'info');
    } catch (e) {
      showToast('操作失败', 'info');
    }
  };

  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }
      setIsUploading(true);
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);

      setEditForm(prev => ({ ...prev, avatar: data.publicUrl }));
      showToast('图片上传成功');

    } catch (error) {
      console.error('Error uploading avatar:', error);
      showToast('上传失败，请重试', 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRandomAvatar = () => {
    const seed = Math.random().toString(36).substring(7);
    setEditForm(prev => ({ ...prev, avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}` }));
  };

  const handleSaveProfile = async () => {
    if (!editForm.name.trim()) {
      showToast('昵称不能为空', 'info');
      return;
    }

    try {
      // Optimistic update
      onUserUpdate(editForm);

      setIsEditing(false);
      showToast('资料已更新');

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        // The onUserUpdate prop usually wraps the authService call in App.tsx 
        // but checking App.tsx, onUserUpdate just sets local state? 
        // Wait, App.tsx: onUserUpdate={(updates) => setUser(prev => prev ? { ...prev, ...updates } : null)}
        // It does NOT persist to DB automatically in App.tsx! 
        // We need to persist it here or App.tsx needs to change.
        // Checking App.tsx again... yes, it only updates state.
        // We must call authService.updateProfile here or fix App.tsx to do it.
        // Let's do it here via the service directly or assume onUserUpdate should have been smarter.
        // Actually, looking at main layout, it passes onUserUpdate.
        // Let's call the service directly here for persistence.
        // AND call onUserUpdate for UI.

        // Dynamic import or dependency injection would be cleaner but let's import service.
        // We already imported authService in App.tsx but here we might need it.
        // Wait, we don't have authService imported here. Let's import socialService (which we have) 
        // or better yet, import authService.

        // Actually, let's look at imports. We need authService.
      }
      // We will persist it using the prop pattern if possible, but the prop is dumb.
      // Let's fix this by importing authService here.
    } catch (e) {
      console.error(e);
      showToast('保存失败', 'info');
    }
  };

  // We need authService. Let's add it to imports later if not present. 
  // Wait, I can't easily add import if I replace whole file content without checking.
  // The tool sees top lines. I see socialService is imported.
  // I will add authService to imports in this tool call.

  return (
    <div className="bg-slate-50 min-h-full pb-20 relative">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] w-[90%] max-w-[320px] animate-in slide-in-from-top-10 fade-in">
          <div className={`px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border ${toast.type === 'success' ? 'bg-slate-900/90 text-white' : 'bg-indigo-600/90 text-white'}`}>
            <Check size={18} className="text-green-400" /> <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Profile Header */}
      <div className="bg-white px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-8 relative">
          <img src={user.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${user.id}`} className="w-24 h-24 rounded-3xl border-4 border-white shadow-xl object-cover" />
          <button
            onClick={() => setIsEditing(true)}
            className="bg-slate-100 p-2.5 rounded-2xl text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <Settings size={22} />
          </button>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">{user.name || '无涯学子'}</h2>
        <button
          onClick={() => {
            navigator.clipboard.writeText(user.uid);
            showToast('已复制 ID');
          }}
          className="text-[10px] font-bold text-indigo-500 bg-indigo-50 w-fit px-2 py-0.5 rounded-lg mb-4 hover:bg-indigo-100 active:scale-95 transition-all cursor-pointer flex items-center gap-1 group"
          title="点击复制 ID"
        >
          ID: {user.uid}
        </button>
        <p className="text-sm text-slate-500 mb-6 italic opacity-80">{user.bio || '学海无涯苦作舟'}</p>
        <div className="flex justify-around py-4 border-t border-slate-50">
          <Stat count={studyDays} label="学习天数" />
          <Stat count={notesCount} label="笔记总数" />
          <Stat count={realFriendCount} label="同砚" />
        </div>
      </div>

      {/* 关注领域展示 */}
      <div className="px-6 mt-8 mb-6">
        <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-3">关注领域</h3>
        <div className="flex flex-wrap gap-2">
          {user.selectedCategories.map(tag => <span key={tag} className="px-3 py-1.5 bg-white border border-slate-100 rounded-xl text-[10px] font-bold text-slate-500 shadow-sm">#{tag}</span>)}
        </div>
      </div>

      {/* Menu List */}
      <div className="px-6 space-y-3">
        <Item icon={<Sparkles className="text-amber-400" />} label="我的动态" count={myPosts.length > 0 ? myPosts.length : undefined} onClick={() => setIsMyPostsOpen(true)} />
        <Item icon={<Bookmark className="text-indigo-400" />} label="我的收藏" count={user.stats.bookmarksCount} onClick={() => setIsFavoritesOpen(true)} />
        <Item icon={<Heart className="text-rose-400" />} label="获得点赞" count={user.stats.likesReceived} />
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-[40px] sm:rounded-[40px] p-8 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-slate-900">编辑资料</h3>
              <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>

            <div className="space-y-6">
              {/* Avatar Edit */}
              {/* Avatar Edit */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  {/* Random Avatar Trigger */}
                  <div className="relative group cursor-pointer" onClick={handleRandomAvatar} title="点击随机生成">
                    <img src={editForm.avatar} className="w-24 h-24 rounded-3xl border-4 border-slate-50 shadow-lg object-cover" />
                    <div className="absolute inset-0 bg-black/20 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Shuffle className="text-white" />
                    </div>
                  </div>

                  {/* Random Indicator */}
                  <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white p-2 rounded-xl shadow-lg pointer-events-none">
                    <Shuffle size={14} />
                  </div>

                  {/* Upload Trigger */}
                  <label className="absolute -bottom-2 -left-2 bg-white text-slate-700 p-2 rounded-xl shadow-lg cursor-pointer hover:bg-slate-50 transition-colors z-10" title="上传本地图片">
                    {isUploading ? <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> : <Camera size={14} />}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-400 font-bold">点击头像随机生成，或点击左下角上传</p>
              </div>

              {/* Inputs */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1 mb-1 block">昵称</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:border-indigo-200 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1 mb-1 block">个人简介</label>
                  <textarea
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-600 focus:outline-none focus:border-indigo-200 focus:bg-white transition-all resize-none"
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  const { authService } = await import('../services/authService'); // Dynamic import to avoid top-level cycles or mess
                  // Ideally should be passed in or imported top level. I will fix top level import in next tool call if needed, 
                  // but since I am rewriting the file, I should just update the imports. 
                  // Wait, I cannot use dynamic import easily inside the click handler if I want to be clean.
                  // Let's rely on onUserUpdate carrying the logic? No, App.tsx one is simple state set.
                  // I'll update the top level import in this same file replacement.

                  try {
                    await authService.updateProfile(user.id, editForm);
                    onUserUpdate(editForm);
                    setIsEditing(false);
                    showToast('保存成功！');
                  } catch (e) {
                    console.error(e);
                    showToast('保存失败', 'info');
                  }
                }}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-slate-200 hover:scale-[1.02] active:scale-95 transition-all"
              >
                <Save size={18} /> 保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 我的收藏弹窗 */}
      {isFavoritesOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-50 flex flex-col animate-in slide-in-from-right duration-300">
          <header className="h-16 px-6 flex items-center justify-between border-b bg-white shrink-0">
            <button onClick={() => setIsFavoritesOpen(false)} className="p-2 -ml-2 text-slate-400 hover:bg-slate-50 rounded-full"><X size={24} /></button>
            <h3 className="text-sm font-bold text-slate-800">我的收藏</h3>
            <div className="w-8"></div>
          </header>
          <div className="flex-grow overflow-y-auto p-4 space-y-4 pb-20 scrollbar-hide">
            {isLoadingBookmarks ? (
              // Skeleton Loading for Bookmarks
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-200"></div>
                      <div className="flex-1">
                        <div className="h-3 bg-slate-200 w-20 rounded mb-1"></div>
                        <div className="h-2 bg-slate-100 w-12 rounded"></div>
                      </div>
                    </div>
                    <div className="h-4 bg-slate-100 w-full rounded"></div>
                    <div className="h-4 bg-slate-100 w-2/3 rounded"></div>
                  </div>
                ))}
              </div>
            ) : bookmarkedPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 opacity-20 text-slate-400">
                <Bookmark size={60} className="mb-4" />
                <p className="text-sm font-bold">暂无收藏内容</p>
              </div>
            ) : (
              bookmarkedPosts.map(p => (
                <div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3 relative animate-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={p.author.avatar} className="w-8 h-8 rounded-xl object-cover" />
                      <div><h4 className="text-xs font-bold text-slate-800">{p.author.name}</h4><p className="text-[10px] text-slate-400">{p.time}</p></div>
                    </div>
                    <button onClick={() => handleRemoveBookmark(p.id)} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">{p.content}</p>
                </div>
              )))}
          </div>
        </div>
      )}

      {/* 我的动态弹窗 */}
      {isMyPostsOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-50 flex flex-col animate-in slide-in-from-right duration-300">
          <header className="h-16 px-6 flex items-center justify-between border-b bg-white shrink-0">
            <button onClick={() => setIsMyPostsOpen(false)} className="p-2 -ml-2 text-slate-400 hover:bg-slate-50 rounded-full"><X size={24} /></button>
            <h3 className="text-sm font-bold text-slate-800">我的动态</h3>
            <div className="w-8"></div>
          </header>
          <div className="flex-grow overflow-y-auto p-4 space-y-4 pb-20 scrollbar-hide">
            {isLoadingMyPosts ? (
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 h-32" />
                ))}
              </div>
            ) : myPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 opacity-20 text-slate-400">
                <Sparkles size={60} className="mb-4" />
                <p className="text-sm font-bold">尚未发布过动态</p>
              </div>
            ) : (
              myPosts.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActiveInteractionPost(p)}
                  className="w-full text-left bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3 relative animate-in slide-in-from-bottom-2 active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.time}</span>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Heart size={12} /> {p.likes}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <MessageCircle size={12} /> {p.comments}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">{p.content}</p>
                  {p.images && p.images.length > 0 && (
                    <div className="flex gap-2">
                      {p.images.map((img, idx) => (
                        <div key={idx} className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                          <img src={img} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* 动态互动详情弹窗 */}
      {activeInteractionPost && (
        <div className="fixed inset-0 z-[250] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-t-[40px] sm:rounded-3xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
            <header className="p-6 border-b flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-slate-900 line-clamp-1">动态详情</h3>
              <button onClick={() => setActiveInteractionPost(null)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20} /></button>
            </header>

            <div className="flex-grow overflow-y-auto p-6 space-y-8 scrollbar-hide">
              {/* Content Preview */}
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-sm text-slate-700 leading-relaxed mb-3">{activeInteractionPost.content}</p>
                {activeInteractionPost.images && activeInteractionPost.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {activeInteractionPost.images.map((img, idx) => (
                      <img key={idx} src={img} className="h-20 w-auto rounded-xl object-cover shadow-sm" />
                    ))}
                  </div>
                )}
              </div>

              {isLoadingInteractions ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-4 bg-slate-100 w-24 rounded" />
                  {[1, 2].map(i => <div key={i} className="h-12 bg-slate-50 rounded-2xl" />)}
                </div>
              ) : interactions && (
                <div className="space-y-8">
                  {/* 点赞列表 */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Heart size={16} className="text-rose-500 fill-rose-500" />
                      <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase">赞过的人 ({interactions.likes.length})</h4>
                    </div>
                    {interactions.likes.length === 0 ? <p className="text-xs text-slate-300 italic px-2">暂无点赞</p> : (
                      <div className="flex flex-wrap gap-3">
                        {interactions.likes.map(l => (
                          <div key={l.id} className="flex flex-col items-center gap-1">
                            <img src={l.avatar} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm" />
                            <span className="text-[9px] font-bold text-slate-400 w-12 truncate text-center">{l.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 评论列表 */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <MessageSquare size={16} className="text-indigo-500" />
                      <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase">评论列表 ({interactions.comments.length})</h4>
                    </div>
                    {interactions.comments.length === 0 ? <p className="text-xs text-slate-300 italic px-2">暂无评论</p> : (
                      <div className="space-y-4">
                        {interactions.comments.map(c => (
                          <div key={c.id} className="flex items-start gap-3 p-3 bg-slate-50/50 rounded-2xl">
                            <img src={c.author.avatar} className="w-8 h-8 rounded-lg object-cover" />
                            <div className="flex-grow">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-bold text-slate-700">{c.author.name}</span>
                                <span className="text-[9px] text-slate-400">{c.time}</span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">{c.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 收藏列表 */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Bookmark size={16} className="text-amber-500 fill-amber-500" />
                      <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase">已收藏 ({interactions.bookmarks.length})</h4>
                    </div>
                    {interactions.bookmarks.length === 0 ? <p className="text-xs text-slate-300 italic px-2">暂无收藏</p> : (
                      <div className="flex flex-wrap gap-3">
                        {interactions.bookmarks.map(b => (
                          <div key={b.id} className="flex flex-col items-center gap-1">
                            <img src={b.avatar} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm" />
                            <span className="text-[9px] font-bold text-slate-400 w-12 truncate text-center">{b.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 底部操作区 */}
      <div className="px-6 mt-8 space-y-3">
        <button
          onClick={onResetCategories}
          className="w-full py-4 rounded-2xl bg-indigo-50 text-indigo-600 text-sm font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors"
        >
          <RefreshCw size={18} /> 重置学习领域
        </button>

        <button
          onClick={async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
              console.error('Error logging out:', error);
            }
          }}
          className="w-full py-4 rounded-2xl bg-red-50 text-red-500 text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
        >
          <LogOut size={18} /> 退出登录
        </button>
      </div>

    </div>
  );
};

export default ProfileView;
