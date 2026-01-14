
import { supabase } from '../lib/supabase';
import { Note } from '../types';

export const noteService = {
    async getNotes(userId: string): Promise<Note[]> {
        const { data, error } = await supabase
            .from('notes')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching notes:', error);
            return [];
        }

        return data.map(n => ({
            id: n.id,
            title: n.title,
            content: n.content,
            category: n.category, // Assuming category name is stored directly
            date: new Date(n.created_at).toISOString().split('T')[0],
            lastEdited: new Date(n.last_edited || n.created_at).getTime()
        }));
    },

    async createNote(userId: string, note: Omit<Note, 'id' | 'lastEdited'>) {
        // We allow 'date' to be passed in now.
        // If the backend doesn't have a 'date' column, we might interpret it as created_at or just drop it if schema not updated.
        // BUT, user needs persistence of the "date" they selected.
        // Best approach: Update schema to have 'date' column OR use created_at.
        // Given I cannot easily compel user to run SQL right now without friction, 
        // I will map 'date' to 'created_at' for now, resetting time to 00:00:00 for that date?
        // Or store it in 'created_at' nicely.

        // However, 'date' string "2023-01-01" is valuable.
        // Let's assume we added the 'date' column or use 'created_at'.
        // If I map to created_at:
        // const timestamp = new Date(note.date).toISOString();

        const { data, error } = await supabase
            .from('notes')
            .insert({
                user_id: userId,
                title: note.title,
                content: note.content,
                category: note.category,
                // If schema has no `date` column, this will fail if I try to insert 'date'.
                // So I MUST use created_at to store the "Date" of the note.
                created_at: note.date ? new Date(note.date).toISOString() : new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            title: data.title,
            content: data.content,
            category: data.category,
            date: new Date(data.created_at).toISOString().split('T')[0], // Map back created_at to YYYY-MM-DD
            lastEdited: new Date(data.last_edited).getTime()
        };
    },

    async updateNote(noteId: string, updates: Partial<Note>) {
        const { data, error } = await supabase
            .from('notes')
            .update({
                title: updates.title,
                content: updates.content,
                category: updates.category,
                last_edited: new Date().toISOString()
            })
            .eq('id', noteId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteNote(noteId: string) {
        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', noteId);

        if (error) throw error;
    }
};
