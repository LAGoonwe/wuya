
import { supabase } from '../lib/supabase';

export const storageService = {
    async uploadPostImage(file: File, userId: string): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `post-images/${fileName}`;

        const { data, error } = await supabase.storage
            .from('posts')
            .upload(filePath, file);

        if (error) {
            console.error('Error uploading image:', error);
            throw error;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('posts')
            .getPublicUrl(filePath);

        return publicUrl;
    },

    async uploadAvatar(file: File, userId: string): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;
        const filePath = fileName;

        const { data, error } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (error) {
            console.error('Error uploading avatar:', error);
            throw error;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return publicUrl;
    }
};
