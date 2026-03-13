import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../services/api';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  template: `
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading dashboard...</span>
    </div>
  `,
  styles: [`
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 4rem;
      color: #64748b;
    }
    .spinner {
      width: 2.5rem;
      height: 2.5rem;
      border: 3px solid #e2e8f0;
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class Dashboard implements OnInit {
  readonly api = inject(Api);
  readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    await this.api.initialize();
    const role = this.api.userRole();

    if (role === 'admin') {
      this.router.navigate(['/dashboard/admin'], { replaceUrl: true });
    } else if (role === 'manager') {
      this.router.navigate(['/dashboard/manager'], { replaceUrl: true });
    } else if (role === 'it_manager') {
      this.router.navigate(['/dashboard/it-manager'], { replaceUrl: true });
    } else {
      this.router.navigate(['/dashboard/employee'], { replaceUrl: true });
    }
  }
}
