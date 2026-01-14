
import React, { useState, useEffect } from 'react';
import { MainTab, UserProfile, Note, AppNotification, NotificationType } from '../types';
import { BookOpen, Compass, Users, User as UserIcon, Bell } from 'lucide-react';
import HomeView from './HomeView';
import SquareView from './SquareView';
import FriendsView from './FriendsView';
import ProfileView from './ProfileView';
import NotificationView from './NotificationView';
import { notificationService } from '../services/notificationService';
import { supabase } from '../lib/supabase';

interface MainLayoutProps {
  user: UserProfile;
  onUserUpdate: (updates: Partial<UserProfile>) => void;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  onResetCategories: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ user, onUserUpdate, notes, setNotes, onResetCategories }) => {
  const [activeTab, setActiveTab] = useState<MainTab>(MainTab.WUYA);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();

      // Subscribe to real-time notifications
      const channel = supabase
        .channel('realtime_notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id]);

  const fetchNotifications = async () => {
    try {
      const data = await notificationService.getNotifications(user.id);
      setNotifications(data);
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  };

  const hasUnread = notifications.some(n => !n.isRead);

  const renderContent = () => {
    switch (activeTab) {
      case MainTab.WUYA:
        return <HomeView notes={notes} setNotes={setNotes} user={user} />;
      case MainTab.SEA:
        return <SquareView user={user} onUserUpdate={onUserUpdate} />;
      case MainTab.FRIENDS:
        return <FriendsView user={user} />;
      case MainTab.PROFILE:
        return <ProfileView user={user} onUserUpdate={onUserUpdate} notes={notes} onResetCategories={onResetCategories} />;
      default:
        return <HomeView notes={notes} setNotes={setNotes} user={user} />;
    }
  };

  const getTabTitle = (tab: MainTab) => {
    switch (tab) {
      case MainTab.WUYA: return '无涯';
      case MainTab.SEA: return '学海';
      case MainTab.FRIENDS: return '同砚';
      case MainTab.PROFILE: return '个人';
      default: return '无涯';
    }
  }

  const handleOpenNotifications = async () => {
    setIsNotificationsOpen(true);
    if (hasUnread) {
      try {
        await notificationService.markAllAsRead(user.id);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      } catch (e) {
        console.error('Failed to mark notifications as read:', e);
      }
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-10 shrink-0">
        <h1 className="text-xl font-serif-sc font-bold tracking-widest text-slate-900">{getTabTitle(activeTab)}</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={handleOpenNotifications}
            className="relative p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-all active:scale-90"
          >
            <Bell size={22} />
            {hasUnread && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            )}
          </button>
          <div className="w-8 h-8 rounded-xl overflow-hidden bg-slate-200 border border-slate-100">
            <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-grow overflow-y-auto">
        {renderContent()}
      </main>

      {/* Bottom Nav */}
      <nav className="shrink-0 bg-white/80 backdrop-blur-lg border-t border-slate-100 h-20 flex items-center justify-around px-4 z-20 pb-safe">
        <NavButton
          isActive={activeTab === MainTab.WUYA}
          onClick={() => setActiveTab(MainTab.WUYA)}
          icon={<BookOpen size={22} />}
          label="无涯"
        />
        <NavButton
          isActive={activeTab === MainTab.SEA}
          onClick={() => setActiveTab(MainTab.SEA)}
          icon={<Compass size={22} />}
          label="学海"
        />
        <NavButton
          isActive={activeTab === MainTab.FRIENDS}
          onClick={() => setActiveTab(MainTab.FRIENDS)}
          icon={<Users size={22} />}
          label="同砚"
        />
        <NavButton
          isActive={activeTab === MainTab.PROFILE}
          onClick={() => setActiveTab(MainTab.PROFILE)}
          icon={<UserIcon size={22} />}
          label="个人"
        />
      </nav>

      {/* Notification Center View */}
      {isNotificationsOpen && (
        <NotificationView
          notifications={notifications}
          setNotifications={setNotifications}
          onClose={() => setIsNotificationsOpen(false)}
          userId={user.id}
        />
      )}
    </div>
  );
};

interface NavButtonProps {
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavButton: React.FC<NavButtonProps> = ({ isActive, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center gap-1 transition-all w-16 ${isActive ? 'text-indigo-600 scale-110 font-bold' : 'text-slate-400'
      }`}
  >
    {icon}
    <span className="text-[10px] uppercase tracking-tighter">{label}</span>
  </button>
);

export default MainLayout;
