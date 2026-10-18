import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDreamTeamDashboardQueryKey, getGetMyTeamQueryKey, getListAdminMembersQueryKey, getListAdminTeamsQueryKey,
  useGetDreamTeamDashboard, useJoinTeam,
} from '@workspace/api-client-react';
import { Crown, LoaderCircle, LogIn, RefreshCw, Users, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/errors';

const STORAGE_KEY = 'dreamteam.pendingJoinCode';
type Ctx = { open: (opener?: HTMLElement | null) => void };
const JoinDialogContext = createContext<Ctx | null>(null);
export function useJoinDialog(): Ctx {
  const v = useContext(JoinDialogContext);
  if (!v) throw new Error('JoinDialogProvider manquant');
  return v;
}

function readStored() { try { return window.localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; } }
function writeStored(v: string) { try { if (v) window.localStorage.setItem(STORAGE_KEY, v); else window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage indisponible */ } }

export function JoinDialogProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const join = useJoinTeam();
  const dashboard = useGetDreamTeamDashboard({ query: { queryKey: getGetDreamTeamDashboardQueryKey(), refetchInterval: 20000 } });
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState(readStored);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const offered = useRef(false);

  const open = useCallback((opener?: HTMLElement | null) => {
    openerRef.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setError('');
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (auth.user && !offered.current && readStored().length >= 4) {
      offered.current = true;
      setCode(readStored());
      setRestored(true);
      openerRef.current = null;
      setIsOpen(true);
    }
  }, [auth.user]);

  useEffect(() => {
    if (isOpen) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [isOpen]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),[tabindex]:not([tabindex="-1"])'));
    if (!nodes.length) return;
    const first = nodes[0]; const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const onChange = (v: string) => { setCode(v); writeStored(v.trim()); setError(''); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    join.mutate({ data: { code: code.trim() } }, {
      onSuccess: () => {
        writeStored(''); setCode(''); setRestored(false);
        void qc.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetDreamTeamDashboardQueryKey() });
        void qc.invalidateQueries({ queryKey: getListAdminTeamsQueryKey() });
        void qc.invalidateQueries({ queryKey: getListAdminMembersQueryKey() });
        setIsOpen(false);
        navigate('/team');
      },
      onError: (err) => setError(apiErrorMessage(err, 'Impossible de rejoindre cette équipe. Vérifie le code auprès du capitaine.')),
    });
  };

  const teams = useMemo(() => [...(dashboard.data?.leaderboard ?? [])].sort((a, b) => b.voiceHours - a.voiceHours), [dashboard.data]);
  const ctx = useMemo(() => ({ open }), [open]);

  return <JoinDialogContext.Provider value={ctx}>
    {children}
    {isOpen && <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-testid="dialog-backdrop">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="join-title" ref={dialogRef} onKeyDown={onKeyDown} data-testid="dialog-join">
        <button className="dialog-close" onClick={close} aria-label="Fermer" data-testid="button-close-join"><X size={16} /></button>
        <div className="eyebrow">Rejoindre une équipe</div>
        <h2 id="join-title" className="dialog-title">Choisis ta bannière.</h2>
        <p className="hint" style={{ marginTop: 6 }}>Demande le code à ton capitaine, entre-le ci-dessous. Une seule équipe à la fois.</p>
        <div className="dialog-teams" data-testid="list-join-teams">
          {dashboard.isLoading ? <><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /></> : dashboard.isError ? <div className="error-note" role="alert">Impossible de charger les équipes. <button className="btn btn-quiet btn-small" onClick={() => void dashboard.refetch()} data-testid="button-retry-join-teams"><RefreshCw size={12} /> Réessayer</button></div> : teams.length ? teams.map((t, i) => <div className="dialog-team" key={t.id} data-testid={`join-team-${t.id}`}>
            <span className={`rank-number ${i === 0 ? 'first' : ''}`}>{i === 0 ? <Crown size={13} /> : String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0, flex: 1 }}><div className="team-name">{t.name}</div><div className="team-sub">Capitaine {t.captainName} · {t.memberCount} membres</div></div>
            <div className="hours">{t.voiceHours.toFixed(1)} <small>h</small></div>
          </div>) : <div className="empty-state"><div className="empty-symbol"><Users size={17} /></div><strong>Aucune équipe active</strong><p>Les équipes apparaîtront ici dès leur création.</p></div>}
        </div>
        <form onSubmit={submit} className="dialog-form">
          {restored && auth.user && <div className="notice" style={{ marginTop: 0 }} role="status">Tu es connecté. Ton code est prêt : clique sur Rejoindre pour confirmer.</div>}
          <label className="cap-field">Code d’invitation
            <input ref={inputRef} className="text-input" value={code} onChange={(e) => onChange(e.target.value)} placeholder="Ex. MISAKI-24" maxLength={32} autoComplete="off" data-testid="input-dialog-code" />
          </label>
          {error && <div className="error-note" role="alert" data-testid="text-join-error">{error}</div>}
          {auth.user ? <button className="btn btn-primary" type="submit" disabled={join.isPending || code.trim().length < 4} data-testid="button-submit-join">{join.isPending ? <><LoaderCircle size={14} className="spin" /> Envoi…</> : 'Rejoindre'}</button>
            : <>
              <p className="hint" style={{ margin: 0 }}>Ton code est gardé sur cet appareil pendant la connexion. Tu confirmeras ensuite.</p>
              <a className="btn btn-primary" href="/api/auth/discord/login" onClick={() => writeStored(code.trim())} data-testid="link-dialog-login"><LogIn size={14} /> Connexion Discord</a>
            </>}
        </form>
      </div>
    </div>}
  </JoinDialogContext.Provider>;
}
