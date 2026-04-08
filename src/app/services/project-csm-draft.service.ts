import { Injectable, inject } from '@angular/core';
import { Api } from './api';
import type { Profile, ProjectCsmDraft, ProjectCsmDraftComment } from '../interfaces/database.types';

type ProfileSnippet = Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>;

@Injectable({
  providedIn: 'root',
})
export class ProjectCsmDraftService {
  private readonly api = inject(Api);

  async listByProject(projectId: string): Promise<ProjectCsmDraft[]> {
    const { data: drafts, error } = await this.api.supabase
      .from('project_csm_drafts')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!drafts?.length) return [];

    const draftIds = drafts.map((d: { id: string }) => d.id);
    const creatorIds = [...new Set((drafts as { created_by: string }[]).map((d) => d.created_by))];

    const { data: creators } = await this.api.supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', creatorIds);

    const creatorById = new Map<string, ProfileSnippet>(
      (creators ?? []).map((p) => [p.id, p as ProfileSnippet]),
    );

    const { data: allComments, error: cErr } = await this.api.supabase
      .from('project_csm_draft_comments')
      .select('*')
      .in('draft_id', draftIds)
      .order('created_at', { ascending: true });

    if (cErr) throw cErr;

    const commentUserIds = [...new Set((allComments ?? []).map((c: { user_id: string }) => c.user_id))];
    const { data: commentUsers } =
      commentUserIds.length > 0
        ? await this.api.supabase.from('profiles').select('id, full_name, email, role').in('id', commentUserIds)
        : { data: [] as { id: string; full_name: string; email: string; role: string }[] };

    const userById = new Map<string, ProfileSnippet>(
      (commentUsers ?? []).map((p) => [p.id, p as ProfileSnippet]),
    );

    const byDraft = new Map<string, ProjectCsmDraftComment[]>();
    for (const c of allComments ?? []) {
      const row = c as ProjectCsmDraftComment;
      const list = byDraft.get(row.draft_id) ?? [];
      const u = userById.get(row.user_id);
      list.push({ ...row, user: u as Profile | undefined });
      byDraft.set(row.draft_id, list);
    }

    return (drafts as ProjectCsmDraft[]).map((d) => {
      const cr = creatorById.get(d.created_by);
      return {
        ...d,
        creator: cr as Profile | undefined,
        comments: byDraft.get(d.id) ?? [],
      };
    });
  }

  async createDraft(
    projectId: string,
    title: string,
    notes: string | null,
    sortOrder = 0,
  ): Promise<ProjectCsmDraft> {
    const uid = this.api.user()?.id;
    if (!uid) throw new Error('Not authenticated');

    // Avoid .select() with embedded profiles — wrong FK hints break PostgREST; RLS on profiles can block joins.
    const { data, error } = await this.api.supabase
      .from('project_csm_drafts')
      .insert({
        project_id: projectId,
        title: title.trim(),
        notes: notes?.trim() ? notes.trim() : null,
        sort_order: sortOrder,
        created_by: uid,
      })
      .select('*')
      .single();

    if (error) throw error;
    return { ...(data as ProjectCsmDraft), comments: [] };
  }

  async deleteDraft(draftId: string): Promise<void> {
    const { error } = await this.api.supabase.from('project_csm_drafts').delete().eq('id', draftId);
    if (error) throw error;
  }

  async addComment(draftId: string, body: string): Promise<ProjectCsmDraftComment> {
    const uid = this.api.user()?.id;
    if (!uid) throw new Error('Not authenticated');

    const { data, error } = await this.api.supabase
      .from('project_csm_draft_comments')
      .insert({ draft_id: draftId, user_id: uid, body: body.trim() })
      .select('*')
      .single();

    if (error) throw error;

    const { data: profile } = await this.api.supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', uid)
      .maybeSingle();

    return {
      ...(data as ProjectCsmDraftComment),
      user: (profile as Profile | null) ?? undefined,
    };
  }
}
