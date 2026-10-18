import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useAddAdminTeamMember,
  useArchiveAdminTeam,
  useCreateAdminChallenge,
  useGetCaptainApplication,
  useSubmitCaptainApplication,
  getGetCaptainApplicationQueryKey,
  useGetDreamTeamDashboard,
  useGetMyTeam,
  useJoinTeam,
  useListAdminChallenges,
  useListAdminMembers,
  useListAdminTeams,
  useRemoveAdminTeamMember,
  useRemoveMyTeamMember,
  useUpdateAdminTeam,
  useUpdateMemberRole,
  getGetDreamTeamDashboardQueryKey,
  getGetMyTeamQueryKey,
  getListAdminChallengesQueryKey,
  getListAdminMembersQueryKey,
  getListAdminTeamsQueryKey,
} from '@workspace/api-client-react';
import type { CaptainApplicationStatus, Challenge, Member, SiteRole, TeamProgress } from '@workspace/api-client-react';
import {
  Award, Check, ChevronRight, Clock3, Crown, Headphones, LoaderCircle, LogIn,
  LogOut, Radio, RefreshCw, Search, Shield, Sparkles, Trophy, Users, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 8000, retry: 1, refetchOnWindowFocus: true } },
});

type AuthUser = { username?: string; global_name?: string; displayName?: string; role?: string; avatarUrl?: string; id?: string; discordId?: string };
type Feedback = { text: string; kind: 'error' | 'success' } | null;

function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch('/api/auth/user', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setUser(null);
        else setFailed(true);
      } else {
        const result: unknown = await response.json();
        const candidate = result && typeof result === 'object' && 'user' in result
          ? (result as { user?: AuthUser }).user
          : result as AuthUser;
        setUser(candidate && typeof candidate === 'object' ? candidate : null);
      }
    } catch { setFailed(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return { user, loading, failed, reload: load };
}

type AuthState = ReturnType<typeof useCurrentUser>;
const AuthContext = createContext<AuthState | null>(null);
function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useCurrentUser();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider manquant');
  return value;
}
const roleLabels: Record<string, string> = { MEMBER: 'Équipier', CAPTAIN: 'Capitaine', ADMIN: 'Admin', ADMIN_PLUS: 'Admin+' };

function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const auth = useAuth();
  const role = auth.user?.role;
  const displayName = auth.user?.global_name || auth.user?.displayName || auth.user?.username;
  const links: { href: string; label: string; gold?: boolean; testid: string }[] = [{ href: '/', label: 'La course', testid: 'link-race' }];
  if (!auth.user) links.push({ href: '/captain', label: 'Devenir Capitaine', gold: true, testid: 'link-captain' });
  else if (role === 'ADMIN_PLUS') links.push({ href: '/admin', label: 'Admin+', testid: 'link-admin-plus' });
  else if (role === 'ADMIN') links.push({ href: '/admin', label: 'Gestion', testid: 'link-admin' });
  else links.push({ href: '/team', label: 'Gestion', testid: 'link-team' });
  if (auth.user) links.push({ href: '/captain', label: 'Devenir Capitaine', gold: true, testid: 'link-captain' });
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/" className="brand" data-testid="link-home" aria-label="DreamTeam Misaki - accueil">
          <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="DreamTeam Misaki" className="brand-logo" data-testid="img-logo" />
        </Link>
        <nav className="nav-links" aria-label="Navigation principale">
          {links.map((l) => <Link key={l.href} href={l.href} className={`nav-link ${l.gold ? 'gold' : ''} ${path === l.href ? 'active' : ''}`} data-testid={l.testid}>{l.label}</Link>)}
        </nav>
        <div className="header-right">
          {auth.loading ? <span className="user-pill">Connexion…</span> : displayName ? (
            <a className="user-pill" href="/api/auth/logout" data-testid="link-logout" title="Se déconnecter">
              <span className="role-chip" data-testid="text-role">{roleLabels[role ?? 'MEMBER'] ?? 'Équipier'}</span>{displayName} <LogOut size={13} aria-hidden="true" />
            </a>
          ) : (
            <a className="btn btn-primary btn-small" href="/api/auth/discord/login" data-testid="link-login">
              Connexion Discord <LogIn size={13} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>
      <main className="main-content page-enter">{children}</main>
      <footer className="site-footer" data-testid="footer">
        <a href="https://discord.gg/misaki" target="_blank" rel="noopener noreferrer" data-testid="link-footer-discord">discord.gg/misaki - ouvre un ticket GS pour toute questions.</a>
      </footer>
      <div className="sr-only" aria-live="polite">{auth.failed ? 'Impossible de vérifier la connexion Discord.' : ''}</div>
    </div>
  );
}

const RECRUIT_INVITE = 'https://discord.gg/CNKn4X4jJ';
type CaptainForm = { discordUsername: string; age: string; availability: string; motivation: string; staffManagement: string; experience: string; voiceHours: string; misakiRoles: string };
const emptyCaptainForm: CaptainForm = { discordUsername: '', age: '', availability: '', motivation: '', staffManagement: '', experience: '', voiceHours: '', misakiRoles: '' };

