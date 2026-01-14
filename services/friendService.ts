
import { supabase } from '../lib/supabase';
import { Friend } from '../types';

// Simple in-memory cache scoped by userId
let friendsCache: { [userId: string]: { data: Friend[], timestamp: number } } = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const friendService = {
    async getFriends(userId: string, forceRefresh = false): Promise<Friend[]> {
        // Check cache
        if (!forceRefresh && friendsCache[userId] && (Date.now() - friendsCache[userId].timestamp < CACHE_TTL)) {
            return friendsCache[userId].data;
        }
        // 1. Get accepted friendships where user is the initiator or receiver
        const { data: connections, error } = await supabase
            .from('friendships')
            .select('user_id, friend_id')
            .eq('status', 'accepted')
            .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

        if (error) {
            console.error('Error fetching friends:', error);
            return [];
        }

        if (!connections || connections.length === 0) return [];

        // 2. Extract IDs of the "other" people
        const friendIds = connections.map(c =>
            c.user_id === userId ? c.friend_id : c.user_id
        );

        // 3. Fetch their profiles
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', friendIds);

        if (profileError) {
            console.error('Error fetching friend profiles:', profileError);
            return [];
        }

        // 4. Fetch recent reminders sent by THIS user
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: reminders } = await supabase
            .from('notifications')
            .select('user_id')
            .eq('sender_id', userId)
            .eq('type', 'STUDY_REMINDER')
            .gt('created_at', twentyFourHoursAgo);

        const remindedUserIds = new Set(reminders?.map(r => r.user_id) || []);

        // 5. Fetch unique study days for each friend this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthISO = startOfMonth.toISOString();
        const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        const { data: friendNotes } = await supabase
            .from('notes')
            .select('user_id, created_at')
            .in('user_id', friendIds)
            .gte('created_at', startOfMonthISO);

        // Group unique days per user
        const userStudyDays: { [uid: string]: Set<string> } = {};
        friendNotes?.forEach(note => {
            const d = new Date(note.created_at);
            const dateStr = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            if (!userStudyDays[note.user_id]) {
                userStudyDays[note.user_id] = new Set();
            }
            userStudyDays[note.user_id].add(dateStr);
        });

        // 6. Map to Friend interface
        const friends = profiles.map(p => {
            const daysSet = userStudyDays[p.id];
            const uniqueDays = daysSet?.size || 0;

            const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
            const hasCheckedInToday = daysSet?.has(todayStr) || false;

            return {
                id: p.id,
                name: p.name || 'Unknown',
                avatar: p.avatar || '',
                bio: p.bio || '',
                checkInDays: uniqueDays,
                hasCheckedInToday,
                learningTags: p.selected_categories || [],
                lastActive: p.last_active ? new Date(p.last_active).toLocaleDateString() : 'Recently',
                isReminded: remindedUserIds.has(p.id)
            };
        });

        // Update cache
        friendsCache[userId] = { data: friends, timestamp: Date.now() };
        return friends;
    },

    async sendFriendRequest(fromId: string, toId: string) {
        const { data, error } = await supabase
            .from('friendships')
            .insert({
                user_id: fromId,
                friend_id: toId,
                status: 'pending'
            });

        if (error) throw error;
        return data;
    },

    async searchUsers(query: string, currentUserId: string): Promise<Friend[]> {
        if (!query.trim()) return [];

        let supabaseQuery = supabase
            .from('profiles')
            .select('*')
            .neq('id', currentUserId); // Exclude self

        // If query is an 8-digit number, search by UID
        if (/^\d{8}$/.test(query)) {
            supabaseQuery = supabaseQuery.eq('uid', query);
        } else {
            // Otherwise search by Name
            supabaseQuery = supabaseQuery.ilike('name', `%${query}%`);
        }

        const { data, error } = await supabaseQuery.limit(10);

        if (error) {
            console.error('Error searching users:', error);
            return [];
        }

        // Check friendship status for each result
        const { data: friendships } = await supabase
            .from('friendships')
            .select('*')
            .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

        return data.map(p => {
            const rel = friendships?.find(f => f.user_id === p.id || f.friend_id === p.id);
            return {
                id: p.id,
                uid: p.uid,
                name: p.name || 'Unknown',
                avatar: p.avatar || '',
                bio: p.bio || '',
                checkInDays: 0,
                hasCheckedInToday: false,
                learningTags: p.selected_categories || [],
                lastActive: p.last_active ? new Date(p.last_active).toLocaleDateString() : 'Recently',
                isReminded: false,
                friendshipStatus: rel?.status as 'pending' | 'accepted' | 'rejected' | undefined,
                isInitiator: rel?.user_id === currentUserId
            };
        });
    },

    async respondToFriendRequest(userId: string, friendshipId: string, status: 'accepted' | 'rejected') {
        const { data, error } = await supabase
            .from('friendships')
            .update({ status })
            .eq('id', friendshipId)
            // Safety: ensure the user responding is the recipient
            .eq('friend_id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async removeFriendship(userId: string, friendId: string) {
        const { error } = await supabase
            .from('friendships')
            .delete()
            .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);

        if (error) throw error;

        // Invalidate cache for both users
        this.invalidateCache(userId);
        this.invalidateCache(friendId);
    },

    invalidateCache(userId: string) {
        delete friendsCache[userId];
    },

    getCacheInfo(userId: string) {
        return friendsCache[userId];
    }
};
