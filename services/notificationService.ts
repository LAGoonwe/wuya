
import { supabase } from '../lib/supabase';
import { AppNotification, NotificationType } from '../types';

export const notificationService = {
    async getNotifications(userId: string): Promise<AppNotification[]> {
        const { data, error } = await supabase
            .from('notifications')
            .select(`
                *,
                sender:sender_id (id, name, avatar),
                friendship:friendship_id (status)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }

        return data.map((n: any) => ({
            id: n.id,
            type: n.type as NotificationType,
            sender: {
                id: n.sender?.id,
                name: n.sender?.name || '未知用户',
                avatar: n.sender?.avatar || ''
            },
            content: n.content,
            targetContent: n.target_content,
            relatedId: n.related_id || n.friendship_id || n.post_id,
            time: new Date(n.created_at).toLocaleString(),
            createdAt: n.created_at,
            isRead: n.is_read,
            status: n.type === 'FRIEND_REQUEST' ? n.friendship?.status : undefined
        }));
    },

    async markAsRead(notificationId: string) {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);

        if (error) throw error;
    },

    async markAllAsRead(userId: string) {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;
    },

    async deleteNotification(notificationId: string) {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId);

        if (error) throw error;
    },

    async sendShareNotification(senderId: string, receiverId: string, postId: string, postSnippet: string) {
        const { error } = await supabase.from('notifications').insert({
            user_id: receiverId,
            sender_id: senderId,
            type: 'SHARE',
            content: '与你分享了一条动态',
            target_content: postSnippet,
            related_id: postId
        });
        if (error) throw error;
    },

    async sendStudyReminder(senderId: string, receiverId: string): Promise<{ success: boolean; message?: string }> {
        // Check if a reminder was sent in the last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data, error: checkError } = await supabase
            .from('notifications')
            .select('id')
            .eq('sender_id', senderId)
            .eq('user_id', receiverId)
            .eq('type', 'STUDY_REMINDER')
            .gt('created_at', twentyFourHoursAgo)
            .limit(1);

        if (checkError) throw checkError;

        if (data && data.length > 0) {
            return { success: false, message: '今天已经提醒过 Ta 啦' };
        }

        const { error } = await supabase.from('notifications').insert({
            user_id: receiverId,
            sender_id: senderId,
            type: 'STUDY_REMINDER',
            content: '提醒你要开启今天的学习之旅咯 📚'
        });

        if (error) throw error;
        return { success: true };
    }
};
