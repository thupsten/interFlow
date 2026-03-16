import { Injectable, inject } from '@angular/core';
import { Api } from './api';
import type { Project, InterestRequest, Tag } from '../interfaces/database.types';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private readonly api = inject(Api);

  async getProjects(includeArchived = false): Promise<Project[]> {
    let query = this.api.supabase
      .from('projects')
      .select(`
        *,
        creator:profiles!projects_created_by_fkey(*),
        managers:project_managers(user:profiles(*)),
        tags:project_tags(tag:tags(*))
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return this.mapProjects(data || []);
  }

  async getProjectById(id: string, includeArchived = false): Promise<Project | null> {
    // First get basic project info (allow archived for admin)
    let query = this.api.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null);

    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    const { data: projectData, error: projectError } = await query.maybeSingle();

    if (projectError) {
      console.error('Error fetching project:', projectError);
      return null;
    }
    if (!projectData) {
      console.log('Project not found with id:', id);
      return null;
    }

    // Get creator
    let creator = null;
    if (projectData.created_by) {
      const { data: creatorData } = await this.api.supabase
        .from('profiles')
        .select('*')
        .eq('id', projectData.created_by)
        .single();
      creator = creatorData;
    }

    // Get managers
    const { data: managersData } = await this.api.supabase
      .from('project_managers')
      .select('user:profiles(*)')
      .eq('project_id', id);

    // Get contributors with approval info
    const { data: contributorsData } = await this.api.supabase
      .from('project_contributors')
      .select(`
        user:profiles!project_contributors_user_id_fkey(*),
        approved_by,
        approved_at,
        approver:profiles!project_contributors_approved_by_fkey(full_name, role)
      `)
      .eq('project_id', id);

    // Get approved interest requests for this project (to know who showed interest)
    const { data: approvedInterests } = await this.api.supabase
      .from('interest_requests')
      .select('user_id, reviewed_by, reviewed_at, reviewer:profiles!interest_requests_reviewed_by_fkey(full_name)')
      .eq('project_id', id)
      .eq('status', 'approved');

    // Get tags
    const { data: tagsData } = await this.api.supabase
      .from('project_tags')
      .select('tag:tags(*)')
      .eq('project_id', id);

    // Map contributors with join method info
    const interestMap = new Map(
      approvedInterests?.map((i: any) => [i.user_id, { reviewer: i.reviewer, reviewed_at: i.reviewed_at }]) || []
    );

    const contributors = contributorsData?.map((c: any) => {
      const interest = interestMap.get(c.user?.id);
      return {
        ...c.user,
        joinedViaInterest: !!interest,
        approvedBy: interest?.reviewer?.full_name || c.approver?.full_name || null,
        approvedAt: interest?.reviewed_at || c.approved_at || null,
      };
    }) || [];

    const project = {
      ...projectData,
      creator,
      managers: managersData?.map((m: any) => m.user) || [],
      contributors,
      tags: tagsData?.map((t: any) => t.tag) || [],
    };

    return project as Project;
  }

  async createProject(project: Partial<Project>): Promise<Project> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await this.api.supabase
      .from('projects')
      .insert({ ...project, created_by: userId })
      .select()
      .single();

    if (error) {
      const msg = (error as { message?: string }).message ?? JSON.stringify(error);
      throw new Error(msg);
    }
    return data as Project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const { data, error } = await this.api.supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Project;
  }

  async archiveProject(id: string): Promise<void> {
    const { error } = await this.api.supabase.rpc('archive_project', { p_project_id: id });
    if (error) throw error;
  }

  async unarchiveProject(id: string): Promise<void> {
    const { error } = await this.api.supabase.rpc('unarchive_project', { p_project_id: id });
    if (error) throw error;
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.api.supabase.rpc('soft_delete_project', { p_project_id: id });
    if (error) throw error;
  }

  async showInterest(projectId: string, message?: string): Promise<InterestRequest> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await this.api.supabase
      .from('interest_requests')
      .insert({ project_id: projectId, user_id: userId, message })
      .select()
      .single();

    if (error) throw error;
    return data as InterestRequest;
  }

  async getPendingInterests(): Promise<InterestRequest[]> {
    const userId = this.api.user()?.id;
    const role = this.api.userRole();

    let query = this.api.supabase
      .from('interest_requests')
      .select(`
        *,
        project:projects(*),
        user:profiles!interest_requests_user_id_fkey(*)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    // Managers only see interests for their projects (same as getAllInterests)
    if (role === 'manager' && userId) {
      const { data: managerProjects } = await this.api.supabase
        .from('project_managers')
        .select('project_id')
        .eq('user_id', userId);

      if (managerProjects?.length) {
        const projectIds = managerProjects.map((p) => p.project_id);
        query = query.in('project_id', projectIds);
      } else {
        return [];
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as InterestRequest[];
  }

  async getAllInterests(): Promise<InterestRequest[]> {
    const userId = this.api.user()?.id;
    const role = this.api.userRole();

    let query = this.api.supabase
      .from('interest_requests')
      .select(`
        *,
        project:projects(*),
        user:profiles!interest_requests_user_id_fkey(*),
        reviewer:profiles!interest_requests_reviewed_by_fkey(*)
      `)
      .order('created_at', { ascending: false });

    // Managers only see interests for their projects
    if (role === 'manager' && userId) {
      const { data: managerProjects } = await this.api.supabase
        .from('project_managers')
        .select('project_id')
        .eq('user_id', userId);

      if (managerProjects?.length) {
        const projectIds = managerProjects.map((p) => p.project_id);
        query = query.in('project_id', projectIds);
      } else {
        return [];
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as InterestRequest[];
  }

  async approveInterest(id: string, note?: string): Promise<void> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await this.api.supabase
      .from('interest_requests')
      .update({
        status: 'approved',
        reviewed_by: userId,
        review_note: note,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  }

  async rejectInterest(id: string, note?: string): Promise<void> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await this.api.supabase
      .from('interest_requests')
      .update({
        status: 'rejected',
        reviewed_by: userId,
        review_note: note,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  }

  /** Bulk approve multiple interest requests. */
  async bulkApproveInterest(ids: string[], note?: string): Promise<void> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');
    if (!ids.length) return;

    const { error } = await this.api.supabase
      .from('interest_requests')
      .update({
        status: 'approved',
        reviewed_by: userId,
        review_note: note,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('status', 'pending');

    if (error) throw error;
  }

  /** Bulk reject multiple interest requests. */
  async bulkRejectInterest(ids: string[], note?: string): Promise<void> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');
    if (!ids.length) return;

    const { error } = await this.api.supabase
      .from('interest_requests')
      .update({
        status: 'rejected',
        reviewed_by: userId,
        review_note: note,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('status', 'pending');

    if (error) throw error;
  }

  async getTags(): Promise<Tag[]> {
    const { data, error } = await this.api.supabase
      .from('tags')
      .select('*')
      .order('name');

    if (error) throw error;
    return data as Tag[];
  }

  async getProjectStats() {
    const { data, error } = await this.api.supabase
      .from('projects')
      .select('status')
      .is('deleted_at', null);

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      not_started: 0,
      in_progress: 0,
      completed: 0,
      delayed: 0,
      on_hold: 0,
    };

    data?.forEach((p) => {
      const status = p.status as keyof typeof stats;
      if (status in stats) stats[status]++;
    });

    return stats;
  }

  async getMyProjects(): Promise<Project[]> {
    const userId = this.api.user()?.id;
    if (!userId) return [];

    const { data, error } = await this.api.supabase
      .from('project_contributors')
      .select(`
        project:projects(
          *,
          creator:profiles!projects_created_by_fkey(*),
          managers:project_managers(user:profiles(*)),
          tags:project_tags(tag:tags(*))
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;
    return this.mapProjects(data?.map((d) => d.project).filter(Boolean) || []);
  }

  async getManagerProjects(): Promise<Project[]> {
    const userId = this.api.user()?.id;
    if (!userId) return [];

    const { data, error } = await this.api.supabase
      .from('project_managers')
      .select(`
        project:projects(
          *,
          creator:profiles!projects_created_by_fkey(*),
          managers:project_managers(user:profiles(*)),
          tags:project_tags(tag:tags(*))
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;
    return this.mapProjects(data?.map((d) => d.project).filter(Boolean) || []);
  }

  /** Get projects for a specific user (admin/manager viewing employee). */
  async getProjectsForUser(userId: string): Promise<Project[]> {
    const { data, error } = await this.api.supabase
      .from('project_contributors')
      .select(`
        project:projects(
          *,
          creator:profiles!projects_created_by_fkey(*),
          managers:project_managers(user:profiles(*)),
          tags:project_tags(tag:tags(*))
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;
    return this.mapProjects(data?.map((d) => d.project).filter(Boolean) || []);
  }

  async getMyInterests(): Promise<InterestRequest[]> {
    const userId = this.api.user()?.id;
    if (!userId) return [];

    const { data, error } = await this.api.supabase
      .from('interest_requests')
      .select(`
        *,
        project:projects(*),
        reviewer:profiles!interest_requests_reviewed_by_fkey(*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as InterestRequest[];
  }

  async getProjectInterests(projectId: string): Promise<InterestRequest[]> {
    const { data, error } = await this.api.supabase
      .from('interest_requests')
      .select(`
        *,
        user:profiles!interest_requests_user_id_fkey(*),
        reviewer:profiles!interest_requests_reviewed_by_fkey(*)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as InterestRequest[];
  }

  async addProjectTags(projectId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    
    const inserts = tagIds.map((tagId) => ({
      project_id: projectId,
      tag_id: tagId,
    }));

    const { error } = await this.api.supabase
      .from('project_tags')
      .insert(inserts);

    if (error) throw error;
  }

  async updateProjectTags(projectId: string, tagIds: string[]): Promise<void> {
    await this.api.supabase
      .from('project_tags')
      .delete()
      .eq('project_id', projectId);

    if (tagIds.length > 0) {
      await this.addProjectTags(projectId, tagIds);
    }
  }

  async addProjectManagers(projectId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    
    const inserts = userIds.map((userId) => ({
      project_id: projectId,
      user_id: userId,
    }));

    const { error } = await this.api.supabase
      .from('project_managers')
      .insert(inserts);

    if (error) throw error;
  }

  async updateProjectManagers(projectId: string, userIds: string[]): Promise<void> {
    await this.api.supabase
      .from('project_managers')
      .delete()
      .eq('project_id', projectId);

    if (userIds.length > 0) {
      await this.addProjectManagers(projectId, userIds);
    }
  }

  async addProjectContributor(projectId: string, userId: string): Promise<void> {
    const approvedBy = this.api.user()?.id;
    const { error } = await this.api.supabase
      .from('project_contributors')
      .insert({ 
        project_id: projectId, 
        user_id: userId,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      });

    if (error) throw error;
  }

  async updateProjectContributors(projectId: string, userIds: string[]): Promise<void> {
    await this.api.supabase
      .from('project_contributors')
      .delete()
      .eq('project_id', projectId);

    if (userIds.length > 0) {
      const approvedBy = this.api.user()?.id;
      const inserts = userIds.map((userId) => ({
        project_id: projectId,
        user_id: userId,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      }));

      const { error } = await this.api.supabase
        .from('project_contributors')
        .insert(inserts);

      if (error) throw error;
    }
  }

  private mapProjects(data: any[]): Project[] {
    return data.map((p) => this.mapProject(p));
  }

  private mapProject(data: any): Project {
    return {
      ...data,
      managers: data.managers?.map((m: any) => m.user) || [],
      contributors: data.contributors?.map((c: any) => c.user) || [],
      tags: data.tags?.map((t: any) => t.tag) || [],
    };
  }
}
