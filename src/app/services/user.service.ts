import { Injectable, inject } from '@angular/core';
import { Api } from './api';
import type { Profile } from '../interfaces/database.types';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly api = inject(Api);

  async getUsers(): Promise<Profile[]> {
    const { data, error } = await this.api.supabase
      .from('profiles')
      .select('*')
      .neq('status', 'invited')
      .order('full_name');

    if (error) throw error;
    return data as Profile[];
  }

  async getPendingInvites(): Promise<Profile[]> {
    const { data, error } = await this.api.supabase
      .from('profiles')
      .select('*')
      .eq('status', 'invited')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Profile[];
  }

  async getUserById(id: string): Promise<Profile | null> {
    const { data, error } = await this.api.supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Profile;
  }

  async updateUser(id: string, updates: Partial<Profile>): Promise<Profile> {
    const { data, error } = await this.api.supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Profile;
  }

  async getUserStats() {
    const { data, error } = await this.api.supabase
      .from('profiles')
      .select('role, status');

    if (error) throw error;

    const stats = {
      total: 0,
      admins: 0,
      csms: 0,
      managers: 0,
      users: 0,
      active: 0,
      pending: 0,
    };

    data?.forEach((p) => {
      if (p.status === 'invited') {
        stats.pending++;
        return;
      }
      stats.total++;
      if (p.role === 'admin') stats.admins++;
      if (p.role === 'csm') stats.csms++;
      if (p.role === 'manager') stats.managers++;
      if (p.role === 'user') stats.users++;
      if (p.status === 'active') stats.active++;
    });

    return stats;
  }
}