function CaptainPage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const appQuery = useGetCaptainApplication({ query: { queryKey: getGetCaptainApplicationQueryKey(), enabled: !!auth.user } });
  const submit = useSubmitCaptainApplication();
  const [form, setForm] = useState<CaptainForm>(emptyCaptainForm);
  const [result, setResult] = useState<CaptainApplicationStatus | null>(null);
  const [error, setError] = useState('');
  const userId = auth.user?.discordId || auth.user?.id || '';
  const userName = auth.user?.global_name || auth.user?.displayName || auth.user?.username || '';
  useEffect(() => {
    if (userName) setForm((f) => (f.discordUsername ? f : { ...f, discordUsername: userName }));
  }, [userName]);
  const [restoredAnswers, setRestoredAnswers] = useState(false);
  useEffect(() => {
    const saved = appQuery.data?.answers;
    if (!saved || restoredAnswers) return;
    setForm({
      discordUsername: saved.discordUsername, age: String(saved.age),
      availability: saved.availability, motivation: saved.motivation,
      staffManagement: saved.staffManagement, experience: saved.experience,
      voiceHours: String(saved.voiceHours), misakiRoles: saved.misakiRoles,
    });
    setRestoredAnswers(true);
  }, [appQuery.data, restoredAnswers]);
  const current = result ?? appQuery.data ?? null;
  const status = current?.status ?? 'NONE';
  const inviteUrl = current?.inviteUrl || RECRUIT_INVITE;
  const justSent = !!result && result.status === 'SENT';
  useEffect(() => {
    if (!justSent) return;
    const t = window.setTimeout(() => window.location.assign(inviteUrl), 2500);
    return () => window.clearTimeout(t);
  }, [justSent, inviteUrl]);
  const set = (k: keyof CaptainForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    submit.mutate({ data: {
      discordUsername: form.discordUsername.trim(), age: Number(form.age), availability: form.availability.trim(),
      motivation: form.motivation.trim(), staffManagement: form.staffManagement.trim(), experience: form.experience.trim(),
      voiceHours: Number(form.voiceHours), misakiRoles: form.misakiRoles.trim(), discordId: userId,
    } }, {
      onSuccess: (r) => { setResult(r); qc.setQueryData(getGetCaptainApplicationQueryKey(), r); },
      onError: (e) => setError(e instanceof Error && e.message ? e.message : 'L’envoi a échoué. Vérifie tes réponses et réessaie.'),
    });
  };
  const channel = current?.channelUrl;
  const showStatus = !!auth.user && !appQuery.isLoading && (status === 'SENT' || status === 'PENDING');
  return <div data-testid="page-captain">
    <div className="captain-hero" style={{ padding: '40px 28px', marginBottom: 20 }}>
      <div className="eyebrow" style={{ color: '#f5c75a' }}>Devenir Capitaine</div>
      <h1>Mène ton équipe.</h1>
      <p data-testid="text-captain-copy" style={{ marginBottom: 0 }}>Le poste de Capitaine est réservé aux gestions staffs de Misaki. Si tu as toi aussi envie de devenir Capitaine alors il faudra faire une candidature.</p>
    </div>
    {auth.loading || (auth.user && appQuery.isLoading) ? <div className="panel section-card"><LoadingRows amount={3} /></div> : auth.user && appQuery.isError ? <ErrorBox onRetry={() => void appQuery.refetch()} text="Impossible de vérifier ta candidature. Réessaie dans un instant." /> : showStatus ? (
      <section className="panel section-card" role="status" data-testid="status-captain-application">
        <div className="eyebrow" style={{ color: '#f5c75a' }}>{status === 'SENT' ? 'Candidature enregistrée' : status === 'PENDING' ? 'Envoi en cours' : 'Envoi non abouti'}</div>
        <h2 style={{ font: '700 24px var(--app-font-serif)', margin: '8px 0' }}>{status === 'SENT' ? 'Ta candidature est enregistrée.' : status === 'PENDING' ? 'Ta candidature est en cours d’envoi.' : 'Ta candidature n’a pas pu être transmise.'}</h2>
        <p className="hint">{status === 'SENT' ? (justSent ? 'Redirection vers le serveur recrutement dans quelques secondes. Si rien ne se passe, utilise le bouton ci-dessous.' : 'Rejoins le serveur recrutement pour suivre la suite avec le staff.') : status === 'PENDING' ? 'Ta candidature est enregistrée mais pas encore transmise au staff. Recharge la page dans un instant pour vérifier ; elle n’a pas besoin d’être renvoyée.' : 'Ta candidature est enregistrée mais la transmission a échoué. Réessaie plus tard ou rejoins le serveur recrutement et préviens le staff.'}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <a className="btn gold" href={inviteUrl} target="_blank" rel="noopener noreferrer" data-testid="link-recruitment">Rejoindre le serveur recrutement</a>
          {status === 'SENT' && channel && <a className="btn btn-quiet" href={channel} target="_blank" rel="noopener noreferrer" data-testid="link-private-channel">Ouvrir mon salon privé</a>}
          {status !== 'SENT' && <button className="btn btn-quiet" onClick={() => void appQuery.refetch()} data-testid="button-refresh-application"><RefreshCw size={13} /> Actualiser le statut</button>}
        </div>
      </section>
    ) : (
      <form className="panel section-card" onSubmit={onSubmit} data-testid="form-captain">
        {status === 'FAILED' && <div className="notice" role="alert">Ta candidature est conservée, mais n’a pas été transmise à Discord. Vérifie tes réponses et réessaie après 30 secondes.</div>}
        <div className="section-title-row"><div><div className="eyebrow" style={{ color: '#f5c75a' }}>Candidature</div><h2 style={{ marginTop: 6 }}>Postuler comme Capitaine</h2></div></div>
        {!auth.user && <div className="notice" style={{ marginTop: 0, marginBottom: 18, justifyContent: 'space-between', alignItems: 'center' }}><span>Connecte ton Discord pour envoyer ta candidature.</span><a className="btn btn-primary btn-small" href="/api/auth/discord/login" data-testid="link-captain-login"><LogIn size={13} /> Connexion Discord</a></div>}
        <div className="cap-grid">
          <label className="cap-field">Pseudo Discord<input className="text-input" required maxLength={80} value={form.discordUsername} onChange={set('discordUsername')} data-testid="input-pseudo" /></label>
          <label className="cap-field">Identifiant Discord<input className="text-input" readOnly required value={userId} placeholder="Rempli après connexion" pattern="[0-9]{17,20}" data-testid="input-discord-id" /></label>
          <label className="cap-field">Âge<input className="text-input" type="number" required min={13} max={100} step={1} value={form.age} onChange={set('age')} data-testid="input-age" /></label>
          <label className="cap-field">Heures de vocal sur Misaki<input className="text-input" type="number" required min={0} max={100000} step="any" value={form.voiceHours} onChange={set('voiceHours')} data-testid="input-voice-hours" /></label>
          <label className="cap-field wide">Disponibilité (semaine/week-end)<textarea className="text-input cap-area" required maxLength={1000} value={form.availability} onChange={set('availability')} data-testid="input-availability" /></label>
          <label className="cap-field wide">Motivation<textarea className="text-input cap-area" required maxLength={1000} value={form.motivation} onChange={set('motivation')} data-testid="input-motivation" /></label>
          <label className="cap-field wide">Expliquer ce qu’est la Gestion Staff<textarea className="text-input cap-area" required maxLength={1000} value={form.staffManagement} onChange={set('staffManagement')} data-testid="input-staff-management" /></label>
          <label className="cap-field wide">Expérience sur Discord<textarea className="text-input cap-area" required maxLength={1000} value={form.experience} onChange={set('experience')} data-testid="input-experience" /></label>
          <label className="cap-field wide">Rôles sur Misaki<textarea className="text-input cap-area" required maxLength={1000} value={form.misakiRoles} onChange={set('misakiRoles')} data-testid="input-misaki-roles" /></label>
        </div>
        <div className="notice"><Shield size={15} /><span>Tes réponses sont envoyées au staff du recrutement Misaki, et uniquement à lui.</span></div>
        {error && <div className="error-note" role="alert" data-testid="text-captain-error">{error} Tes réponses sont conservées, tu peux réessayer.</div>}
        <div style={{ marginTop: 18 }}>
          <button className="btn gold" type="submit" disabled={!auth.user || !userId || submit.isPending} data-testid="button-submit-application">{submit.isPending ? <><LoaderCircle size={15} className="spin" /> Envoi en cours…</> : 'Envoyer ma candidature'}</button>
        </div>
      </form>
    )}
  </div>;
}

