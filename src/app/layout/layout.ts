import { Component, inject, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { TitleCasePipe, NgClass } from '@angular/common';
import { Api } from '../services/api';
import { NotificationService } from '../services/notification.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: ('admin' | 'csm' | 'manager' | 'user' | 'it_manager' | 'finance')[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TitleCasePipe, NgClass],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  readonly api = inject(Api);
  readonly notifications = inject(NotificationService);
  readonly router = inject(Router);

  readonly sidebarCollapsed = signal(false);
  readonly showNotifications = signal(false);
  readonly showUserMenu = signal(false);

  private readonly allNavItems: NavItem[] = [
    // Common
    { label: 'Dashboard', icon: 'bi-speedometer2', route: '/dashboard' },
    { label: 'Search', icon: 'bi-search', route: '/search' },
    
    // User (Employee) only
    { label: 'My Work', icon: 'bi-briefcase', route: '/my-work', roles: ['user'] },
    { label: 'Task Board', icon: 'bi-kanban', route: '/task-board', roles: ['user'] },
    { label: 'My Time Logs', icon: 'bi-clock-history', route: '/my-time-logs', roles: ['user'] },
    { label: 'Explore Projects', icon: 'bi-compass', route: '/projects', roles: ['user'] },
    { label: 'My Interests', icon: 'bi-heart', route: '/my-interests', roles: ['user'] },
    
    // Admin & Manager
    { label: 'Projects', icon: 'bi-folder', route: '/projects', roles: ['admin', 'csm', 'manager'] },
    { label: 'Tasks', icon: 'bi-list-task', route: '/tasks', roles: ['admin', 'csm', 'manager'] },
    { label: 'Interest Requests', icon: 'bi-hand-index', route: '/interests', roles: ['admin', 'manager'] },
    { label: 'Team', icon: 'bi-people', route: '/team', roles: ['admin', 'manager'] },
    { label: 'Time Logs', icon: 'bi-clock-history', route: '/time-logs', roles: ['admin', 'manager'] },
    {
      label: 'Project finance',
      icon: 'bi-cash-coin',
      route: '/project-finance',
      roles: ['admin', 'manager'],
    },

    // Platform admin only
    { label: 'User Management', icon: 'bi-person-gear', route: '/users', roles: ['admin'] },
    { label: 'Activity Log', icon: 'bi-activity', route: '/activity', roles: ['admin'] },

    // IT Support — CSM sees only their own tickets (not the admin read-only queue)
    {
      label: 'IT Support',
      icon: 'bi-ticket-perforated',
      route: '/it-support',
      roles: ['admin', 'csm', 'manager', 'user', 'it_manager'],
    },
    
    // Common - Calendar & Settings
    { label: 'Calendar', icon: 'bi-calendar3', route: '/calendar' },
    { label: 'Notifications', icon: 'bi-bell', route: '/notifications' },
    { label: 'Settings', icon: 'bi-gear', route: '/settings' },
  ];

  /** Finance Manager: focused nav; dashboard goes straight to finance home. */
  private readonly financeNavItems: NavItem[] = [
    { label: 'Dashboard', icon: 'bi-speedometer2', route: '/dashboard/finance' },
    { label: 'Project finance', icon: 'bi-cash-coin', route: '/project-finance' },
    { label: 'Search', icon: 'bi-search', route: '/search' },
    { label: 'Calendar', icon: 'bi-calendar3', route: '/calendar' },
    { label: 'Notifications', icon: 'bi-bell', route: '/notifications' },
    { label: 'Settings', icon: 'bi-gear', route: '/settings' },
  ];

  readonly navItems = computed(() => {
    const role = this.api.userRole();
    if (!role) return [];
    if (role === 'finance') {
      return this.financeNavItems;
    }
    return this.allNavItems.filter((item) => !item.roles || item.roles.includes(role));
  });

  readonly userInitials = computed(() => {
    const name = this.api.profile()?.full_name || '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  });

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleNotifications(): void {
    this.showNotifications.update((v) => !v);
    this.showUserMenu.set(false);
  }

  toggleUserMenu(): void {
    this.showUserMenu.update((v) => !v);
    this.showNotifications.set(false);
  }

  closeDropdowns(): void {
    this.showNotifications.set(false);
    this.showUserMenu.set(false);
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    this.router.navigate(['/login']);
  }

  getTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}
