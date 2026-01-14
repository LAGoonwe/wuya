
import React, { useState, useEffect, useRef } from 'react';
import { Post, Comment, UserProfile, Friend } from '../types';
import { socialService } from '../services/socialService';
import { notificationService } from '../services/notificationService';
import { friendService } from '../services/friendService';
import { storageService } from '../services/storageService';
import { supabase } from '../lib/supabase';
import {
  Heart, MessageCircle, Share2, MoreHorizontal, Send, X,
  Copy, Download, Image as ImageIcon, Link2, Check,
  BellRing, Trash2, AlertCircle, Bookmark, Smile, Filter, Hash, Search, UserCircle
} from 'lucide-react';

const COMMON_EMOJIS = ['✨', '📚', '💪', '🔥', '🎓', '📝', '🌱', '🌟', '🚀', '🎯', '💡', '🙌', '👏', '🎨', '🧠'];

interface SquareViewProps {
  user: UserProfile;
  onUserUpdate: (updates: Partial<UserProfile>) => void;
}

const SquareView: React.FC<SquareViewProps> = ({ user, onUserUpdate }) => {
  /* REMOVED MOCK POSTS INITIALIZATION */
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    loadPosts();

    // Subscribe to real-time posts
    const postsChannel = supabase
      .channel('realtime_posts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts'
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newPostId = payload.new.id;
            const fullPost = await socialService.getPostById(newPostId);
            if (fullPost) {
              setPosts(current => {
                if (current.some(p => p.id === newPostId)) return current;
                return [fullPost, ...current];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedPostId = payload.new.id;
            const fullPost = await socialService.getPostById(updatedPostId);
            if (fullPost) {
              setPosts(current => current.map(p => p.id === updatedPostId ? fullPost : p));
            }
          } else if (payload.eventType === 'DELETE') {
            // payload.old will contain the id if replica identity is full or it's the PK
            const deletedId = payload.old.id;
            if (deletedId) {
              setPosts(current => current.filter(p => p.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    // Subscribe to real-time likes
    const likesChannel = supabase
      .channel('realtime_likes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'likes'
        },
        (payload) => {
          const newPayload = payload.new as { post_id?: string } | null;
          const oldPayload = payload.old as { post_id?: string } | null;
          const postId = newPayload?.post_id || oldPayload?.post_id;
          if (!postId) return;

          setPosts(current => current.map(p => {
            if (p.id === postId) {
              const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
              return { ...p, likes: Math.max(0, p.likes + delta) };
            }
            return p;
          }));
        }
      )
      .subscribe();

    // Subscribe to real-time comments
    const commentsChannel = supabase
      .channel('realtime_comments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments'
        },
        (payload) => {
          const newPayload = payload.new as { post_id?: string } | null;
          const oldPayload = payload.old as { post_id?: string } | null;
          const postId = newPayload?.post_id || oldPayload?.post_id;
          if (!postId) return;

          setPosts(current => current.map(p => {
            if (p.id === postId) {
              const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
              return { ...p, comments: Math.max(0, p.comments + delta) };
            }
            return p;
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, []);

  const loadPosts = async () => {
    try {
      const cached = socialService.getCacheInfo();
      if (cached) {
        setPosts(cached.data);
        // Silent refresh if older than 30s
        if (Date.now() - cached.timestamp > 30000) {
          socialService.getPosts(0, 10, true).then(data => {
            setPosts(data);
            setPage(0);
            setHasMore(data.length === 10);
          });
        }
      } else {
        setIsLoading(true);
        const data = await socialService.getPosts(0, 10);
        setPosts(data);
        setPage(0);
        setHasMore(data.length === 10);
        setIsLoading(false);
      }
    } catch (e) {
      console.error(e);
      showToast('无法加载动态', 'info');
      setIsLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const newData = await socialService.getPosts(nextPage, 10);
      if (newData.length < 10) setHasMore(false);
      setPosts(prev => [...prev, ...newData]);
      setPage(nextPage);
    } catch (e) {
      console.error(e);
      showToast('加载失败', 'info');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadFriends = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const cached = friendService.getCacheInfo(authUser.id);
        if (cached) {
          setFriendList(cached.data);
          if (Date.now() - cached.timestamp > 30000) {
            friendService.getFriends(authUser.id, true).then(list => setFriendList(list));
          }
        } else {
          const list = await friendService.getFriends(authUser.id);
          setFriendList(list);
        }
      }
    } catch (e) {
      console.error('Failed to load friends for sharing:', e);
    }
  };

  useEffect(() => {
    loadFriends();
  }, []);

  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImages, setNewPostImages] = useState<string[]>([]);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isFilterActive, setIsFilterActive] = useState(false);

  // 支持多选标签状态
  const [selectedPublishTags, setSelectedPublishTags] = useState<string[]>(user.selectedCategories.slice(0, 1));
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const publishImageInputRef = useRef<HTMLInputElement>(null);

  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);
  const [activeSharePost, setActiveSharePost] = useState<Post | null>(null);
  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // 发给好友相关状态
  const [isSelectFriendOpen, setIsSelectFriendOpen] = useState(false);
  const [selectedFriendsForShare, setSelectedFriendsForShare] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [friendList, setFriendList] = useState<Friend[]>([]);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);

  // Removed LocalStorage sync

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    if (newPostImages.length + files.length > 3) {
      showToast('最多上传3张图片', 'info');
      return;
    }

    setIsUploadingImages(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const uploadPromises = files.map(file => storageService.uploadPostImage(file, authUser.id));
      const urls = await Promise.all(uploadPromises);
      setNewPostImages(prev => [...prev, ...urls]);
    } catch (e) {
      console.error(e);
      showToast('图片上传失败', 'info');
    } finally {
      setIsUploadingImages(false);
      // Reset input
      if (publishImageInputRef.current) publishImageInputRef.current.value = '';
    }
  };

  const removeImage = (url: string) => {
    setNewPostImages(prev => prev.filter(i => i !== url));
  };

  const addEmoji = (emoji: string) => {
    setNewPostContent(prev => prev + emoji);
    setIsEmojiPickerOpen(false);
  };

  const publishPost = async () => {
    if (isUploadingImages) {
      showToast('图片正在上传中...', 'info');
      return;
    }
    if (!newPostContent.trim() && newPostImages.length === 0) return;

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const tempId = 'temp-' + Date.now();
    const savedContent = newPostContent;
    const savedImages = newPostImages;
    const savedTags = selectedPublishTags;

    // 1. Create Optimistic Post object
    const optimisticPost: Post = {
      id: tempId,
      userId: authUser.id,
      author: {
        name: user.name,
        avatar: user.avatar
      },
      content: savedContent,
      images: savedImages,
      likes: 0,
      comments: 0,
      isLiked: false,
      isBookmarked: false,
      time: '刚刚',
      tags: savedTags.length > 0 ? savedTags : ['成长']
    };

    // 2. Prepend to state
    setPosts(prev => [optimisticPost, ...prev]);

    setNewPostContent('');
    setNewPostImages([]);
    setSelectedPublishTags(user.selectedCategories.slice(0, 1));
    setIsEmojiPickerOpen(false);

    try {
      const dbRecord = await socialService.createPost(
        authUser.id,
        savedContent,
        savedImages,
        savedTags.length > 0 ? savedTags : ['成长']
      );

      // 3. Instead of double-fetching, the Realtime listener will handle adding the 'real' post
      // We just need to remove our temp post once we know it succeeded by checking by content or similar, 
      // or just wait for the Realtime event to come in. 
      // To be safe, let's keep the temp post but update its ID so Realtime skip it.

      const fullPost = await socialService.getPostById(dbRecord.id);
      if (fullPost) {
        setPosts(prev => {
          // If Realtime listener already prepended this post, just remove the temp one
          if (prev.some(p => p.id === fullPost.id)) {
            return prev.filter(p => p.id !== tempId);
          }
          // Otherwise replace the temp one with the real one
          return prev.map(p => p.id === tempId ? fullPost : p);
        });
      } else {
        loadPosts();
      }

      showToast('✨ 动态发布成功');
    } catch (e) {
      // 4. Rollback on failure
      setPosts(prev => prev.filter(p => p.id !== tempId));
      setNewPostContent(savedContent);
      showToast('发布失败，请重试', 'info');
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedPublishTags.includes(tag)) {
      setSelectedPublishTags(selectedPublishTags.filter(t => t !== tag));
    } else {
      setSelectedPublishTags([...selectedPublishTags, tag]);
    }
  };



  const handleShareToFriendsConfirm = async () => {
    if (selectedFriendsForShare.size === 0 || !activeSharePost) return;

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    try {
      const sharePromises = (Array.from(selectedFriendsForShare) as string[]).map(friendId =>
        notificationService.sendShareNotification(
          authUser.id,
          friendId,
          activeSharePost.id,
          activeSharePost.content.substring(0, 50) + (activeSharePost.content.length > 50 ? '...' : '')
        )
      );

      await Promise.all(sharePromises);
      showToast(`🚀 动态已分享给 ${selectedFriendsForShare.size} 位同砚`);
    } catch (e: any) {
      console.error(e);
      showToast('分享失败，请检查网络', 'info');
    }

    setIsSelectFriendOpen(false);
    setActiveSharePost(null);
    setSelectedFriendsForShare(new Set());
    setFriendSearchQuery('');
  };

  const toggleFriendSelect = (id: string) => {
    const next = new Set(selectedFriendsForShare);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedFriendsForShare(next);
  };


  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);

  // For sharing dialog, simplified:
  const filteredFriends = friendList.filter(f => f.name.includes(friendSearchQuery));

  const displayedPosts = isFilterActive
    ? posts.filter(post => post.tags.some(tag => user.selectedCategories.includes(tag)))
    : posts;

  return (
    <div className="bg-slate-50 min-h-full pb-20 relative">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[250] w-[90%] max-w-[320px] animate-in slide-in-from-top-10 fade-in duration-300">
          <div className={`px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border ${toast.type === 'success' ? 'bg-slate-900/90 text-white border-slate-700' : 'bg-indigo-600/90 text-white border-indigo-500'}`}>
            {toast.type === 'success' ? <Check size={18} className="text-green-400" /> : <BellRing size={18} className="text-white" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* 筛选条 */}
      <div className="px-6 pt-4 flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{isFilterActive ? '已开启关注筛选' : '全站最新动态'}</h3>
        <button
          onClick={() => {
            setIsFilterActive(!isFilterActive);
            showToast(isFilterActive ? '展示全部动态' : '已筛选关注领域动态', 'info');
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${isFilterActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-100'}`}
        >
          <Filter size={12} /> {isFilterActive ? '显示全部' : '只看关注'}
        </button>
      </div>

      {/* 发布框 */}
      <div className="m-4 p-5 bg-white rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden">
        <textarea
          placeholder="此时此刻，有什么学习心得？"
          value={newPostContent}
          onChange={(e) => setNewPostContent(e.target.value)}
          className="w-full h-24 p-4 text-sm text-slate-600 focus:outline-none resize-none bg-slate-50 rounded-2xl mb-4"
        />

        {/* 多选标签区域 */}
        <div className="mb-4">
          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-2 px-1">发布到领域标签</p>
          <div className="flex flex-wrap gap-2">
            {user.selectedCategories.map(tag => {
              const isSelected = selectedPublishTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-1 ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-100'
                    }`}
                >
                  <Hash size={10} />
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {newPostImages.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
            {newPostImages.map((img, idx) => (
              <div key={idx} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden group">
                <img src={img} className="w-full h-full object-cover" />
                <button onClick={() => setNewPostImages(newPostImages.filter((_, i) => i !== idx))} className="absolute top-1 right-1 p-1 bg-black/40 text-white rounded-full"><X size={10} /></button>
              </div>
            ))}
          </div>
        )}

        {isEmojiPickerOpen && (
          <div className="absolute left-5 bottom-20 z-30 bg-white rounded-2xl shadow-2xl border border-slate-100 p-3 flex flex-wrap gap-2 w-48 animate-in zoom-in-95">
            {COMMON_EMOJIS.map(e => <button key={e} onClick={() => { setNewPostContent(prev => prev + e); setIsEmojiPickerOpen(false); }} className="text-lg hover:scale-125 transition-transform">{e}</button>)}
          </div>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-slate-50">
          <div className="flex gap-4 text-slate-300">
            <input
              type="file"
              ref={publishImageInputRef}
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
            />
            <button
              onClick={() => publishImageInputRef.current?.click()}
              disabled={isUploadingImages || newPostImages.length >= 3}
              className={`p-1 transition-colors ${isUploadingImages ? 'animate-pulse text-indigo-300' : 'hover:text-indigo-500'}`}
            >
              <ImageIcon size={20} />
            </button>
            <button onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)} className="p-1 hover:text-indigo-500 transition-colors"><Smile size={20} /></button>
          </div>
          <button
            onClick={publishPost}
            disabled={!newPostContent.trim() && newPostImages.length === 0}
            className={`px-8 py-2.5 rounded-2xl text-xs font-bold transition-all ${newPostContent.trim() || newPostImages.length > 0 ? 'bg-slate-900 text-white shadow-xl' : 'bg-slate-100 text-slate-300'}`}
          >
            发布
          </button>
        </div>
      </div>

      {/* 列表渲染 */}
      <div className="space-y-4 px-4 pb-10">
        {isLoading ? (
          // Skeleton Loading State
          <div className="space-y-4 animate-pulse">
            {[1, 2].map(i => (
              <div key={i} className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-slate-200"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded w-24 mb-1"></div>
                    <div className="h-3 bg-slate-100 rounded w-16"></div>
                  </div>
                </div>
                <div className="h-4 bg-slate-100 rounded w-full mb-2"></div>
                <div className="h-4 bg-slate-100 rounded w-3/4 mb-4"></div>
                <div className="h-40 bg-slate-100 rounded-2xl mb-4"></div>
                <div className="flex gap-2">
                  <div className="h-6 w-12 bg-slate-100 rounded-xl"></div>
                  <div className="h-6 w-12 bg-slate-100 rounded-xl"></div>
                </div>
              </div>
            ))}
          </div>
        ) : displayedPosts.length === 0 ? (
          <div className="py-20 text-center text-slate-300 opacity-30"><Filter size={40} className="mx-auto mb-2" /><p className="text-sm">暂无该领域的动态</p></div>
        ) : displayedPosts.map(post => (
          <div key={post.id} className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img src={post.author.avatar} className="w-10 h-10 rounded-2xl object-cover bg-slate-100 shadow-sm" />
                <div><h4 className="text-sm font-bold text-slate-800">{post.author.name}</h4><p className="text-[10px] text-slate-400 font-medium">{post.time}</p></div>
              </div>
              <div className="relative">
                <button onClick={() => setActiveMenuPostId(activeMenuPostId === post.id ? null : post.id)} className="p-2 text-slate-300 hover:bg-slate-50 rounded-xl transition-colors"><MoreHorizontal size={20} /></button>
                {activeMenuPostId === post.id && (
                  <div className="absolute right-0 top-10 w-32 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-20 animate-in zoom-in-95">
                    {post.userId === user.id && (
                      <>
                        <button
                          onClick={() => {
                            setEditingPost(post);
                            setIsEditModalOpen(true);
                            setActiveMenuPostId(null);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <MoreHorizontal size={14} /> 编辑动态
                        </button>
                        <button onClick={() => setPostToDelete(post.id)} className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50">
                          <Trash2 size={14} /> 删除动态
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-4 whitespace-pre-wrap">{post.content}</p>
            {post.images && post.images.length > 0 && (
              <div className={`grid gap-2 mb-4 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {post.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    onClick={() => setSelectedPreviewImage(img)}
                    className="rounded-2xl w-full h-40 object-cover border border-slate-50 cursor-zoom-in hover:opacity-95 transition-opacity"
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mb-5">
              {post.tags.map(tag => <span key={tag} className="text-[10px] font-bold text-indigo-500 bg-indigo-50/50 px-3 py-1.5 rounded-xl">#{tag}</span>)}
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-slate-50 text-slate-400">
              <div className="flex gap-6">
                <button onClick={async () => {
                  // Optimistic update
                  const isNowLiked = !post.isLiked;
                  const newCount = isNowLiked ? post.likes + 1 : post.likes - 1;
                  setPosts(posts.map(p => p.id === post.id ? { ...p, isLiked: isNowLiked, likes: newCount } : p));

                  const { data: { user: authUser } } = await supabase.auth.getUser();
                  if (authUser) {
                    try {
                      await socialService.toggleLike(post.id, authUser.id);

                      // If liking OWN post, update stats
                      if (post.userId === authUser.id) {
                        onUserUpdate({
                          stats: {
                            ...user.stats,
                            likesReceived: isNowLiked ? user.stats.likesReceived + 1 : Math.max(0, user.stats.likesReceived - 1)
                          }
                        });
                      }
                    } catch (e) {
                      // Revert if fail
                      setPosts(posts.map(p => p.id === post.id ? { ...p, isLiked: !isNowLiked, likes: post.likes } : p));
                    }
                  }
                }} className={`flex items-center gap-2 text-xs font-bold transition-all ${post.isLiked ? 'text-rose-500' : ''}`}><Heart size={20} fill={post.isLiked ? 'currentColor' : 'none'} /> {post.likes}</button>
                <button onClick={() => setActiveCommentPost(post)} className="flex items-center gap-2 text-xs font-bold hover:text-slate-600"><MessageCircle size={20} /> {post.comments}</button>
                <button onClick={async () => {
                  const ns = !post.isBookmarked;
                  setPosts(posts.map(p => p.id === post.id ? { ...p, isBookmarked: ns } : p));
                  showToast(ns ? '🌟 已添加收藏' : '已取消收藏', 'info');

                  const { data: { user: authUser } } = await supabase.auth.getUser();
                  if (authUser) {
                    try {
                      const isBookmarked = await socialService.toggleBookmark(post.id, authUser.id);
                      // Update User Stats
                      onUserUpdate({
                        stats: {
                          ...user.stats,
                          bookmarksCount: isBookmarked ? user.stats.bookmarksCount + 1 : Math.max(0, user.stats.bookmarksCount - 1)
                        }
                      });
                    } catch (e) {
                      // Revert
                      setPosts(posts.map(p => p.id === post.id ? { ...p, isBookmarked: !ns } : p));
                    }
                  }
                }} className={`flex items-center gap-2 text-xs font-bold ${post.isBookmarked ? 'text-amber-500' : ''}`}><Bookmark size={20} fill={post.isBookmarked ? 'currentColor' : 'none'} /></button>
              </div>
              <button onClick={() => setActiveSharePost(post)} className="p-1 hover:text-indigo-600 transition-colors"><Share2 size={20} /></button>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="py-6 text-center">
          <button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="px-8 py-3 bg-white border border-slate-100 text-slate-400 text-sm font-bold rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {isLoadingMore ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                <span>正在探索更多...</span>
              </div>
            ) : (
              "探索更多内容"
            )}
          </button>
        </div>
      )}

      <div className="h-20" /> {/* Bottom spacing */}

      {/* 评论弹窗 */}
      {activeCommentPost && (
        <CommentModal
          post={activeCommentPost}
          user={user}
          onClose={() => setActiveCommentPost(null)}
          onCommentAdded={(PostId) => {
            // Update local post comment count
            setPosts(posts.map(p => p.id === PostId ? { ...p, comments: p.comments + 1 } : p));
          }}
        />
      )}

      {/* 分享选项弹窗 */}
      {activeSharePost && !isSelectFriendOpen && !isPosterModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end bg-slate-900/40 animate-in fade-in">
          <div className="fixed inset-0" onClick={() => setActiveSharePost(null)}></div>
          <div className="relative bg-white w-full rounded-t-[40px] p-8 animate-in slide-in-from-bottom duration-300">
            <h3 className="text-center text-[10px] font-bold text-slate-400 tracking-widest mb-8 uppercase">分享动态</h3>
            <div className="grid grid-cols-3 gap-6 mb-8">
              <button onClick={() => {
                const url = window.location.href; // Simplified, ideally unique post URL
                navigator.clipboard.writeText(url);
                showToast('🔗 链接已复制');
                setActiveSharePost(null);
              }} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-indigo-50 text-indigo-600 shadow-sm transition-transform active:scale-95"><Link2 size={24} /></div>
                <span className="text-[10px] font-bold text-slate-500">复制链接</span>
              </button>
              <button onClick={() => setIsPosterModalOpen(true)} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-amber-50 text-amber-600 shadow-sm transition-transform active:scale-95"><ImageIcon size={24} /></div>
                <span className="text-[10px] font-bold text-slate-500">生成海报</span>
              </button>
              <button onClick={() => setIsSelectFriendOpen(true)} className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-900 text-white shadow-sm transition-transform active:scale-95"><Send size={24} /></div>
                <span className="text-[10px] font-bold text-slate-500">发给同砚</span>
              </button>
            </div>
            <button onClick={() => setActiveSharePost(null)} className="w-full py-4 bg-slate-50 rounded-2xl text-sm font-bold text-slate-400">取消</button>
          </div>
        </div>
      )}

      {/* 海报 Modal */}
      {isPosterModalOpen && activeSharePost && (
        <PosterModal
          post={activeSharePost}
          onClose={() => {
            setIsPosterModalOpen(false);
            setActiveSharePost(null);
          }}
        />
      )}

      {/* 发给好友 - 同砚选择弹窗 */}
      {isSelectFriendOpen && (
        <div className="fixed inset-0 z-[130] flex flex-col bg-slate-50 animate-in slide-in-from-bottom duration-300">
          <header className="h-16 px-6 flex items-center justify-between border-b bg-white shrink-0">
            <button onClick={() => setIsSelectFriendOpen(false)} className="p-2 -ml-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"><X size={24} /></button>
            <h3 className="text-sm font-bold text-slate-800">分享给同砚</h3>
            <button
              onClick={handleShareToFriendsConfirm}
              disabled={selectedFriendsForShare.size === 0}
              className={`text-sm font-bold ${selectedFriendsForShare.size > 0 ? 'text-indigo-600' : 'text-slate-300'}`}
            >
              确定({selectedFriendsForShare.size})
            </button>
          </header>

          <div className="p-4 bg-white sticky top-0 z-10">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                placeholder="搜索同砚..."
                value={friendSearchQuery}
                onChange={(e) => setFriendSearchQuery(e.target.value)}
                className="w-full bg-slate-50 rounded-2xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
              />
            </div>
          </div>

          <div className="flex-grow overflow-y-auto p-4 space-y-2 pb-20 scrollbar-hide">
            {filteredFriends.length === 0 ? (
              <div className="py-20 text-center opacity-20 text-slate-400">
                <UserCircle size={48} className="mx-auto mb-2" />
                <p className="text-sm">未找到同砚</p>
              </div>
            ) : filteredFriends.map(friend => {
              const isSelected = selectedFriendsForShare.has(friend.id);
              return (
                <button
                  key={friend.id}
                  onClick={() => toggleFriendSelect(friend.id)}
                  className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 active:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <img src={friend.avatar} className="w-10 h-10 rounded-xl object-cover" />
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800">{friend.name}</p>
                      <p className="text-[10px] text-slate-400">#{friend.learningTags.join(' #')}</p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200 bg-white'}`}>
                    {isSelected && <Check size={14} className="text-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {postToDelete && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-xs rounded-[40px] p-8 text-center shadow-2xl">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-4"><AlertCircle size={28} /></div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">确认删除？</h3>
            <p className="text-xs text-slate-400 mb-8">删除后动态将永久消失，不可找回。</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  try {
                    const id = postToDelete;
                    setPostToDelete(null); // Close modal first
                    await socialService.deletePost(id);
                    setPosts(current => current.filter(p => p.id !== id));
                    showToast('已删除动态', 'info');
                  } catch (e) {
                    showToast('删除失败', 'info');
                  }
                }}
                className="w-full py-4 bg-red-500 text-white rounded-2xl text-sm font-bold shadow-lg shadow-red-100 active:scale-95 transition-all"
              >
                确认删除
              </button>
              <button onClick={() => setPostToDelete(null)} className="w-full py-4 bg-slate-100 text-slate-400 rounded-2xl text-sm font-bold active:scale-95 transition-all">我再想想</button>
            </div>
          </div>
        </div>
      )}
      {/* 编辑动态弹窗 */}
      {isEditModalOpen && editingPost && (
        <EditPostModal
          post={editingPost}
          user={user}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingPost(null);
          }}
          onSave={async (content, images, tags) => {
            try {
              await socialService.updatePost(editingPost.id, { content, images, tags });
              showToast('✨ 动态更新成功');
              setIsEditModalOpen(false);
              setEditingPost(null);
              // Optimistic update
              setPosts(current => current.map(p => p.id === editingPost.id ? { ...p, content, images, tags } : p));
            } catch (e) {
              showToast('更新失败，请重试', 'info');
              console.error(e);
            }
          }}
        />
      )}

      {/* 图片预览 */}
      {selectedPreviewImage && (
        <div
          className="fixed inset-0 z-[500] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in transition-all"
          onClick={() => setSelectedPreviewImage(null)}
        >
          <button
            onClick={() => setSelectedPreviewImage(null)}
            className="absolute top-6 right-6 p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all z-10"
          >
            <X size={24} />
          </button>
          <img
            src={selectedPreviewImage}
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

// Sub-component for Comments to handle independent fetching
const CommentModal: React.FC<{ post: Post; user: UserProfile; onClose: () => void; onCommentAdded: (id: string) => void }> = ({ post, user, onClose, onCommentAdded }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');

  useEffect(() => {
    // Fetch comments
    socialService.getComments(post.id).then(data => {
      setComments(data);
      setLoading(false);
    });
  }, [post.id]);

  const submit = async () => {
    if (!input.trim()) return;

    // Optimistic
    const temp: Comment = {
      id: Date.now().toString(),
      author: user.name,
      avatar: user.avatar,
      content: input,
      time: '刚刚'
    };
    setComments([...comments, temp]);
    setInput('');

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      try {
        const realComment = await socialService.createComment(authUser.id, post.id, input);
        setComments(prev => prev.map(c => c.id === temp.id ? realComment : c));
        onCommentAdded(post.id);
      } catch (e) {
        console.error(e);
        alert('发送失败');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex flex-col justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
      <div className="fixed inset-0" onClick={onClose}></div>
      <div className="relative bg-white w-full max-h-[80vh] rounded-t-[40px] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center p-3"><div className="w-10 h-1 bg-slate-100 rounded-full"></div></div>
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-50">
          <h3 className="text-sm font-bold text-slate-900">动态评论 ({comments.length})</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full"><X size={20} /></button>
        </div>
        <div className="flex-grow overflow-y-auto px-6 py-6 space-y-6 scrollbar-hide">
          {loading ? (
            // Skeleton for Comments
            <div className="space-y-6 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-200 shrink-0"></div>
                  <div className="flex-grow space-y-2">
                    <div className="h-3 bg-slate-200 w-24 rounded"></div>
                    <div className="h-4 bg-slate-100 w-full rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) :
            comments.length > 0 ? (
              comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  <img src={c.avatar} className="w-8 h-8 rounded-xl object-cover" />
                  <div className="flex-grow">
                    <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-slate-800">{c.author}</span><span className="text-[10px] text-slate-300">{c.time}</span></div>
                    <p className="text-sm text-slate-600 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              ))
            ) : <div className="py-10 text-center text-slate-300 text-xs">暂无评论</div>}
        </div>
        <div className="p-6 bg-white border-t border-slate-50 pb-safe flex items-center gap-3">
          <input type="text" placeholder="笔墨传情..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className="flex-grow bg-slate-50 rounded-2xl px-5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none" />
          <button onClick={submit} disabled={!input.trim()} className={`w-10 h-10 flex items-center justify-center rounded-xl ${input.trim() ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`}><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};

// Poster Generation Modal
const PosterModal: React.FC<{ post: Post; onClose: () => void }> = ({ post, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    const generate = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Setup Canvas Size (Mobile Friendly Ratio)
      const width = 800;
      const height = 1200;
      canvas.width = width;
      canvas.height = height;

      // 2. Draw Background (Gradient)
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#f8fafc'); // slate-50
      gradient.addColorStop(1, '#ffffff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw active area border (subtle)
      ctx.strokeStyle = '#f1f5f9'; // slate-100
      ctx.lineWidth = 40;
      ctx.strokeRect(20, 20, width - 40, height - 40);

      // 3. Draw Header (App Name / Branding)
      ctx.fillStyle = '#6366f1'; // indigo-500
      ctx.font = 'bold 32px Inter, sans-serif';
      ctx.fillText('无涯 · Sea of Learning', 60, 100);

      // 4. Draw Post Card Background
      const cardY = 160;
      const cardHeight = 840;
      const cardWidth = 680;
      const cardX = (width - cardWidth) / 2;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.05)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 20;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 48);
      ctx.fill();
      ctx.restore();

      // 5. Draw Author info
      ctx.fillStyle = '#1e293b'; // slate-800
      ctx.font = 'bold 36px Inter, sans-serif';
      ctx.fillText(post.author.name, cardX + 140, cardY + 85);

      ctx.fillStyle = '#94a3b8'; // slate-400
      ctx.font = '500 24px Inter, sans-serif';
      ctx.fillText(post.time, cardX + 140, cardY + 125);

      // Draw Avatar (Placeholder or actual)
      try {
        const avatarImg = new Image();
        avatarImg.crossOrigin = "anonymous";
        avatarImg.src = post.author.avatar;
        await new Promise((resolve) => {
          avatarImg.onload = resolve;
          avatarImg.onerror = resolve;
        });
        ctx.save();
        roundRect(ctx, cardX + 40, cardY + 40, 80, 80, 24);
        ctx.clip();
        ctx.drawImage(avatarImg, cardX + 40, cardY + 40, 80, 80);
        ctx.restore();
      } catch (e) {
        // Fallback circle
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(cardX + 80, cardY + 80, 40, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Draw Content Text (Wrapped)
      ctx.fillStyle = '#334155'; // slate-700
      ctx.font = '32px Inter, sans-serif';
      wrapText(ctx, post.content, cardX + 60, cardY + 200, cardWidth - 120, 48);

      // 7. Draw Images (if any)
      if (post.images && post.images.length > 0) {
        try {
          const postImg = new Image();
          postImg.crossOrigin = "anonymous";
          postImg.src = post.images[0]; // Take first
          await new Promise(resolve => {
            postImg.onload = resolve;
            postImg.onerror = resolve;
          });

          const imgH = 340;
          ctx.save();
          roundRect(ctx, cardX + 60, cardY + 440, cardWidth - 120, imgH, 32);
          ctx.clip();
          // Aspect fill logic
          const ratio = Math.max((cardWidth - 120) / postImg.width, imgH / postImg.height);
          const w = postImg.width * ratio;
          const h = postImg.height * ratio;
          ctx.drawImage(postImg, cardX + 60 + (cardWidth - 120 - w) / 2, cardY + 440 + (imgH - h) / 2, w, h);
          ctx.restore();
        } catch (e) { }
      }

      // 8. Draw Footer QR/Code Area
      ctx.fillStyle = '#f8fafc';
      roundRect(ctx, cardX + 60, cardY + 760, cardWidth - 120, 60, 20);
      ctx.fill();

      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('学海无涯 · 苦作舟', width / 2, cardY + 800);
      ctx.textAlign = 'left';

      // 9. Bottom Promotion
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.fillText('加入无涯，与优秀者同行', width / 2 - 140, height - 100);

      setIsGenerating(false);
    };

    generate();
  }, [post]);

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `wuya-share-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in">
      <div className="absolute top-6 right-6 z-10">
        <button onClick={onClose} className="p-3 bg-white/10 text-white rounded-full backdrop-blur-md hover:bg-white/20 transition-all">
          <X size={24} />
        </button>
      </div>

      <div className="w-full flex flex-col items-center gap-8 max-w-[400px]">
        {/* Canvas Display (Hidden real canvas, visible preview image) */}
        <div className={`relative w-full rounded-[48px] overflow-hidden shadow-2xl transition-all duration-700 ${isGenerating ? 'scale-95 opacity-50 backdrop-blur-md' : 'scale-100 opacity-100'}`}>
          <canvas ref={canvasRef} className="w-full h-auto rounded-[48px]" />
          {isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-bold text-slate-900">正在雕琢海报...</p>
            </div>
          )}
        </div>

        {!isGenerating && (
          <div className="flex flex-col w-full gap-4 animate-in slide-in-from-bottom-4">
            <button
              onClick={saveImage}
              className="w-full py-5 bg-white text-slate-900 rounded-[32px] text-sm font-bold flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"
            >
              <Download size={20} />
              保存到相册
            </button>
            <p className="text-center text-[10px] text-white/40 font-bold uppercase tracking-widest">Wuya Share · Unique Artwork</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Canvas Helpers
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split('');
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n];
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

const EditPostModal: React.FC<{
  post: Post;
  user: UserProfile;
  onClose: () => void;
  onSave: (content: string, images: string[], tags: string[]) => Promise<void>
}> = ({ post, user, onClose, onSave }) => {
  const [content, setContent] = useState(post.content);
  const [images, setImages] = useState<string[]>(post.images || []);
  const [selectedTags, setSelectedTags] = useState<string[]>(post.tags || []);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    if (images.length + files.length > 3) return;

    setIsUploading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const uploadPromises = files.map(file => storageService.uploadPostImage(file, authUser.id));
      const urls = await Promise.all(uploadPromises);
      setImages(prev => [...prev, ...urls]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-[350] bg-slate-900/60 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in">
      <div className="fixed inset-0" onClick={onClose}></div>
      <div className="bg-white w-full max-w-lg rounded-t-[42px] sm:rounded-[42px] overflow-hidden shadow-2xl relative animate-in slide-in-from-bottom-10 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">编辑动态</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:bg-slate-50 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto scrollbar-hide">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="分享你的学习心得..."
            className="w-full h-32 text-sm text-slate-700 bg-slate-50/50 rounded-2xl p-4 border-none focus:ring-0 resize-none placeholder:text-slate-300"
          />

          {/* 图片管理 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-sm">
                <img src={img} className="w-full h-full object-cover" />
                <button
                  onClick={() => setImages(images.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 p-1 bg-black/40 text-white rounded-full"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={`w-20 h-20 rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-1 text-slate-300 hover:border-indigo-100 hover:text-indigo-300 transition-all ${isUploading ? 'animate-pulse' : ''}`}
              >
                <ImageIcon size={20} />
                <span className="text-[8px] font-bold">{isUploading ? '上传中' : '添加图片'}</span>
              </button>
            )}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleImageSelect} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {user.selectedCategories.map(cat => (
              <button
                key={cat}
                onClick={() => toggleTag(cat)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all ${selectedTags.includes(cat)
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
              >
                #{cat}
              </button>
            ))}
          </div>
          {isEmojiPickerOpen && (
            <div className="absolute left-6 bottom-24 z-50 bg-white rounded-[32px] shadow-2xl border border-slate-100 p-4 flex flex-wrap gap-2 w-56 animate-in zoom-in-95">
              {COMMON_EMOJIS.map(e => (
                <button key={e} onClick={() => { setContent(prev => prev + e); setIsEmojiPickerOpen(false); }} className="text-xl hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex items-center gap-4">
          <div className="flex gap-4">
            <button onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors">
              <Smile size={24} />
            </button>
          </div>
          <div className="flex-grow flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-4 text-sm font-bold text-slate-400 bg-white rounded-2xl hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              disabled={isSaving || isUploading || !content.trim()}
              onClick={async () => {
                setIsSaving(true);
                await onSave(content, images, selectedTags);
                setIsSaving(false);
              }}
              className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl text-sm font-bold shadow-xl active:scale-95 transition-all disabled:opacity-50"
            >
              {isSaving ? '正在保存...' : '保存修改'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SquareView;
