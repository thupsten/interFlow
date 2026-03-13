import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api } from '../../services/api';
import { SnackbarService } from '../../services/snackbar.service';
import type { ItSupportTicket, ItTicketStatus } from '../../interfaces/database.types';

@Component({
  selector: 'app-it-support',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './it-support.html',
  styleUrl: './it-support.scss',
})
export class ItSupport implements OnInit {
  readonly api = inject(Api);
  readonly snackbar = inject(SnackbarService);
  readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly tickets = signal<ItSupportTicket[]>([]);
  readonly showCreateModal = signal(false);
  readonly submitting = signal(false);
  readonly selectedStatus = signal<string>('all');

  readonly createForm = {
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
  };

  readonly canUpdateStatus = computed(() => this.api.isItManager());
  readonly canDelete = computed(() => this.api.isItManager());
  readonly isAdminView = computed(() => this.api.isAdmin() && !this.api.isItManager());

  readonly filteredTickets = computed(() => {
    const status = this.selectedStatus();
    const list = this.tickets();
    if (status === 'all') return list;
    return list.filter((t) => t.status === status);
  });

  async ngOnInit(): Promise<void> {
    this.route.queryParams.subscribe((params) => {
      const status = params['status'];
      if (status) this.selectedStatus.set(status);
    });
    await this.loadTickets();
  }

  async loadTickets(): Promise<void> {
    this.loading.set(true);
    try {
      const { data } = await this.api.supabase
        .from('it_support_tickets')
        .select('*, raiser:profiles!it_support_tickets_raised_by_fkey(id, full_name, email), resolver:profiles!it_support_tickets_resolved_by_fkey(id, full_name)')
        .order('created_at', { ascending: false });

      this.tickets.set((data || []) as ItSupportTicket[]);
    } finally {
      this.loading.set(false);
    }
  }

  openCreateModal(): void {
    this.createForm.title = '';
    this.createForm.description = '';
    this.createForm.priority = 'medium';
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  async submitTicket(): Promise<void> {
    if (!this.createForm.title.trim()) {
      this.snackbar.error('Title is required');
      return;
    }
    const userId = this.api.user()?.id;
    if (!userId) return;

    this.submitting.set(true);
    try {
      const { error } = await this.api.supabase.from('it_support_tickets').insert({
        raised_by: userId,
        title: this.createForm.title.trim(),
        description: this.createForm.description.trim() || null,
        priority: this.createForm.priority,
      });

      if (error) throw error;
      this.snackbar.success('IT support request created');
      this.closeCreateModal();
      await this.loadTickets();
    } catch {
      this.snackbar.error('Failed to create request');
    } finally {
      this.submitting.set(false);
    }
  }

  async updateStatus(ticket: ItSupportTicket, status: string): Promise<void> {
    if (!this.canUpdateStatus()) return;
    const s = status as ItTicketStatus;
    try {
      const updates: Partial<ItSupportTicket> = { status: s };
      if (['resolved', 'closed'].includes(s)) {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = this.api.user()?.id ?? null;
        const note = prompt('Resolution note (optional):');
        if (note?.trim()) updates.resolution_note = note.trim();
      }
      const { error } = await this.api.supabase
        .from('it_support_tickets')
        .update(updates)
        .eq('id', ticket.id);

      if (error) throw error;
      this.snackbar.success('Status updated');
      this.tickets.update((list) =>
        list.map((t) => (t.id === ticket.id ? { ...t, ...updates } : t))
      );
    } catch {
      this.snackbar.error('Failed to update status');
    }
  }

  async deleteTicket(ticket: ItSupportTicket): Promise<void> {
    if (!this.canDelete()) return;
    if (!confirm('Delete this ticket?')) return;
    try {
      const { error } = await this.api.supabase.from('it_support_tickets').delete().eq('id', ticket.id);
      if (error) throw error;
      this.snackbar.success('Ticket deleted');
      this.tickets.update((list) => list.filter((t) => t.id !== ticket.id));
    } catch {
      this.snackbar.error('Failed to delete ticket');
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
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  getRaiserName(ticket: ItSupportTicket): string {
    const raiser = ticket.raiser as { full_name?: string; email?: string } | undefined;
    return raiser?.full_name || raiser?.email || 'Unknown';
  }
}
