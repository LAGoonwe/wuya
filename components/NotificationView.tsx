import React, { useState } from 'react';
import { AppNotification, NotificationType } from '../types';
import { X, Heart, MessageCircle, UserPlus, Check, Trash2, ChevronRight, BellOff, Bookmark, Send, BookOpen } from 'lucide-react';
import { notificationService } from '../services/notificationService';
import { friendService } from '../services/friendService';
import { socialService } from '../services/socialService';
import { Post } from '../types';

interface NotificationViewProps {
  notifications: AppNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  onClose: () => void;
  userId: string;
}

const NotificationView: React.FC<NotificationViewProps> = ({ notifications, setNotifications, onClose, userId }) => {
  const [toast, setToast] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isLoadingPost, setIsLoadingPost] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleAction = async (noti: AppNotification, action: 'accepted' | 'rejected') => {
    try {
      if (noti.type === NotificationType.FRIEND_REQUEST && noti.relatedId) {
        // 1. Respond to request
        await friendService.respondToFriendRequest(userId, noti.relatedId, action);
        // 2. Mark notification as read in DB if not already
        if (!noti.isRead) {
          await notificationService.markAsRead(noti.id);
        }

        setNotifications(prev => prev.map(n =>
          n.id === noti.id ? { ...n, status: action, isRead: true } : n
        ));
        showToast(action === 'accepted' ? '已通过申请' : '已忽略申请');
      }
    } catch (e) {
      console.error('Failed to respond to friend request:', e);
      showToast('操作失败，请重试');
    }
  };

  const markAsRead = async (noti: AppNotification) => {
    if (noti.isRead) return;
    try {
      await notificationService.markAsRead(noti.id);
      setNotifications(prev => prev.map(n =>
        n.id === noti.id ? { ...n, isRead: true } : n
      ));
    } catch (e) {
      console.error('Failed to mark as read:', e);
    }
  };

  const handleNotificationClick = async (noti: AppNotification) => {
    // 1. Mark as read
    markAsRead(noti);

    // 2. If it has a related post, show detail
    if (noti.relatedId && noti.type !== NotificationType.FRIEND_REQUEST) {
      setIsLoadingPost(true);
      try {
        const post = await socialService.getPostById(noti.relatedId);
        if (post) {
          setSelectedPost(post);
        } else {
          showToast('动态已被删除或不可见');
        }
      } catch (e) {
        showToast('无法加载动态详情');
      } finally {
        setIsLoadingPost(false);
      }
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await notificationService.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error('Failed to delete notification:', e);
    }
  };

  const markAllRead = async () => {
    try {
      await notificationService.markAllAsRead(userId);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast('全部标记为已读');
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-50 flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors">
            <X size={24} />
          </button>
          <h3 className="text-sm font-bold text-slate-800">通知中心</h3>
        </div>
        <button
          onClick={markAllRead}
          className="text-[10px] font-bold text-indigo-600 px-3 py-1.5 bg-indigo-50 rounded-lg active:scale-95 transition-all"
        >
          全标已读
        </button>
      </header>

      {/* List */}
      <div className="flex-grow overflow-y-auto p-4 space-y-3 pb-10 scrollbar-hide">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 opacity-20 text-slate-400">
            <BellOff size={48} className="mb-4" />
            <p className="text-sm font-bold">静悄悄的...</p>
          </div>
        ) : notifications.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(noti => (
          <div
            key={noti.id}
            onClick={() => handleNotificationClick(noti)}
            className={`p-4 rounded-[28px] border transition-all relative group cursor-pointer ${!noti.isRead ? 'bg-indigo-50/30 border-indigo-100/50 shadow-sm' : 'bg-white border-slate-100'
              }`}
          >
            <div className="flex gap-4">
              <div className="relative shrink-0">
                <img src={noti.sender.avatar} className="w-12 h-12 rounded-2xl object-cover border border-white shadow-sm" />
                <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm ${noti.type === NotificationType.LIKE ? 'bg-rose-500' :
                  noti.type === NotificationType.COMMENT ? 'bg-indigo-500' :
                    noti.type === NotificationType.BOOKMARK ? 'bg-amber-500' :
                      noti.type === NotificationType.SHARE ? 'bg-indigo-600' :
                        noti.type === NotificationType.STUDY_REMINDER ? 'bg-emerald-500' : 'bg-slate-900'
                  }`}>
                  {noti.type === NotificationType.LIKE && <Heart size={10} className="text-white fill-current" />}
                  {noti.type === NotificationType.COMMENT && <MessageCircle size={10} className="text-white fill-current" />}
                  {noti.type === NotificationType.BOOKMARK && <Bookmark size={10} className="text-white fill-current" />}
                  {noti.type === NotificationType.SHARE && <Send size={10} className="text-white fill-current" />}
                  {noti.type === NotificationType.STUDY_REMINDER && <BookOpen size={10} className="text-white fill-current" />}
                  {noti.type === NotificationType.FRIEND_REQUEST && <UserPlus size={10} className="text-white" />}
                </div>
              </div>

              <div className="flex-grow min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-bold text-slate-800">{noti.sender.name}</span>
                  <span className="text-[10px] text-slate-300 font-medium">{noti.time}</span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed mb-2">
                  {noti.type === NotificationType.LIKE && "点赞了你的动态"}
                  {noti.type === NotificationType.COMMENT && "回复了你："}
                  {noti.type === NotificationType.BOOKMARK && "收藏了你的动态"}
                  {noti.type === NotificationType.SHARE && "给你分享了动态"}
                  {noti.type === NotificationType.STUDY_REMINDER && "给你发来了学习提醒"}
                  {noti.type === NotificationType.FRIEND_REQUEST && "请求加你为同砚"}
                  {noti.type === NotificationType.FRIEND_ACCEPT && "已通过你的同砚申请"}
                </p>

                {noti.content && (
                  <div className="bg-slate-50/50 rounded-xl p-3 mb-2 border border-slate-50">
                    <p className="text-xs text-slate-600 italic">“{noti.content}”</p>
                  </div>
                )}

                {noti.targetContent && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-2">
                    <ChevronRight size={10} />
                    <span className="truncate opacity-70">{noti.targetContent}</span>
                  </div>
                )}

                {/* Friend Request Actions */}
                {noti.type === NotificationType.FRIEND_REQUEST && noti.status === 'pending' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleAction(noti, 'accepted')}
                      className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold shadow-lg shadow-slate-100 active:scale-95 transition-all"
                    >
                      同意
                    </button>
                    <button
                      onClick={() => handleAction(noti, 'rejected')}
                      className="flex-1 py-2.5 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-bold active:scale-95 transition-all"
                    >
                      忽略
                    </button>
                  </div>
                )}

                {noti.type === NotificationType.FRIEND_REQUEST && noti.status !== 'pending' && (
                  <div className="mt-3 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-slate-50 text-slate-300 inline-block">
                    {noti.status === 'accepted' ? '已同意' : '已忽略'}
                  </div>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNotification(noti.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-2 text-slate-200 hover:text-red-400 transition-all self-start"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {!noti.isRead && (
              <div className="absolute top-4 right-4 w-2 h-2 bg-indigo-500 rounded-full"></div>
            )}
          </div>
        ))}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          userId={userId}
          onClose={() => setSelectedPost(null)}
        />
      )}

      {/* Loading Overlay */}
      {isLoadingPost && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/10 backdrop-blur-[2px]">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-4 fade-in">
          <div className="bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-2">
            <Check size={14} className="text-green-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
};

const PostDetailModal: React.FC<{ post: Post; userId: string; onClose: () => void }> = ({ post, userId, onClose }) => {
  return (
    <div className="fixed inset-0 z-[180] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
      <div className="fixed inset-0" onClick={onClose}></div>
      <div className="bg-white w-full max-w-sm rounded-[42px] overflow-hidden shadow-2xl animate-in zoom-in-95 relative flex flex-col max-h-[85vh]">
        <div className="p-6 overflow-y-auto scrollbar-hide">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img src={post.author.avatar} className="w-10 h-10 rounded-2xl object-cover bg-slate-50" />
              <div>
                <h4 className="text-sm font-bold text-slate-800">{post.author.name}</h4>
                <p className="text-[10px] text-slate-400 font-medium">{post.time}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-300 hover:bg-slate-50 rounded-xl transition-colors"><X size={20} /></button>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed mb-4 whitespace-pre-wrap">{post.content}</p>

          {post.images && post.images.length > 0 && (
            <div className={`grid gap-2 mb-4 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {post.images.map((img, i) => <img key={i} src={img} className="rounded-2xl w-full h-40 object-cover border border-slate-50" />)}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 mb-5">
            {post.tags.map(tag => <span key={tag} className="text-[10px] font-bold text-indigo-500 bg-indigo-50/50 px-3 py-1.5 rounded-xl">#{tag}</span>)}
          </div>
        </div>

        <div className="p-4 bg-slate-50 flex items-center justify-center gap-4 border-t border-slate-100 italic text-[10px] text-slate-400 font-medium">
          <Heart size={14} /> {post.likes} 赞 · <MessageCircle size={14} /> {post.comments} 评论
        </div>
      </div>
    </div>
  );
};

export default NotificationView;
