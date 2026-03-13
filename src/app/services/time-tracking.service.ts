import { Injectable, inject } from '@angular/core';
import { Api } from './api';
import type { TimeLog } from '../interfaces/database.types';

@Injectable({
  providedIn: 'root',
})
export class TimeTrackingService {
  private readonly api = inject(Api);

  async getMyTimeLogs(startDate?: string, endDate?: string): Promise<TimeLog[]> {
    const userId = this.api.user()?.id;
    if (!userId) return [];

    let query = this.api.supabase
      .from('time_logs')
      .select(`
        *,
        task:tasks!time_logs_task_id_fkey(id, title, project:projects!tasks_project_id_fkey(id, title))
      `)
      .eq('user_id', userId)
      .order('log_date', { ascending: false });

    if (startDate) {
      query = query.gte('log_date', startDate);
    }
    if (endDate) {
      query = query.lte('log_date', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as TimeLog[];
  }

  async getTaskTimeLogs(taskId: string): Promise<TimeLog[]> {
    const { data, error } = await this.api.supabase
      .from('time_logs')
      .select(`
        *,
        user:profiles(id, full_name, email)
      `)
      .eq('task_id', taskId)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return data as TimeLog[];
  }

  async getProjectTimeLogs(projectId: string): Promise<TimeLog[]> {
    const { data: tasks } = await this.api.supabase
      .from('tasks')
      .select('id')
      .eq('project_id', projectId);

    if (!tasks?.length) return [];

    const taskIds = tasks.map((t) => t.id);
    const { data, error } = await this.api.supabase
      .from('time_logs')
      .select(`
        *,
        task:tasks!time_logs_task_id_fkey(id, title, project:projects!tasks_project_id_fkey(id, title)),
        user:profiles!time_logs_user_id_fkey(id, full_name)
      `)
      .in('task_id', taskIds)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return data as TimeLog[];
  }

  async logTime(taskId: string, hours: number, description?: string, logDate?: string): Promise<TimeLog> {
    const userId = this.api.user()?.id;
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await this.api.supabase
      .from('time_logs')
      .insert({
        user_id: userId,
        task_id: taskId,
        hours,
        description: description || null,
        log_date: logDate || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw error;
    return data as TimeLog;
  }

  async updateTimeLog(
    id: string,
    updates: { hours?: number; description?: string; log_date?: string; task_id?: string }
  ): Promise<TimeLog> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates['hours'] !== undefined) payload['hours'] = updates['hours'];
    if (updates['description'] !== undefined) payload['description'] = updates['description'] || null;
    if (updates['log_date'] !== undefined) payload['log_date'] = updates['log_date'];
    if (updates['task_id'] !== undefined) payload['task_id'] = updates['task_id'];

    const { data, error } = await this.api.supabase
      .from('time_logs')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as TimeLog;
  }

  async deleteTimeLog(id: string): Promise<void> {
    const { error } = await this.api.supabase
      .from('time_logs')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async getWeeklyHours(userId?: string): Promise<number> {
    const targetUserId = userId || this.api.user()?.id;
    if (!targetUserId) return 0;

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());

    const { data, error } = await this.api.supabase
      .from('time_logs')
      .select('hours')
      .eq('user_id', targetUserId)
      .gte('log_date', weekStart.toISOString().split('T')[0]);

    if (error) return 0;
    return data.reduce((sum, log) => sum + Number(log.hours), 0);
  }

  async getMonthlyHours(userId?: string): Promise<number> {
    const targetUserId = userId || this.api.user()?.id;
    if (!targetUserId) return 0;

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const { data, error } = await this.api.supabase
      .from('time_logs')
      .select('hours')
      .eq('user_id', targetUserId)
      .gte('log_date', monthStart.toISOString().split('T')[0]);

    if (error) return 0;
    return data.reduce((sum, log) => sum + Number(log.hours), 0);
  }

  /** Get date range for period (week, month, year). Returns [startDate, endDate] in YYYY-MM-DD. */
  getDateRangeForPeriod(period: 'week' | 'month' | 'year'): [string, string] {
    const today = new Date();
    const endDate = new Date(today);
    const startDate = new Date(today);

    switch (period) {
      case 'week':
        startDate.setDate(today.getDate() - today.getDay());
        break;
      case 'month':
        startDate.setDate(1);
        break;
      case 'year':
        startDate.setMonth(0);
        startDate.setDate(1);
        break;
    }

    return [
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
    ];
  }

  /**
   * Get team time logs for manager/admin. Scoped to given project IDs.
   * Use period 'week' | 'month' | 'year' for date range.
   */
  async getTeamTimeLogs(
    projectIds: string[],
    period: 'week' | 'month' | 'year'
  ): Promise<TimeLog[]> {
    if (!projectIds.length) return [];

    const [startDate, endDate] = this.getDateRangeForPeriod(period);

    const { data: tasks } = await this.api.supabase
      .from('tasks')
      .select('id')
      .in('project_id', projectIds);

    if (!tasks?.length) return [];

    const taskIds = tasks.map((t) => t.id);
    const { data, error } = await this.api.supabase
      .from('time_logs')
      .select(
        `
        *,
        task:tasks!time_logs_task_id_fkey(id, title, project:projects!tasks_project_id_fkey(id, title)),
        user:profiles!time_logs_user_id_fkey(id, full_name)
      `
      )
      .in('task_id', taskIds)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date', { ascending: false });

    if (error) throw error;
    return (data as TimeLog[]) || [];
  }

  /**
   * Get time logs for a specific employee (admin/manager only via RLS).
   */
  async getEmployeeTimeLogs(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<TimeLog[]> {
    let query = this.api.supabase
      .from('time_logs')
      .select(
        `
        *,
        task:tasks!time_logs_task_id_fkey(id, title, project:projects!tasks_project_id_fkey(id, title))
      `
      )
      .eq('user_id', userId)
      .order('log_date', { ascending: false });

    if (startDate) query = query.gte('log_date', startDate);
    if (endDate) query = query.lte('log_date', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return (data as TimeLog[]) || [];
  }

  /**
   * Get employee time logs grouped by date for chart (admin/manager only).
   */
  async getEmployeeTimeLogsByDay(
    userId: string,
    lastDays: number = 7
  ): Promise<{ date: string; hours: number }[]> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - lastDays);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const { data, error } = await this.api.supabase
      .from('time_logs')
      .select('log_date, hours')
      .eq('user_id', userId)
      .gte('log_date', startStr)
      .lte('log_date', endStr);

    if (error) return [];

    const byDate = new Map<string, number>();
    for (let d = 0; d <= lastDays; d++) {
      const d2 = new Date(start);
      d2.setDate(d2.getDate() + d);
      byDate.set(d2.toISOString().split('T')[0], 0);
    }

    data?.forEach((log) => {
      const date = (log as { log_date: string }).log_date;
      const current = byDate.get(date) ?? 0;
      byDate.set(date, current + Number((log as { hours: number }).hours));
    });

    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, hours]) => ({ date, hours }));
  }

  /**
   * Get time logs grouped by date for chart (last N days).
   * Returns array of { date, hours } for employee's own logs.
   */
  async getMyTimeLogsByDay(lastDays: number = 7): Promise<{ date: string; hours: number }[]> {
    const userId = this.api.user()?.id;
    if (!userId) return [];

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - lastDays);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const { data, error } = await this.api.supabase
      .from('time_logs')
      .select('log_date, hours')
      .eq('user_id', userId)
      .gte('log_date', startStr)
      .lte('log_date', endStr);

    if (error) return [];

    const byDate = new Map<string, number>();
    for (let d = 0; d <= lastDays; d++) {
      const d2 = new Date(start);
      d2.setDate(d2.getDate() + d);
      byDate.set(d2.toISOString().split('T')[0], 0);
    }

    data?.forEach((log) => {
      const date = (log as { log_date: string }).log_date;
      const current = byDate.get(date) ?? 0;
      byDate.set(date, current + Number((log as { hours: number }).hours));
    });

    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, hours]) => ({ date, hours }));
  }
}
