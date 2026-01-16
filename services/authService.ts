
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';

export const authService = {
    async getCurrentProfile(userId: string): Promise<UserProfile | null> {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }

        // Fetch stats separately or use a view/RPC in production. 
        // For now, we return placeholders or fetch counts if needed.
        // Simplifying for this iteration.

        // Fetch stats separately

        // 1. Count Notes
        const { count: notesCount } = await supabase
            .from('notes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        // 2. Count Total Likes Received on User's Posts
        // Join likes with posts, where posts.user_id is the target user
        const { count: likesCount } = await supabase
            .from('likes')
            .select('*, posts!inner(user_id)', { count: 'exact', head: true })
            .eq('posts.user_id', userId);

        // 3. Followers/Following (Placeholder for now as schema supports friendships but not "follow" model strictly yet)
        const { count: friendsCount } = await supabase
            .from('friendships')
            .select('*', { count: 'exact', head: true })
            .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
            .eq('status', 'accepted');

        // 4. Counts Bookmarks
        const { count: bookmarksCount } = await supabase
            .from('bookmarks')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        return {
            id: userId,
            name: profile.name || 'Unknown',
            bio: profile.bio || '',
            avatar: profile.avatar || '',
            stats: {
                studyDays: profile.study_days || 0,
                notesCount: notesCount || 0,
                followers: likesCount || 0, // Legacy field mapped to Likes
                following: friendsCount || 0, // Legacy field mapped to Friends
                likesReceived: likesCount || 0,
                friendsCount: friendsCount || 0,
                bookmarksCount: bookmarksCount || 0
            },
            selectedCategories: profile.selected_categories || [],
            uid: profile.uid
        };
    },
    async updateProfile(userId: string, updates: Partial<UserProfile>) {
        const { error } = await supabase
            .from('profiles')
            .upsert({
                id: userId, // Required for upsert to know which row
                name: updates.name,
                bio: updates.bio,
                avatar: updates.avatar,
                selected_categories: updates.selectedCategories,
                last_active: new Date().toISOString()
            });

        if (error) throw error;

        // Return the updated profile data
        return {
            ...updates,
            id: userId
        } as UserProfile;
    }
};