function ErrorBox({ onRetry, text = 'Le chargement a échoué. Réessaie dans un instant.' }: { onRetry: () => void; text?: string }) {
  return <div className="panel error-panel" role="alert"><span>{text}</span><button className="btn btn-quiet btn-small" onClick={onRetry} data-testid="button-retry"><RefreshCw size={13} /> Réessayer</button></div>;
}

function LoadingRows({ amount = 4 }: { amount?: number }) {
  return <div aria-label="Chargement" data-testid="loading-state">{Array.from({ length: amount }, (_, i) => <div className="skeleton skeleton-row" key={i} />)}</div>;
}

function Avatar({ member }: { member: Pick<Member, 'username' | 'avatarUrl'> }) {
  return <div className="avatar" aria-label={`Avatar de ${member.username}`} data-testid={`img-avatar-${member.username}`}>
    {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.username.slice(0, 2).toUpperCase()}
  </div>;
}

function Countdown({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, seconds));
  useEffect(() => { setRemaining(Math.max(0, seconds)); }, [seconds]);
  useEffect(() => {
    const interval = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return <div className="timer-box" data-testid="challenge-countdown" aria-label={`${d} jours, ${h} heures, ${m} minutes restantes`}>
    <div className="timer-label">La ligne d’arrivée approche</div>
    <div className="timer-digits"><span>{String(d).padStart(2, '0')}<small>J</small></span><span>:</span><span>{String(h).padStart(2, '0')}<small>H</small></span><span>:</span><span>{String(m).padStart(2, '0')}<small>M</small></span><span>:</span><span>{String(s).padStart(2, '0')}<small>S</small></span></div>
  </div>;
}

function ChallengeResult({ challenge }: { challenge: Challenge }) {
  if (challenge.status === 'ACTIVE') return null;
  let headline = 'Tirage en attente';
  let copy = 'Les résultats seront annoncés une fois le tirage effectué.';
  if (challenge.drawStatus === 'DRAWN') {
    headline = challenge.winnerUsername ? `${challenge.winnerUsername} remporte le tirage` : 'Le tirage est terminé';
    copy = challenge.winningTeamName ? `${challenge.winningTeamName} a remporté la course d’équipe.` : 'Le gagnant de cette semaine est désigné.';
  } else if (challenge.drawStatus === 'NO_ELIGIBLE_MEMBERS') {
    headline = 'Pas de ticket éligible';
    copy = 'Aucun membre n’a atteint les 10 heures requises pour le tirage.';
  }
  return <div className="panel section-card" data-testid="challenge-result">
    <div className="eyebrow">Résultat de la semaine</div>
    <h2 className="panel-title" style={{ fontSize: 25, marginTop: 8 }}>{headline}</h2>
    <p className="panel-caption" style={{ fontSize: 12 }}>{copy}</p>
  </div>;
}

function HomePage() {
  const dashboard = useGetDreamTeamDashboard({ query: { queryKey: getGetDreamTeamDashboardQueryKey(), refetchInterval: 20000 } });
  const data = dashboard.data;
  const leaderboard = data?.leaderboard ?? [];
  const maxHours = Math.max(1, ...leaderboard.map((team) => team.voiceHours));
  const activeChallenge = data?.challenge?.status === 'ACTIVE';
  const completedChallenge = data?.challenge?.status === 'COMPLETED';
  return <>
    <div className="hero-top">
      <div>
        <div className="eyebrow">Une semaine. Une équipe. Un seul trophée.</div>
        <h1 className="hero-title">
          {dashboard.isLoading ? <>Le classement<br /><span>arrive.</span></> : activeChallenge ? <>La course<br />est <span>lancée.</span></> : completedChallenge ? <>Le défi est<br /><span>terminé.</span></> : <>La course<br /><span>se prépare.</span></>}
        </h1>
        <p className="hero-sub">
          {activeChallenge
            ? 'Chaque minute passée ensemble en vocal rapproche votre équipe de la victoire. Le classement bouge en direct, à vous de jouer.'
            : completedChallenge
              ? 'Le compteur est arrêté et les résultats de la semaine restent consultables pendant la préparation du prochain défi.'
              : 'Aucun défi n’est ouvert. Un Admin+ pourra lancer la prochaine course de sept jours depuis le panneau Gestion.'}
        </p>
      </div>
      {data?.challenge?.status === 'ACTIVE' ? <Countdown seconds={data.secondsRemaining} /> : (
        <div className="timer-box"><div className="timer-label">{data?.challenge ? 'Semaine terminée' : 'Prochaine course'}</div><div className="timer-digits">{data?.challenge ? 'FINISH' : 'BIENTÔT'}</div></div>
      )}
    </div>
    {dashboard.isLoading ? <div className="race-grid"><div className="panel" style={{ padding: 20 }}><LoadingRows /></div><div className="skeleton" style={{ height: 330 }} /></div> : dashboard.isError ? <ErrorBox onRetry={() => void dashboard.refetch()} /> : (
      <>
        {data?.challenge && <div className="race-grid">
          <section className="panel" aria-labelledby="leaderboard-title">
            <div className="panel-head">
              <div><div className="eyebrow">Classement général</div><h2 id="leaderboard-title" className="panel-title" style={{ marginTop: 6 }}>La mêlée des équipes</h2><p className="panel-caption" data-testid="text-challenge-title">{data.challenge.title}</p></div>
              <span className="refresh-label"><Radio size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} /> ACTUALISÉ EN DIRECT</span>
            </div>
            {leaderboard.length ? <div className="ranking-list" data-testid="leaderboard-list">
              {leaderboard.map((team, index) => <div className="ranking-row" key={team.id} data-testid={`row-team-${team.id}`}>
                <div className="rank-number">{index === 0 ? <Crown size={14} /> : String(index + 1).padStart(2, '0')}</div>
                <div style={{ minWidth: 0 }}><div className="team-name">{team.name}</div><div className="team-sub">{team.activeMembers} en vocal · {team.memberCount} membres</div></div>
                <div className="bar-track" aria-label={`${team.voiceHours.toFixed(1)} heures vocales`}><div className="bar-fill" style={{ width: `${Math.min(100, team.voiceHours / maxHours * 100)}%` }} /></div>
                <div className="hours">{team.voiceHours.toFixed(1)} <small>h</small></div>
              </div>)}
            </div> : <div className="empty-state" style={{ margin: '0 14px 14px' }} data-testid="empty-leaderboard"><div className="empty-symbol"><Users size={18} /></div><strong>Les équipes se préparent</strong><p>Le classement apparaîtra dès que des membres rejoindront la course.</p></div>}
          </section>
          <aside>
            <div className="reward-card">
              <div className="reward-kicker">À la clé cette semaine</div>
              <h2 className="reward-title" data-testid="text-reward">{data.challenge.reward}</h2>
              <p className="reward-copy">La première équipe au cumul d’heures vocales prend la tête. Un ticket de tirage pour chaque membre éligible.</p>
              <div className="reward-icon"><Trophy size={19} /></div>
            </div>
            <div className="panel bot-card">
              <div className="bot-status"><strong>Suivi vocal Discord</strong><span className={`status-indicator ${data.botConnected ? '' : 'offline'}`}><span className="live-dot" style={{ background: data.botConnected ? '#48a983' : '#c67c61', boxShadow: 'none' }} />{data.botConnected ? 'BOT CONNECTÉ' : 'BOT HORS LIGNE'}</span></div>
              <p className="bot-copy">Le bot comptabilise le temps passé dans les salons vocaux publics. Aucun audio n’est enregistré.</p>
            </div>
          </aside>
        </div>}
        {!data?.challenge && <div className="panel empty-state" style={{ padding: 45 }} data-testid="empty-challenge"><div className="empty-symbol"><Trophy size={19} /></div><strong>La prochaine course se prépare</strong><p>Reviens bientôt : le prochain défi hebdomadaire sera annoncé ici.</p></div>}
        {data?.challenge && <ChallengeResult challenge={data.challenge} />}
        <div className="rules-strip">
          <div className="rule-item"><span className="rule-num">01</span><div><strong>Faites vivre le vocal</strong><span>Le total de l’équipe grimpe avec les heures en salon public.</span></div></div>
          <div className="rule-item"><span className="rule-num">02</span><div><strong>10 h pour le tirage</strong><span>À la clôture, seuls les membres à 10 h ou plus sont éligibles.</span></div></div>
          <div className="rule-item"><span className="rule-num">03</span><div><strong>Le capitaine double</strong><span>Le capitaine éligible compte deux tickets au tirage final.</span></div></div>
        </div>
      </>
    )}
  </>;
}

