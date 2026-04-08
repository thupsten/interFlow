import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import {
  adminGuard,
  adminManagerOrFinanceGuard,
  adminOrManagerGuard,
  adminOrManagerOnlyGuard,
  canCreateProjectGuard,
  userOnlyGuard,
  adminOrItManagerGuard,
  financeGuard,
} from './guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'login',
    loadComponent: () => import('./user/login/login').then((m) => m.Login),
  },
  {
    path: 'accept-invite',
    loadComponent: () => import('./user/accept-invite/accept-invite').then((m) => m.AcceptInvite),
  },
  {
    path: '',
    loadComponent: () => import('./layout/layout').then((m) => m.Layout),
    canActivate: [authGuard],
    children: [

      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'dashboard/admin',
        loadComponent: () => import('./dashboard/admin/admin-dashboard').then((m) => m.AdminDashboard),
        canActivate: [adminGuard],
      },
      {
        path: 'dashboard/manager',
        loadComponent: () => import('./dashboard/manager/manager-dashboard').then((m) => m.ManagerDashboard),
        canActivate: [adminOrManagerGuard],
      },
      {
        path: 'dashboard/employee',
        loadComponent: () => import('./dashboard/employee/employee-dashboard').then((m) => m.EmployeeDashboard),
        canActivate: [userOnlyGuard],
      },
      {
        path: 'dashboard/it-manager',
        loadComponent: () => import('./dashboard/it-manager/it-manager-dashboard').then((m) => m.ItManagerDashboard),
        canActivate: [adminOrItManagerGuard],
      },
      {
        path: 'dashboard/finance',
        loadComponent: () => import('./dashboard/finance/finance-dashboard').then((m) => m.FinanceDashboard),
        canActivate: [financeGuard],
      },

      {
        path: 'search',
        loadComponent: () => import('./pages/search/search').then((m) => m.Search),
      },


      {
        path: 'projects',
        loadComponent: () => import('./pages/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'projects/new',
        loadComponent: () => import('./pages/project-form/project-form').then((m) => m.ProjectForm),
        canActivate: [canCreateProjectGuard],
      },
      {
        path: 'projects/:id',
        loadComponent: () => import('./pages/project-detail/project-detail').then((m) => m.ProjectDetail),
      },
      {
        path: 'projects/:id/edit',
        loadComponent: () => import('./pages/project-form/project-form').then((m) => m.ProjectForm),
        canActivate: [adminOrManagerGuard],
      },


      {
        path: 'tasks',
        loadComponent: () => import('./pages/tasks/tasks').then((m) => m.Tasks),
      },
      {
        path: 'projects/:projectId/tasks/new',
        loadComponent: () => import('./pages/task-form/task-form').then((m) => m.TaskForm),
      },


      {
        path: 'my-work',
        loadComponent: () => import('./pages/my-work/my-work').then((m) => m.MyWork),
        canActivate: [userOnlyGuard],
      },


      {
        path: 'task-board',
        loadComponent: () => import('./pages/task-board/task-board').then((m) => m.TaskBoard),
        canActivate: [userOnlyGuard],
      },


      {
        path: 'my-interests',
        loadComponent: () => import('./pages/my-interests/my-interests').then((m) => m.MyInterests),
        canActivate: [userOnlyGuard],
      },


      {
        path: 'project-finance',
        loadComponent: () => import('./pages/project-finance/project-finance').then((m) => m.ProjectFinance),
        canActivate: [adminManagerOrFinanceGuard],
      },


      {
        path: 'interests',
        loadComponent: () => import('./pages/interests/interests').then((m) => m.Interests),
        canActivate: [adminOrManagerOnlyGuard],
      },


      {
        path: 'team',
        loadComponent: () => import('./pages/team/team').then((m) => m.Team),
        canActivate: [adminOrManagerOnlyGuard],
      },


      {
        path: 'time-logs',
        loadComponent: () => import('./pages/time-logs/time-logs').then((m) => m.TimeLogs),
        canActivate: [adminOrManagerOnlyGuard],
      },
      {
        path: 'time-logs/:userId',
        loadComponent: () => import('./pages/time-logs/time-logs').then((m) => m.TimeLogs),
        canActivate: [adminOrManagerOnlyGuard],
      },


      {
        path: 'my-time-logs',
        loadComponent: () => import('./pages/my-time-logs/my-time-logs').then((m) => m.MyTimeLogs),
        canActivate: [userOnlyGuard],
      },


      {
        path: 'users',
        loadComponent: () => import('./pages/user-management/user-management').then((m) => m.UserManagement),
        canActivate: [adminGuard],
      },


      {
        path: 'activity',
        loadComponent: () => import('./pages/activity/activity').then((m) => m.Activity),
        canActivate: [adminGuard],
      },


      {
        path: 'it-support',
        loadComponent: () => import('./pages/it-support/it-support').then((m) => m.ItSupport),
      },


      {
        path: 'calendar',
        loadComponent: () => import('./pages/calendar/calendar').then((m) => m.Calendar),
      },


      {
        path: 'notifications',
        loadComponent: () => import('./pages/notifications/notifications').then((m) => m.Notifications),
      },


      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
      },
      {
        path: 'profile',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
