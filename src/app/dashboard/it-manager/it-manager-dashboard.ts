import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../services/api';
import type { ItSupportTicket } from '../../interfaces/database.types';

@Component({
  selector: 'app-it-manager-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './it-manager-dashboard.html',
  styleUrl: './it-manager-dashboard.scss',
})
export class ItManagerDashboard implements OnInit {
  readonly api = inject(Api);

  readonly loading = signal(true);
  readonly stats = signal({
    open: 0,
    inProgress: 0,
    resolved: 0,
    total: 0,
  });
  readonly recentTickets = signal<ItSupportTicket[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const { data } = await this.api.supabase
        .from('it_support_tickets')
        .select('*, raiser:profiles!it_support_tickets_raised_by_fkey(id, full_name, email)')
        .order('created_at', { ascending: false })
        .limit(10);

      const tickets = (data || []) as ItSupportTicket[];
      this.recentTickets.set(tickets);

      const [{ count: openCount }, { count: inProgressCount }, { count: resolvedCount }, { count: totalCount }] =
        await Promise.all([
          this.api.supabase.from('it_support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          this.api.supabase.from('it_support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
          this.api.supabase.from('it_support_tickets').select('*', { count: 'exact', head: true }).in('status', ['resolved', 'closed']),
          this.api.supabase.from('it_support_tickets').select('*', { count: 'exact', head: true }),
        ]);

      this.stats.set({
        open: openCount ?? 0,
        inProgress: inProgressCount ?? 0,
        resolved: resolvedCount ?? 0,
        total: totalCount ?? 0,
      });
    } finally {
      this.loading.set(false);
    }
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      open: 'warning',
      in_progress: 'info',
      resolved: 'success',
      closed: 'secondary',
    };
    return map[status] ?? 'secondary';
  }

  getPriorityClass(priority: string): string {
    const map: Record<string, string> = {
      low: 'secondary',
      medium: 'info',
      high: 'warning',
      urgent: 'danger',
    };
    return map[priority] ?? 'secondary';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