function TeamPage() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const teamQuery = useGetMyTeam({
    query: {
      queryKey: getGetMyTeamQueryKey(),
      enabled: !!auth.user,
    },
  });
  const join = useJoinTeam();
  const remove = useRemoveMyTeamMember();
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDreamTeamDashboardQueryKey() });
  };
  const submitJoin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    join.mutate({ data: { code: code.trim() } }, { onSuccess: () => { setFeedback({ text: 'Tu as rejoint ton équipe. Bienvenue dans la course.', kind: 'success' }); setCode(''); refresh(); }, onError: () => setFeedback({ text: 'Code invalide ou impossible à rejoindre. Vérifie auprès du capitaine.', kind: 'error' }) });
  };
  const removeMember = (member: Member) => {
    if (!window.confirm(`Retirer ${member.username} de ton équipe ?`)) return;
    remove.mutate({ discordId: member.discordId }, { onSuccess: () => { setFeedback({ text: `${member.username} a quitté l’équipe.`, kind: 'success' }); refresh(); }, onError: () => setFeedback({ text: 'Impossible de retirer ce membre.', kind: 'error' }) });
  };
  const team = teamQuery.data?.team;
  const captain = !!team && (auth.user?.discordId === team.captainDiscordId || auth.user?.id === team.captainDiscordId);
  const members = teamQuery.data?.members ?? [];
  return <>
    <div className="page-heading"><div><div className="eyebrow">Le collectif avant tout</div><h1>Mon équipe<span style={{ color: '#ec4899' }}>.</span></h1><p>Rejoins une équipe grâce à son code capitaine ou veille sur ton roster. Un membre ne peut représenter qu’une équipe à la fois.</p></div></div>
    {auth.loading ? <div className="skeleton" style={{ height: 80, marginBottom: 18 }} /> : auth.user ? (
      <div className="member-banner" data-testid="status-signed-in"><div><div className="eyebrow" style={{ color: '#f28da2' }}>Discord connecté</div><h2>Salut {auth.user.global_name || auth.user.displayName || auth.user.username || 'membre'}.</h2><p>Ton compte Discord est lié à DreamTeam Misaki.</p></div><div className="team-stat"><b><Check size={23} style={{ color: '#84d0a7' }} /></b><span>Compte vérifié</span></div></div>
    ) : <div className="member-banner" data-testid="status-signed-out"><div><div className="eyebrow" style={{ color: '#f28da2' }}>Une place t’attend</div><h2>Connecte ton Discord.</h2><p>La connexion est nécessaire pour rejoindre une équipe et apparaître dans le classement.</p></div><a className="btn btn-primary" href="/api/auth/discord/login" data-testid="button-discord-login"><LogIn size={15} /> Se connecter</a></div>}
    {auth.loading || (auth.user && teamQuery.isLoading) ? <div className="panel section-card"><LoadingRows amount={3} /></div> : auth.user && teamQuery.isError ? <ErrorBox onRetry={() => void teamQuery.refetch()} /> : team ? (
      <>
        <section className="panel section-card">
          <div className="section-title-row"><div><div className="eyebrow">Ton équipe</div><h2 style={{ marginTop: 6 }}>{team.name}</h2></div><span className="role-badge">{captain ? 'CAPITAINE' : 'MEMBRE'}</span></div>
          {!captain && <p className="hint">Le capitaine de ton équipe : {members.find((m) => m.discordId === team.captainDiscordId)?.username || 'capitaine'}.</p>}
          {captain && <div className="notice"><Shield size={15} /><span>Code d’invitation du capitaine : <strong style={{ fontFamily: 'var(--app-font-mono)' }} data-testid="text-join-code">{team.joinCode ?? ''}</strong> — partage-le avec les membres qui souhaitent te rejoindre.</span></div>}
          {feedback && <div className={`${feedback.kind}-note`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</div>}
        </section>
        <section className="panel section-card">
          <div className="section-title-row"><div><div className="eyebrow">Le roster</div><h2 style={{ marginTop: 6 }}>Dans le même salon</h2></div><span className="role-badge">{members.length} membres</span></div>
          {members.length ? <div className="roster">{members.map((member) => <div className="roster-member" key={member.discordId} data-testid={`member-${member.discordId}`}>
            <Avatar member={member} /><div style={{ minWidth: 0 }}><div className="member-name">{member.username}</div><div className="member-detail">{member.voiceHours.toFixed(1)} h vocales {member.isInVoice ? '· en vocal' : ''}</div></div><div className="member-spacer" />
            {member.discordId === team.captainDiscordId ? <span className="captain-tag">CAPITAINE</span> : captain && <button className="btn btn-danger btn-small" onClick={() => removeMember(member)} disabled={remove.isPending} aria-label={`Retirer ${member.username}`} data-testid={`button-remove-${member.discordId}`}><X size={13} /> Retirer</button>}
          </div>)}</div> : <div className="empty-state"><div className="empty-symbol"><Users size={17} /></div><strong>Le roster est vide</strong><p>Partage ton code d’équipe pour réunir ton escouade.</p></div>}
        </section>
      </>
    ) : (
      <section className="panel section-card">
        <div className="section-title-row"><div><div className="eyebrow">Trouve ta team</div><h2 style={{ marginTop: 6 }}>Rejoins par code capitaine</h2></div><Users size={20} color="#ec4899" /></div>
        <p className="hint" style={{ margin: '-8px 0 18px' }}>Un seul code suffit. Tu ne peux être inscrit que dans une équipe à la fois.</p>
        {auth.user ? <form className="form-row" onSubmit={submitJoin}><input className="text-input" aria-label="Code d’invitation" data-testid="input-join-code" placeholder="Ex. MISAKI-24" minLength={4} maxLength={32} required value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn btn-primary" disabled={join.isPending || code.trim().length < 4} data-testid="button-join-team">{join.isPending ? <LoaderCircle size={15} /> : <ChevronRight size={15} />} Rejoindre</button></form> : <a className="btn btn-primary" href="/api/auth/discord/login" data-testid="button-team-login"><LogIn size={15} /> Se connecter avec Discord</a>}
        {feedback && <div className={`${feedback.kind}-note`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</div>}
        <div className="notice"><Headphones size={15} /><span>Ta présence vocale est suivie par le bot Discord, mais aucune conversation n’est enregistrée.</span></div>
      </section>
    )}
  </>;
}

function AdminPage() {
  const client = useQueryClient();
  const auth = useAuth();
  const isAdminPlus = auth.user?.role === 'ADMIN_PLUS';
  const isStaff = isAdminPlus || auth.user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState('');
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeReward, setChallengeReward] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const memberParams = useMemo(() => ({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(memberRoleFilter ? { role: memberRoleFilter as SiteRole } : {}),
  }), [debouncedSearch, memberRoleFilter]);
  const membersQuery = useListAdminMembers(memberParams, { query: { queryKey: getListAdminMembersQueryKey(memberParams), enabled: isStaff } });
  const teamsQuery = useListAdminTeams({ query: { queryKey: getListAdminTeamsQueryKey(), enabled: isStaff } });
  const challengesQuery = useListAdminChallenges({ query: { queryKey: getListAdminChallengesQueryKey(), enabled: isStaff } });
  const setRole = useUpdateMemberRole();
  const renameTeam = useUpdateAdminTeam();
  const archiveTeam = useArchiveAdminTeam();
  const addMember = useAddAdminTeamMember();
  const removeMember = useRemoveAdminTeamMember();
  const createChallenge = useCreateAdminChallenge();
  const refreshMembers = () => void client.invalidateQueries({ queryKey: getListAdminMembersQueryKey() });
  const refreshTeams = () => {
    void client.invalidateQueries({ queryKey: getListAdminTeamsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDreamTeamDashboardQueryKey() });
    void client.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
  };
  const refreshChallenges = () => {
    void client.invalidateQueries({ queryKey: getListAdminChallengesQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDreamTeamDashboardQueryKey() });
  };
  const setMemberRole = (member: Member, role: SiteRole) => setRole.mutate({ discordId: member.discordId, data: { role } }, { onSuccess: () => { setFeedback({ text: `Rôle de ${member.username} mis à jour.`, kind: 'success' }); refreshMembers(); refreshTeams(); }, onError: () => setFeedback({ text: 'Impossible de modifier ce rôle.', kind: 'error' }) });
  const saveTeam = (teamId: string, name: string, joinCode?: string) => renameTeam.mutate({ teamId, data: joinCode ? { name: name.trim(), joinCode: joinCode.trim() } : { name: name.trim() } }, { onSuccess: () => { setFeedback({ text: joinCode ? 'Code d’équipe mis à jour.' : 'Équipe renommée.', kind: 'success' }); refreshTeams(); }, onError: () => setFeedback({ text: 'Impossible de modifier cette équipe. Le code est peut-être déjà utilisé.', kind: 'error' }) });
  const archive = (team: TeamProgress) => {
    if (!window.confirm(`Archiver l’équipe « ${team.name} » ? Son historique sera conservé.`)) return;
    archiveTeam.mutate({ teamId: team.id }, { onSuccess: () => { setFeedback({ text: `${team.name} a été archivée.`, kind: 'success' }); refreshTeams(); }, onError: () => setFeedback({ text: 'Impossible d’archiver cette équipe.', kind: 'error' }) });
  };
  const addToTeam = (event: React.FormEvent<HTMLFormElement>, teamId: string, input: HTMLInputElement) => {
    event.preventDefault();
    const discordId = input.value.trim();
    if (!/^[0-9]{17,20}$/.test(discordId)) {
      setFeedback({ text: 'Saisis un identifiant Discord de 17 à 20 chiffres.', kind: 'error' });
      return;
    }
    addMember.mutate({ teamId, data: { discordId } }, { onSuccess: () => { input.value = ''; setFeedback({ text: 'Membre ajouté à l’équipe.', kind: 'success' }); refreshTeams(); refreshMembers(); }, onError: () => setFeedback({ text: 'Membre introuvable ou déjà dans une équipe.', kind: 'error' }) });
  };
  const removeFromTeam = (team: TeamProgress, discordId: string) => {
    if (!window.confirm('Retirer ce membre de son équipe ?')) return;
    removeMember.mutate({ teamId: team.id, discordId }, { onSuccess: () => { setFeedback({ text: 'Membre retiré de l’équipe.', kind: 'success' }); refreshTeams(); refreshMembers(); }, onError: () => setFeedback({ text: 'Impossible de retirer ce membre.', kind: 'error' }) });
  };
  const submitChallenge = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createChallenge.mutate({ data: { title: challengeTitle.trim(), reward: challengeReward.trim() } }, {
      onSuccess: () => { setFeedback({ text: 'Le prochain défi de sept jours est lancé.', kind: 'success' }); setChallengeTitle(''); setChallengeReward(''); refreshChallenges(); },
      onError: () => setFeedback({ text: 'Impossible de créer le défi. Vérifie qu’aucun défi actif ne bloque la création.', kind: 'error' }),
    });
  };
  const members = membersQuery.data?.items ?? [];
  const teams = teamsQuery.data ?? [];
  const challenges = challengesQuery.data ?? [];
  return <>
    <div className="page-heading"><div><div className="eyebrow">Les coulisses de la compétition</div><h1>Gestion<span style={{ color: '#ec4899' }}>.</span></h1><p>Les membres, les équipes et les prochaines semaines de course — tout au même endroit pour l’équipe Misaki.</p></div><span className="role-badge ADMIN_PLUS"><Shield size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> {isAdminPlus ? 'ADMIN+' : 'ADMIN'}</span></div>
    {auth.loading ? <div className="panel section-card"><LoadingRows amount={3} /></div> : !auth.user ? (
      <div className="member-banner"><div><div className="eyebrow" style={{ color: '#f28da2' }}>Accès réservé</div><h2>Connecte ton Discord.</h2><p>Le panneau de gestion est réservé aux Admin et Admin+.</p></div><a className="btn btn-primary" href="/api/auth/discord/login"><LogIn size={15} /> Se connecter</a></div>
    ) : !isStaff ? (
      <div className="panel section-card" role="status"><div className="empty-symbol"><Shield size={17} /></div><strong>Tu n’as pas accès à la gestion.</strong><p className="hint">Cet espace est réservé aux rôles Admin et Admin+.</p></div>
    ) : <>
    {feedback && <div className={`${feedback.kind}-note`} role={feedback.kind === 'error' ? 'alert' : 'status'} data-testid="admin-feedback">{feedback.text}</div>}
    <div className="admin-grid">
      <section className="panel section-card">
        <div className="section-title-row"><div><div className="eyebrow">Comptes Discord liés</div><h2 style={{ marginTop: 6 }}>Membres inscrits</h2></div><span className="role-badge">{membersQuery.data?.total ?? '—'} total</span></div>
        <div className="toolbar" style={{ marginBottom: 15 }}>
          <div className="search-field"><Search size={15} /><input className="text-input" type="search" placeholder="Chercher un membre…" aria-label="Rechercher un membre" data-testid="input-member-search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className="select-input" style={{ width: 145 }} aria-label="Filtrer par rôle" data-testid="select-role-filter" value={memberRoleFilter} onChange={(e) => setMemberRoleFilter(e.target.value)}><option value="">Tous les rôles</option><option value="MEMBER">Membre</option><option value="CAPTAIN">Capitaine</option><option value="ADMIN">Admin</option><option value="ADMIN_PLUS">Admin+</option></select>
        </div>
        {membersQuery.isLoading ? <LoadingRows amount={4} /> : membersQuery.isError ? <ErrorBox onRetry={() => void membersQuery.refetch()} /> : members.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Membre</th><th>Équipe</th><th>Rôle</th></tr></thead><tbody>
          {members.map((member) => <tr key={member.discordId} data-testid={`row-member-${member.discordId}`}><td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar member={member} /><div><strong>{member.username}</strong><div className="member-detail">{member.voiceHours.toFixed(1)} h vocales</div></div></div></td><td>{member.teamName || <span className="member-detail">Sans équipe</span>}</td><td>{isAdminPlus ? <select className="role-select" aria-label={`Rôle de ${member.username}`} data-testid={`select-role-${member.discordId}`} value={member.role} disabled={setRole.isPending} onChange={(e) => setMemberRole(member, e.target.value as SiteRole)}><option value="MEMBER">Membre</option><option value="CAPTAIN">Capitaine</option><option value="ADMIN">Admin</option><option value="ADMIN_PLUS">Admin+</option></select> : <span className={`role-badge ${member.role}`} data-testid={`text-role-${member.discordId}`}>{roleLabels[member.role] ?? member.role}</span>}</td></tr>)}
        </tbody></table></div> : <div className="empty-state" data-testid="empty-members"><div className="empty-symbol"><Search size={17} /></div><strong>Aucun membre trouvé</strong><p>Essaie un autre nom ou change le filtre.</p></div>}
      </section>
      <section className="panel section-card">
        <div className="section-title-row"><div><div className="eyebrow">Les escouades du moment</div><h2 style={{ marginTop: 6 }}>Équipes actives</h2></div><span className="role-badge">{teams.length} équipes</span></div>
        {teamsQuery.isLoading ? <LoadingRows amount={3} /> : teamsQuery.isError ? <ErrorBox onRetry={() => void teamsQuery.refetch()} /> : teams.length ? teams.map((team) => <TeamAdminRow key={team.id} team={team} onSave={saveTeam} onArchive={archive} onAdd={addToTeam} onRemove={removeFromTeam} />) : <div className="empty-state"><div className="empty-symbol"><Users size={17} /></div><strong>Pas encore d’équipe</strong><p>Les équipes apparaîtront ici après leur création par les capitaines.</p></div>}
      </section>
      <section className="panel section-card" style={{ gridColumn: '1 / -1' }}>
        <div className="section-title-row"><div><div className="eyebrow">La suite de la saison</div><h2 style={{ marginTop: 6 }}>Défis hebdomadaires</h2></div><span className="role-badge">{challenges.length} semaines</span></div>
        {isAdminPlus ? <form className="create-form" onSubmit={submitChallenge}>
          <input className="text-input" aria-label="Titre du défi" data-testid="input-challenge-title" placeholder="Titre du prochain défi" minLength={3} maxLength={80} required value={challengeTitle} onChange={(e) => setChallengeTitle(e.target.value)} />
          <input className="text-input" aria-label="Récompense du défi" data-testid="input-challenge-reward" placeholder="Récompense à gagner" minLength={2} maxLength={120} required value={challengeReward} onChange={(e) => setChallengeReward(e.target.value)} />
          <button className="btn btn-primary" disabled={createChallenge.isPending || challengeTitle.trim().length < 3 || challengeReward.trim().length < 2} data-testid="button-create-challenge">{createChallenge.isPending ? <LoaderCircle size={15} /> : <Sparkles size={15} />} Lancer 7 jours</button>
        </form> : null}
        <div className="notice"><Clock3 size={15} /><span>Chaque défi dure sept jours. Les résultats précédents restent visibles après le lancement du suivant.{isAdminPlus ? '' : ' La création d’un défi est réservée aux Admin+.'}</span></div>
        {challengesQuery.isLoading ? <div style={{ marginTop: 16 }}><LoadingRows amount={2} /></div> : challengesQuery.isError ? <div style={{ marginTop: 16 }}><ErrorBox onRetry={() => void challengesQuery.refetch()} /></div> : challenges.length ? <div style={{ marginTop: 16 }} data-testid="challenge-history">{challenges.map((challenge) => <div className="challenge-item" key={challenge.id} data-testid={`challenge-${challenge.id}`}><div><h3>{challenge.title}</h3><p>Récompense : {challenge.reward} · {formatDate(challenge.startsAt)} — {formatDate(challenge.endsAt)}{challenge.winningTeamName ? ` · Vainqueur : ${challenge.winningTeamName}` : ''}{challenge.winnerUsername ? ` · Tirage : ${challenge.winnerUsername}` : ''}</p></div><span className={`challenge-status ${challenge.status === 'COMPLETED' ? 'completed' : ''}`}>{challenge.status === 'ACTIVE' ? 'EN COURS' : challenge.drawStatus === 'DRAWN' ? 'TERMINÉ · TIRÉ' : challenge.drawStatus === 'NO_ELIGIBLE_MEMBERS' ? 'TERMINÉ · SANS ÉLIGIBLE' : 'TERMINÉ · EN ATTENTE'}</span></div>)}</div> : <div className="empty-state" style={{ marginTop: 16 }} data-testid="empty-challenges"><div className="empty-symbol"><Award size={17} /></div><strong>Aucun défi pour l’instant</strong><p>Le premier défi sera créé par un Admin+.</p></div>}
      </section>
    </div>
    </>}
  </>;
}

