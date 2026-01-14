
import React, { useState, useEffect, useRef } from 'react';
import { Friend, UserProfile } from '../types';
import { friendService } from '../services/friendService';
import { notificationService } from '../services/notificationService';
import { supabase } from '../lib/supabase';
import { UserPlus, Bell, Search, Sparkles, X, Check, UserCircle, BellRing, Trash2, AlertCircle, Send, ChevronRight, BookOpen } from 'lucide-react';

interface FriendsViewProps {
  user: UserProfile;
}

const FriendsView: React.FC<FriendsViewProps> = ({ user }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadFriends();

    // Subscribe to real-time friendship changes
    const channel = supabase
      .channel('realtime_friendships')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships'
        },
        async (payload) => {
          // Check if this friendship involves the current user
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const newFriendship = payload.new as any;
          const oldFriendship = payload.old as any;

          const isInvolved =
            (newFriendship?.user_id === user.id || newFriendship?.friend_id === user.id) ||
            (oldFriendship?.user_id === user.id || oldFriendship?.friend_id === user.id);

          if (isInvolved) {
            // Re-load friends list to ensure cache and state are updated
            const freshList = await friendService.getFriends(user.id, true);
            setFriends(freshList);
          }
        }
      )
      .subscribe();

    // Subscribe to real-time study notes (for study day sync)
    const notesChannel = supabase
      .channel('realtime_notes_for_friends')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes'
        },
        async () => {
          // Whenever a note is added/deleted, refresh the list to update study days
          // Using forceRefresh=true ensures we bypass the 30s cache
          const freshList = await friendService.getFriends(user.id, true);
          setFriends(freshList);
        }
      )
      .subscribe();

    // Subscribe to real-time profiles (for user info updates)
    const profilesChannel = supabase
      .channel('realtime_profiles_for_friends')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        },
        async (payload) => {
          const updatedProfile = payload.new as any;
          // Only refresh if the updated profile is one of our friends
          setFriends(prev => {
            if (prev.some(f => f.id === updatedProfile.id)) {
              // Trigger a background refresh
              friendService.getFriends(user.id, true).then(setFriends);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(notesChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, []);

  const loadFriends = async () => {
    try {
      const cached = friendService.getCacheInfo(user.id);

      if (cached) {
        // 1. Set from cache immediately
        setFriends(cached.data);

        // 2. Silent background refresh ONLY if cache is older than 30 seconds
        const cacheAge = Date.now() - cached.timestamp;
        if (cacheAge > 30 * 1000) {
          friendService.getFriends(user.id, true).then(freshList => {
            setFriends(freshList);
          });
        }
      } else {
        // 3. No cache at all: show skeleton and fetch
        setIsLoading(true);
        const freshList = await friendService.getFriends(user.id, true);
        setFriends(freshList);
        setIsLoading(false);
      }
    } catch (e) {
      console.error('Error loading friends:', e);
      setIsLoading(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addFriendId, setAddFriendId] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [friendToDelete, setFriendToDelete] = useState<Friend | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [swipedFriendId, setSwipedFriendId] = useState<string | null>(null);
  const searchSeqRef = useRef(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => setToast({ message, type });

  const handleSearch = async (query: string) => {
    setAddFriendId(query);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      const currentSeq = ++searchSeqRef.current;
      setIsSearching(true);
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const results = await friendService.searchUsers(query, authUser.id);
          // Only update if this is still the latest request
          if (currentSeq === searchSeqRef.current) {
            setSearchResults(results);
          }
        }
      } catch (e) {
        console.error('Search failed:', e);
      } finally {
        if (currentSeq === searchSeqRef.current) {
          setIsSearching(false);
        }
      }
    }, 300); // 300ms debounce
  };

  const handleAddSubmit = async (targetId: string, targetName: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      try {
        await friendService.sendFriendRequest(user.id, targetId);
        showToast(`🚀 已向「${targetName}」发送同砚申请`, 'info');
        // Update local status to avoid double clicking
        setSearchResults(prev => prev.map(r => r.id === targetId ? { ...r, friendshipStatus: 'pending', isInitiator: true } : r));
      } catch (e) {
        showToast('发送申请失败', 'info');
      }
    }
  };

  const deleteFriend = async () => {
    if (!friendToDelete) return;
    try {
      await friendService.removeFriendship(user.id, friendToDelete.id);
      setFriends(friends.filter(f => f.id !== friendToDelete.id));
      showToast(`已解除与「${friendToDelete.name}」的同砚关系`, 'info');
      setFriendToDelete(null);
      setSwipedFriendId(null);
    } catch (e) {
      showToast('解除失败，请重试', 'info');
    }
  };

  const handleRemind = async (friend: Friend) => {
    if (friend.isReminded) return;

    try {
      const result = await notificationService.sendStudyReminder(user.id, friend.id);
      if (result.success) {
        friendService.invalidateCache(user.id);
        setFriends(friends.map(f => f.id === friend.id ? { ...f, isReminded: true } : f));
        showToast(`已提醒 ${friend.name} 来学习`);
      } else {
        showToast(result.message || '操作失败', 'info');
        // Mark as reminded locally if we got a message (meaning it was sent recently)
        friendService.invalidateCache(user.id);
        setFriends(friends.map(f => f.id === friend.id ? { ...f, isReminded: true } : f));
      }
      setSwipedFriendId(null);
    } catch (e) {
      showToast('提醒失败，请重试', 'info');
    }
  };

  const filteredFriends = friends.filter(f => f.name.includes(searchQuery));

  return (
    <div className="bg-white min-h-full pb-20 relative animate-in fade-in overflow-hidden">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-[320px] animate-in slide-in-from-top-10 fade-in duration-300">
          <div className={`px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border ${toast.type === 'success' ? 'bg-slate-900/90 text-white border-slate-700' : 'bg-indigo-600/90 text-white border-indigo-500'}`}>
            <Check size={18} /> <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* 搜索与添加 */}
      <div className="p-4 bg-slate-50 flex gap-3 sticky top-0 z-10">
        <div className="flex-grow relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            type="text"
            placeholder="搜索我的同砚..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
          />
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform shrink-0">
          <UserPlus size={20} />
        </button>
      </div>

      {/* 好友列表 */}
      <div className="divide-y divide-slate-50">
        {isLoading ? (
          <FriendsSkeleton />
        ) : filteredFriends.length === 0 ? (
          <div className="py-20 text-center opacity-20">
            <UserCircle size={48} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm">暂无同砚</p>
          </div>
        ) : filteredFriends.map(friend => (
          <SwipeableListItem
            key={friend.id}
            isSwiped={swipedFriendId === friend.id}
            onSwipe={(open) => setSwipedFriendId(open ? friend.id : null)}
            onDelete={() => setFriendToDelete(friend)}
            onRemind={() => handleRemind(friend)}
            isReminded={friend.isReminded}
          >
            <div className="flex items-center gap-4 py-4 px-6 bg-white active:bg-slate-50 transition-colors cursor-pointer w-full">
              <img src={friend.avatar} className="w-12 h-12 rounded-2xl object-cover bg-slate-50 border border-slate-100" />
              <div className="flex-grow overflow-hidden">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-slate-800 text-sm truncate">{friend.name}</h4>
                  <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">{friend.lastActive}活跃</span>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] text-slate-400 truncate">{friend.bio || '无涯学子'}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                    <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter">本月已学 {friend.checkInDays} 天</span>
                    <span className="text-[9px] text-slate-300 mx-1">|</span>
                    <div className="flex items-center gap-1">
                      {friend.hasCheckedInToday ? (
                        <span className="text-[9px] font-bold text-green-500">今日已打卡</span>
                      ) : (
                        <>
                          <span className="text-[9px] font-bold text-rose-400">今日未学</span>
                          <span className="text-[8px] text-slate-300 italic">(左滑提醒Ta)</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-200 shrink-0" />
            </div>
          </SwipeableListItem>
        ))}
      </div>

      {/* 寻觅弹窗 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-lg font-bold">寻觅同砚</h3>
              <button onClick={() => { setIsAddModalOpen(false); setSearchResults([]); setAddFriendId(''); }}><X size={20} className="text-slate-300" /></button>
            </div>

            <div className="relative mb-6 shrink-0">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                placeholder="输入 ID 或用户名..."
                value={addFriendId}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full bg-slate-50 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
              />
            </div>

            <div className="flex-grow overflow-y-auto space-y-4 scrollbar-hide py-2">
              {isSearching ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" /></div>
              ) : searchResults.length === 0 ? (
                addFriendId.trim() ? (
                  <div className="text-center py-8 text-slate-400 text-xs">未找到匹配的同砚</div>
                ) : (
                  <div className="text-center py-8 text-slate-300 text-xs italic">输入 UID 或用户名开始查找</div>
                )
              ) : (
                searchResults.map(result => (
                  <div key={result.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-100 transition-all">
                    <img src={result.avatar} className="w-10 h-10 rounded-xl object-cover bg-white" />
                    <div className="flex-grow min-w-0">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{result.name}</h4>
                      <p className="text-[10px] text-slate-400 truncate tracking-tight">{result.bio || '无涯学子'}</p>
                    </div>

                    {result.friendshipStatus === 'accepted' ? (
                      <span className="text-[10px] font-bold text-slate-300 px-3 py-1.5 bg-slate-100 rounded-xl shrink-0">已是同砚</span>
                    ) : result.friendshipStatus === 'pending' ? (
                      <span className="text-[10px] font-bold text-indigo-400 px-3 py-1.5 bg-indigo-50 rounded-xl shrink-0">
                        {result.isInitiator ? '已申请' : '待处理'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAddSubmit(result.id, result.name)}
                        className="p-2 bg-slate-900 text-white rounded-xl shadow-lg active:scale-90 transition-transform shrink-0"
                      >
                        <UserPlus size={16} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <p className="mt-4 text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold opacity-60 shrink-0">Search by Boundless ID or Name</p>
          </div>
        </div>
      )}

      {/* 解约确认 */}
      {friendToDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-xs rounded-[40px] p-8 text-center shadow-2xl">
            <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-4"><AlertCircle size={28} /></div>
            <h3 className="text-lg font-bold mb-2 text-slate-900">解除关系？</h3>
            <p className="text-xs text-slate-400 mb-8">确定要解除与「{friendToDelete.name}」的同砚关系吗？</p>
            <div className="flex flex-col gap-2">
              <button onClick={deleteFriend} className="py-4 bg-rose-500 text-white rounded-2xl text-sm font-bold shadow-lg shadow-rose-100">确认解除</button>
              <button onClick={() => { setFriendToDelete(null); setSwipedFriendId(null); }} className="py-4 bg-slate-100 text-slate-400 rounded-2xl text-sm font-bold">我再想想</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 滑动组件实现：支持左滑展现右侧按钮组
const SwipeableListItem: React.FC<{
  children: React.ReactNode,
  isSwiped: boolean,
  onSwipe: (open: boolean) => void,
  onDelete: () => void,
  onRemind: () => void,
  isReminded: boolean
}> = ({ children, isSwiped, onSwipe, onDelete, onRemind, isReminded }) => {
  const startX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - startX.current;
    // 左滑展示 (deltaX 为负值)
    if (deltaX < -40 && !isSwiped) {
      onSwipe(true);
    }
    // 右滑收起 (deltaX 为正值)
    else if (deltaX > 40 && isSwiped) {
      onSwipe(false);
    }
  };

  return (
    <div className="relative overflow-hidden bg-slate-50">
      {/* 右侧隐藏按钮组 */}
      <div className="absolute inset-y-0 right-0 w-32 flex z-0">
        {/* 提醒按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemind(); }}
          disabled={isReminded}
          className={`flex-1 flex flex-col items-center justify-center transition-colors ${isReminded ? 'bg-slate-100 text-slate-300' : 'bg-indigo-600 text-white'}`}
        >
          {isReminded ? <Check size={18} /> : <Bell size={18} />}
          <span className="text-[9px] font-bold mt-1">{isReminded ? '已提醒' : '提醒'}</span>
        </button>
        {/* 删除按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex-1 flex flex-col items-center justify-center bg-rose-500 text-white"
        >
          <Trash2 size={18} />
          <span className="text-[9px] font-bold mt-1">删除</span>
        </button>
      </div>

      {/* 主内容区：通过 translateX 实现偏移 */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 transition-transform duration-300 ease-out bg-white"
        style={{ transform: isSwiped ? 'translateX(-128px)' : 'translateX(0px)' }}
      >
        {children}
      </div>
    </div>
  );
};

const FriendsSkeleton: React.FC = () => {
  return (
    <div className="divide-y divide-slate-50">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex items-center gap-4 py-4 px-6 animate-pulse">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 shrink-0" />
          <div className="flex-grow">
            <div className="flex justify-between items-center mb-2">
              <div className="h-4 bg-slate-100 w-24 rounded-lg" />
              <div className="h-3 bg-slate-50 w-12 rounded-lg" />
            </div>
            <div className="h-3 bg-slate-50 w-full max-w-[180px] rounded-lg" />
          </div>
          <div className="w-4 h-4 bg-slate-50 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
};

export default FriendsView;
