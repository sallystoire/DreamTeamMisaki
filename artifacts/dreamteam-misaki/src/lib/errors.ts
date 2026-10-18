export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object') {
      const d = data as { error?: unknown; message?: unknown };
      if (typeof d.error === 'string' && d.error) return d.error;
      if (typeof d.message === 'string' && d.message) return d.message;
    }
    const status = (error as { status?: number }).status;
    if (status === 409) return 'Tu fais déjà partie d’une équipe. Quitte-la avant d’en rejoindre une autre.';
    if (status === 404) return 'Aucune équipe ne correspond à ce code.';
  }
  return fallback;
}
