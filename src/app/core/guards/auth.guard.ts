import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Wait for auth to finish loading, with a 10s safety timeout. */
function waitForAuth(auth: AuthService): Promise<void> {
  if (!auth.loading()) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { clearInterval(check); resolve(); }, 10000);
    const check = setInterval(() => {
      if (!auth.loading()) {
        clearInterval(check);
        clearTimeout(timeout);
        resolve();
      }
    }, 50);
  });
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await waitForAuth(auth);

  if (auth.isAuthenticated()) return true;

  router.navigate(['/auth/login']);
  return false;
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await waitForAuth(auth);

  if (auth.isAdmin()) return true;

  router.navigate(['/dashboard']);
  return false;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await waitForAuth(auth);

  if (!auth.isAuthenticated()) return true;

  router.navigate(['/dashboard']);
  return false;
};
