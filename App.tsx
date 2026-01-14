
import React, { useState, useEffect } from 'react';
import { AppStage, MainTab, Category, Note, UserProfile } from './types';
import Splash from './components/Splash';
import CategorySelector from './components/CategorySelector';
import MainLayout from './components/MainLayout';
import LoginView from './components/LoginView';
import { supabase } from './lib/supabase';
import { authService } from './services/authService';
import { noteService } from './services/noteService';

const App: React.FC = () => {
  const [stage, setStage] = useState<AppStage>(AppStage.SPLASH);
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Real data state
  const [user, setUser] = useState<UserProfile | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);


  // Check auth on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserData(session.user.id);
      } else {
        setIsLoading(false);
      }
    }).catch((err) => {
      console.error('Supabase session check failed', err);
      // Even if it fails, we should stop loading and probably show login or empty state
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserData(session.user.id);
      } else {
        setUser(null);
        setNotes([]);
      }
    });

    // Real-time synchronization for notes
    const notesChannel = supabase
      .channel('realtime_notes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes'
        },
        async (payload) => {
          // Verify if it belongs to current user (though RLS should handle it)
          const userId = (payload.new as any)?.user_id || (payload.old as any)?.user_id;
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || userId !== user.id) return;

          if (payload.eventType === 'INSERT') {
            const newNote = payload.new as any;
            setNotes(prev => {
              if (prev.some(n => n.id === newNote.id)) return prev;
              return [
                {
                  id: newNote.id,
                  title: newNote.title,
                  content: newNote.content,
                  category: newNote.category,
                  time: new Date(newNote.created_at).toLocaleDateString()
                },
                ...prev
              ];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedNote = payload.new as any;
            setNotes(prev => prev.map(n => n.id === updatedNote.id ? {
              ...n,
              title: updatedNote.title,
              content: updatedNote.content,
              category: updatedNote.category
            } : n));
          } else if (payload.eventType === 'DELETE') {
            const deletedNoteId = (payload.old as any).id;
            setNotes(prev => prev.filter(n => n.id !== deletedNoteId));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(notesChannel);
    };
  }, []);

  const fetchUserData = async (userId: string) => {
    setIsLoading(true);
    try {
      const [profile, userNotes] = await Promise.all([
        authService.getCurrentProfile(userId),
        noteService.getNotes(userId)
      ]);

      if (profile) {
        setUser(profile);
      } else {
        // Handle case where auth exists but profile doesn't (first login)
        // We might want to create a profile or redirect to a profile creation step.
        // For now, allow null profile to trigger Category Selection/Setup if we treat it as new.
        // Or if strictly enforcing profile existence:
        console.log('No profile found. Assuming new user.');
      }
      setNotes(userNotes);
    } catch (error) {
      console.error('Error loading data', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Splash Timer
  useEffect(() => {
    const timer = setTimeout(() => {
      // Logic to decide next stage based on auth
      if (stage === AppStage.SPLASH) {
        // This effect will run but the real navigation depends on data loading.
        // We'll let the render logic handle the stage transition essentially.
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Determine stage based on data
  useEffect(() => {
    // Only transition if not loading
    if (!isLoading) {
      if (!session) {
        // Stay at login if not logged in (handled by render)
      } else if (user) {
        if (user.selectedCategories && user.selectedCategories.length > 0) {
          setStage(AppStage.MAIN);
        } else {
          setStage(AppStage.CATEGORY_SELECTION);
        }
      } else {
        // Logged in but no profile, maybe show Category Selector to init profile
        // Or creating a default profile
        setStage(AppStage.CATEGORY_SELECTION);
      }
    }
  }, [isLoading, session, user]);


  const handleCategoriesConfirmed = async (categories: string[]) => {
    if (!session?.user) return;

    // Update profile in Supabase
    try {
      const updated = await authService.updateProfile(session.user.id, {
        selectedCategories: categories,
        name: user?.name || session.user.email || 'Learning Explorer', // Default name
        avatar: user?.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${session.user.id}`, // Default avatar
      });
      setUser(prev => ({ ...prev!, ...updated })); // Optimistic or use return
      setStage(AppStage.MAIN);
    } catch (e) {
      console.error('Failed to save categories', e);
    }
  };

  // Render logic
  if (isLoading && stage === AppStage.SPLASH) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Splash /></div>;
  }

  // If not logged in, show Login
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 max-w-md mx-auto shadow-2xl overflow-hidden relative">
        <LoginView onLoginSuccess={() => { /* Handled by auth listener */ }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      {/* If we are still in SPLASH visual but loaded, we can show splash or transition. 
          The useEffect above sets stage. */}
      {stage === AppStage.SPLASH && <Splash />}

      {stage === AppStage.CATEGORY_SELECTION && (
        <CategorySelector onConfirm={handleCategoriesConfirmed} />
      )}

      {stage === AppStage.MAIN && user && (
        <MainLayout
          user={user}
          onUserUpdate={(updates) => setUser(prev => prev ? { ...prev, ...updates } : null)}
          notes={notes}
          setNotes={setNotes}
          onResetCategories={() => setStage(AppStage.CATEGORY_SELECTION)}
        />
      )}
    </div>
  );
};

export default App;