function TeamAdminRow({ team, onSave, onArchive, onAdd, onRemove }: {
  team: TeamProgress;
  onSave: (id: string, name: string, joinCode?: string) => void;
  onArchive: (team: TeamProgress) => void;
  onAdd: (event: React.FormEvent<HTMLFormElement>, teamId: string, input: HTMLInputElement) => void;
  onRemove: (team: TeamProgress, discordId: string) => void;
}) {
  const [name, setName] = useState(team.name);
  const [joinCode, setJoinCode] = useState('');
  useEffect(() => { setName(team.name); }, [team.name]);
  return <div className="team-admin-row" data-testid={`admin-team-${team.id}`}>
    <div className="team-admin-top"><div style={{ minWidth: 0 }}><strong>{team.name}</strong><div className="team-admin-meta">Capitaine : {team.captainName} · {team.memberCount} membres · {team.voiceHours.toFixed(1)} h · {team.activeMembers} actifs</div>{team.joinCode && <div className="team-admin-meta">Code actuel : <strong style={{ fontFamily: 'var(--app-font-mono)' }} data-testid={`text-admin-join-code-${team.id}`}>{team.joinCode}</strong></div>}</div>
      <div className="team-admin-actions"><button className="btn btn-danger btn-small" onClick={() => onArchive(team)} data-testid={`button-archive-team-${team.id}`}>Archiver</button></div>
    </div>
    <form className="admin-team-form" onSubmit={(event) => { event.preventDefault(); if (name.trim().length >= 2 && name.trim() !== team.name) onSave(team.id, name); }}>
      <input className="text-input" aria-label={`Nom de ${team.name}`} data-testid={`input-team-name-${team.id}`} minLength={2} maxLength={32} required value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn-quiet btn-small" disabled={name.trim().length < 2 || name.trim() === team.name} data-testid={`button-rename-admin-team-${team.id}`}>Renommer</button>
    </form>
    <form className="admin-team-form" onSubmit={(event) => { event.preventDefault(); if (joinCode.trim().length >= 4) { onSave(team.id, team.name, joinCode); setJoinCode(''); } }}>
      <input className="text-input" aria-label={`Nouveau code de ${team.name}`} data-testid={`input-join-code-${team.id}`} placeholder="Nouveau code d’équipe" minLength={4} maxLength={32} value={joinCode} pattern="[A-Za-z0-9-]{4,32}" onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
      <button className="btn btn-quiet btn-small" disabled={joinCode.trim().length < 4} data-testid={`button-save-join-code-${team.id}`}>Changer le code</button>
    </form>
    <form className="admin-team-form" onSubmit={(event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.namedItem('discordId') as HTMLInputElement | null;
      if (input) onAdd(event, team.id, input);
    }}>
      <input className="text-input" name="discordId" aria-label={`Identifiant Discord à ajouter à ${team.name}`} data-testid={`input-add-member-${team.id}`} placeholder="ID Discord du membre à ajouter" pattern="[0-9]{17,20}" />
      <button className="btn btn-quiet btn-small" data-testid={`button-add-member-${team.id}`}><Users size={13} /> Ajouter</button>
    </form>
    <form className="admin-team-form" onSubmit={(event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.namedItem('memberId') as HTMLInputElement | null;
      if (input?.value.trim()) onRemove(team, input.value.trim());
    }}>
      <input className="text-input" name="memberId" aria-label={`Identifiant Discord à retirer de ${team.name}`} placeholder="ID Discord du membre à retirer" />
      <button className="btn btn-danger btn-small" data-testid={`button-remove-team-member-${team.id}`}><X size={13} /> Retirer</button>
    </form>
  </div>;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(date));
}

function NotFound() {
  return <div className="panel empty-state"><div className="empty-symbol"><X size={18} /></div><strong>Cette page n’existe pas</strong><p>Retourne à la course pour retrouver le classement.</p><Link href="/" className="btn btn-dark" style={{ marginTop: 16 }}>Voir la course</Link></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><AuthProvider><Shell><Switch><Route path="/" component={HomePage} /><Route path="/team" component={TeamPage} /><Route path="/admin" component={AdminPage} /><Route path="/captain" component={CaptainPage} /><Route component={NotFound} /></Switch></Shell></AuthProvider></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
