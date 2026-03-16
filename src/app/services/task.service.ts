import { Injectable, inject } from '@angular/core';
import { toLocalDateString } from '../utils/date';
import { Api } from './api';
import type { Task } from '../interfaces/database.types';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly api = inject(Api);

  async getTasks(projectId?: string): Promise<Task[]> {
    let query = this.api.supabase
      .from('tasks')
      .select(`
        *,
        project:projects(*),
        assignees:task_assignees(user:profiles(*)),
        creator:profiles!tasks_created_by_fkey(*)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return this.mapTasks(data || []);
  }

  async getMyTasks(): Promise<Task[]> {
    const userId = this.api.user()?.id;
    if (!userId) return [];

    const { data, error } = await this.api.supabase
      .from('task_assignees')
      .select(`
        task:tasks(
          *,
          project:projects(*),
          assignees:task_assignees(user:profiles(*)),
          creator:profiles!tasks_created_by_fkey(*)
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;
    return this.mapTasks(data?.map((d) => d.task).filter(Boolean) || []);
  }

  async getOverdueTasks(): Promise<Task[]> {
    const today = toLocalDateString(new Date());

    const { data, error } = await this.api.supabase
      .from('tasks')
      .select(`
        *,
        project:projects(*),
        assignees:task_assignees(user:profiles(*))
      `)
      .is('deleted_at', null)
      .lt('expected_end_date', today)
      .neq('status', 'completed')
      .order('expected_end_date', { ascending: true });

    if (error) throw error;
    return this.mapTasks(data || []);
  }

  async createTask(task: Partial<Task>): Promise<Task> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await this.api.supabase
      .from('tasks')
      .insert({ ...task, created_by: userId })
      .select()
      .single();

    if (error) throw error;
    return data as Task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const { data, error } = await this.api.supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      const msg = (error as { message?: string }).message ?? JSON.stringify(error);
      throw new Error(msg);
    }
    return data as Task;
  }

  async assignTask(taskId: string, userIds: string[]): Promise<void> {
    // Remove existing assignees
    await this.api.supabase.from('task_assignees').delete().eq('task_id', taskId);

    // Add new assignees
    const assignments = userIds.map((user_id) => ({ task_id: taskId, user_id }));
    const { error } = await this.api.supabase.from('task_assignees').insert(assignments);

    if (error) throw error;
  }

  async updateTaskStatus(id: string, status: string): Promise<void> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const updates: any = { status };
    
    if (status === 'completed') {
      updates.completed_by = userId;
      updates.completed_at = new Date().toISOString();
      updates.review_status = 'pending_review';
    } else if (status === 'in_progress') {
      updates.completed_by = null;
      updates.completed_at = null;
      updates.review_status = null;
    }

    const { error } = await this.api.supabase
      .from('tasks')
      .update(updates)
      .eq('id', id);

    if (error) {
      const msg = (error as { message?: string }).message ?? JSON.stringify(error);
      throw new Error(msg);
    }
  }

  async completeTask(id: string): Promise<void> {
    await this.updateTaskStatus(id, 'completed');
  }

  async reviewTask(id: string, status: 'accepted' | 'changes_requested', note?: string): Promise<void> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await this.api.supabase
      .from('tasks')
      .update({
        review_status: status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: note,
      })
      .eq('id', id);

    if (error) throw error;
  }

  async getTaskStats() {
    const userId = this.api.user()?.id;
    const today = toLocalDateString(new Date());

    const [allTasks, myAssignments, overdue] = await Promise.all([
      this.api.supabase.from('tasks').select('id').is('deleted_at', null),
      userId
        ? this.api.supabase.from('task_assignees').select('task_id').eq('user_id', userId)
        : { data: [] },
      this.api.supabase
        .from('tasks')
        .select('id')
        .is('deleted_at', null)
        .lt('expected_end_date', today)
        .neq('status', 'completed'),
    ]);

    return {
      total: allTasks.data?.length || 0,
      myTasks: myAssignments.data?.length || 0,
      overdue: overdue.data?.length || 0,
    };
  }

  async getManagerTasks(): Promise<Task[]> {
    const userId = this.api.user()?.id;
    if (!userId) return [];

    const { data: managerProjects } = await this.api.supabase
      .from('project_managers')
      .select('project_id')
      .eq('user_id', userId);

    if (!managerProjects?.length) return [];

    const projectIds = managerProjects.map((p) => p.project_id);

    const { data, error } = await this.api.supabase
      .from('tasks')
      .select(`
        *,
        project:projects(*),
        assignees:task_assignees(user:profiles(*)),
        creator:profiles!tasks_created_by_fkey(*)
      `)
      .in('project_id', projectIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return this.mapTasks(data || []);
  }

  async getPendingReviewTasks(): Promise<Task[]> {
    const userId = this.api.user()?.id;
    if (!userId) return [];

    const { data: managerProjects } = await this.api.supabase
      .from('project_managers')
      .select('project_id')
      .eq('user_id', userId);

    if (!managerProjects?.length) return [];

    const projectIds = managerProjects.map((p) => p.project_id);

    const { data, error } = await this.api.supabase
      .from('tasks')
      .select(`
        *,
        project:projects(*),
        assignees:task_assignees(user:profiles(*))
      `)
      .in('project_id', projectIds)
      .eq('review_status', 'pending_review')
      .is('deleted_at', null);

    if (error) throw error;
    return this.mapTasks(data || []);
  }

  private mapTasks(data: any[]): Task[] {
    return data.map((t) => ({
      ...t,
      assignees: t.assignees?.map((a: any) => a.user) || [],
    }));
  }
}
