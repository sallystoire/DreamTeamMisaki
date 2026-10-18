import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useAddAdminTeamMember,
  useArchiveAdminTeam,
  useCreateAdminChallenge,
  useGetDreamTeamDashboard,
  useGetMyTeam,
  useJoinTeam,
  useListAdminChallenges,
  useListAdminMembers,
  useListAdminTeams,
  useRemoveAdminTeamMember,
  useRemoveMyTeamMember,
  useRenameMyTeam,
  useUpdateAdminTeam,
  useUpdateMemberRole,
  getGetDreamTeamDashboardQueryKey,
  getGetMyTeamQueryKey,
  getListAdminChallengesQueryKey,
  getListAdminMembersQueryKey,
  getListAdminTeamsQueryKey,
} from '@workspace/api-client-react';
import type { Challenge, Member, SiteRole, TeamProgress } from '@workspace/api-client-react';
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

function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const auth = useCurrentUser();
  const botStatus = useGetDreamTeamDashboard({
    query: { queryKey: getGetDreamTeamDashboardQueryKey(), refetchInterval: 20000 },
  });
  const displayName = auth.user?.global_name || auth.user?.displayName || auth.user?.username;
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/" className="brand" data-testid="link-home">
          <span className="brand-mark">M</span><span>DREAMTEAM <em>MISAKI</em></span>
        </Link>
        <nav className="nav-links" aria-label="Navigation principale">
          <Link href="/" className={`nav-link ${path === '/' ? 'active' : ''}`} data-testid="link-race">La course</Link>
          <Link href="/team" className={`nav-link ${path === '/team' ? 'active' : ''}`} data-testid="link-team">Mon équipe</Link>
          <Link href="/admin" className={`nav-link ${path === '/admin' ? 'active' : ''}`} data-testid="link-admin">Gestion</Link>
        </nav>
        <div className="header-right">
          <div className="live-chip" data-testid="status-voice-bot">
            <span className={`live-dot ${botStatus.data?.botConnected ? '' : 'offline'}`} />
            {botStatus.isLoading ? 'Vérification du bot' : botStatus.isError ? 'Statut indisponible' : botStatus.data?.botConnected ? 'Suivi vocal connecté' : 'Bot vocal hors ligne'}
          </div>
          {auth.loading ? <span className="user-pill">Connexion…</span> : displayName ? (
            <a className="user-pill" href="/api/auth/logout" data-testid="link-logout" title="Se déconnecter">
              {displayName} <LogOut size={13} aria-hidden="true" />
            </a>
          ) : (
            <a className="user-pill" href="/api/auth/discord/login" data-testid="link-login">
              Discord <LogIn size={13} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>
      <main className="main-content page-enter">{children}</main>
      <nav className="mobile-menu" aria-label="Navigation mobile">
        <Link href="/" className={`nav-link ${path === '/' ? 'active' : ''}`}>La course</Link>
        <Link href="/team" className={`nav-link ${path === '/team' ? 'active' : ''}`}>Mon équipe</Link>
        <Link href="/admin" className={`nav-link ${path === '/admin' ? 'active' : ''}`}>Gestion</Link>
      </nav>
      <div className="sr-only" aria-live="polite">{auth.failed ? 'Impossible de vérifier la connexion Discord.' : ''}</div>
    </div>
  );
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
    <div className="footer-note"><span>MISAKI COMMUNITY · DÉFI HEBDOMADAIRE</span><span>Un serveur. Des équipes. Beaucoup de vocal.</span></div>
  </>;
}

function TeamPage() {
  const queryClient = useQueryClient();
  const auth = useCurrentUser();
  const teamQuery = useGetMyTeam({
    query: {
      queryKey: getGetMyTeamQueryKey(),
      enabled: !!auth.user,
    },
  });
  const join = useJoinTeam();
  const rename = useRenameMyTeam();
  const remove = useRemoveMyTeamMember();
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  useEffect(() => { if (teamQuery.data?.team) setTeamName(teamQuery.data.team.name); }, [teamQuery.data?.team?.id, teamQuery.data?.team?.name]);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDreamTeamDashboardQueryKey() });
  };
  const submitJoin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    join.mutate({ data: { code: code.trim() } }, { onSuccess: () => { setFeedback({ text: 'Tu as rejoint ton équipe. Bienvenue dans la course.', kind: 'success' }); setCode(''); refresh(); }, onError: () => setFeedback({ text: 'Code invalide ou impossible à rejoindre. Vérifie auprès du capitaine.', kind: 'error' }) });
  };
  const submitRename = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    rename.mutate({ data: { name: teamName.trim() } }, { onSuccess: () => { setFeedback({ text: 'Nom d’équipe mis à jour.', kind: 'success' }); refresh(); }, onError: () => setFeedback({ text: 'Le nom n’a pas pu être modifié.', kind: 'error' }) });
  };
  const removeMember = (member: Member) => {
    if (!window.confirm(`Retirer ${member.username} de ton équipe ?`)) return;
    remove.mutate({ discordId: member.discordId }, { onSuccess: () => { setFeedback({ text: `${member.username} a quitté l’équipe.`, kind: 'success' }); refresh(); }, onError: () => setFeedback({ text: 'Impossible de retirer ce membre.', kind: 'error' }) });
  };
  const team = teamQuery.data?.team;
  const captain = !!team && (auth.user?.discordId === team.captainDiscordId || auth.user?.id === team.captainDiscordId);
  const members = teamQuery.data?.members ?? [];
  return <>
    <div className="page-heading"><div><div className="eyebrow">Le collectif avant tout</div><h1>Mon équipe<span style={{ color: '#d83259' }}>.</span></h1><p>Rejoins une équipe grâce à son code capitaine ou veille sur ton roster. Un membre ne peut représenter qu’une équipe à la fois.</p></div></div>
    {auth.loading ? <div className="skeleton" style={{ height: 80, marginBottom: 18 }} /> : auth.user ? (
      <div className="member-banner" data-testid="status-signed-in"><div><div className="eyebrow" style={{ color: '#f28da2' }}>Discord connecté</div><h2>Salut {auth.user.global_name || auth.user.displayName || auth.user.username || 'membre'}.</h2><p>Ton compte Discord est lié à DreamTeam Misaki.</p></div><div className="team-stat"><b><Check size={23} style={{ color: '#84d0a7' }} /></b><span>Compte vérifié</span></div></div>
    ) : <div className="member-banner" data-testid="status-signed-out"><div><div className="eyebrow" style={{ color: '#f28da2' }}>Une place t’attend</div><h2>Connecte ton Discord.</h2><p>La connexion est nécessaire pour rejoindre une équipe et apparaître dans le classement.</p></div><a className="btn btn-primary" href="/api/auth/discord/login" data-testid="button-discord-login"><LogIn size={15} /> Se connecter</a></div>}
    {auth.loading || (auth.user && teamQuery.isLoading) ? <div className="panel section-card"><LoadingRows amount={3} /></div> : auth.user && teamQuery.isError ? <ErrorBox onRetry={() => void teamQuery.refetch()} /> : team ? (
      <>
        <section className="panel section-card">
          <div className="section-title-row"><div><div className="eyebrow">Ton équipe</div><h2 style={{ marginTop: 6 }}>{team.name}</h2></div><span className="role-badge">{captain ? 'CAPITAINE' : 'MEMBRE'}</span></div>
          {captain ? <form className="form-row" onSubmit={submitRename}><input className="text-input" aria-label="Nouveau nom d’équipe" data-testid="input-team-name" minLength={2} maxLength={32} required value={teamName} onChange={(e) => setTeamName(e.target.value)} /><button className="btn btn-dark" disabled={rename.isPending || teamName.trim().length < 2} data-testid="button-rename-team">{rename.isPending ? <LoaderCircle size={15} className="spin" /> : null} Renommer</button></form> : <p className="hint">Le capitaine de ton équipe : {members.find((m) => m.discordId === team.captainDiscordId)?.username || 'capitaine'}.</p>}
          {captain && <div className="notice"><Shield size={15} /><span>Code d’invitation du capitaine : <strong style={{ fontFamily: 'var(--app-font-mono)' }} data-testid="text-join-code">{team.joinCode}</strong> — partage-le avec les membres qui souhaitent te rejoindre.</span></div>}
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
        <div className="section-title-row"><div><div className="eyebrow">Trouve ta team</div><h2 style={{ marginTop: 6 }}>Rejoins par code capitaine</h2></div><Users size={20} color="#d83259" /></div>
        <p className="hint" style={{ margin: '-8px 0 18px' }}>Un seul code suffit. Tu ne peux être inscrit que dans une équipe à la fois.</p>
        {auth.user ? <form className="form-row" onSubmit={submitJoin}><input className="text-input" aria-label="Code d’invitation" data-testid="input-join-code" placeholder="Ex. MISAKI-24" minLength={4} maxLength={32} required value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn btn-primary" disabled={join.isPending || code.trim().length < 4} data-testid="button-join-team">{join.isPending ? <LoaderCircle size={15} /> : <ChevronRight size={15} />} Rejoindre</button></form> : <a className="btn btn-primary" href="/api/auth/discord/login" data-testid="button-team-login"><LogIn size={15} /> Se connecter avec Discord</a>}
        {feedback && <div className={`${feedback.kind}-note`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</div>}
        <div className="notice"><Headphones size={15} /><span>Ta présence vocale est suivie par le bot Discord, mais aucune conversation n’est enregistrée.</span></div>
      </section>
    )}
    <div className="footer-note"><span>UNE ÉQUIPE À LA FOIS · UNE COURSE CHAQUE SEMAINE</span><span>Le meilleur vocal, c’est le vocal partagé.</span></div>
  </>;
}

function AdminPage() {
  const client = useQueryClient();
  const auth = useCurrentUser();
  const isAdminPlus = auth.user?.role === 'ADMIN_PLUS';
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
  const membersQuery = useListAdminMembers(memberParams, { query: { queryKey: getListAdminMembersQueryKey(memberParams), enabled: isAdminPlus } });
  const teamsQuery = useListAdminTeams({ query: { queryKey: getListAdminTeamsQueryKey(), enabled: isAdminPlus } });
  const challengesQuery = useListAdminChallenges({ query: { queryKey: getListAdminChallengesQueryKey(), enabled: isAdminPlus } });
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
  const saveTeamName = (teamId: string, name: string) => renameTeam.mutate({ teamId, data: { name: name.trim() } }, { onSuccess: () => { setFeedback({ text: 'Équipe renommée.', kind: 'success' }); refreshTeams(); }, onError: () => setFeedback({ text: 'Impossible de renommer cette équipe.', kind: 'error' }) });
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
    <div className="page-heading"><div><div className="eyebrow">Les coulisses de la compétition</div><h1>Gestion<span style={{ color: '#d83259' }}>.</span></h1><p>Les membres, les équipes et les prochaines semaines de course — tout au même endroit pour l’équipe Misaki.</p></div><span className="role-badge ADMIN_PLUS"><Shield size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> {isAdminPlus ? 'ADMIN+' : 'ESPACE SÉCURISÉ'}</span></div>
    {auth.loading ? <div className="panel section-card"><LoadingRows amount={3} /></div> : !auth.user ? (
      <div className="member-banner"><div><div className="eyebrow" style={{ color: '#f28da2' }}>Accès réservé</div><h2>Connecte ton Discord.</h2><p>Le panneau de gestion est réservé aux Admin+.</p></div><a className="btn btn-primary" href="/api/auth/discord/login"><LogIn size={15} /> Se connecter</a></div>
    ) : !isAdminPlus ? (
      <div className="panel section-card" role="status"><div className="empty-symbol"><Shield size={17} /></div><strong>Tu n’as pas accès à la gestion.</strong><p className="hint">Un Admin+ peut attribuer ce rôle depuis le panneau de gestion.</p></div>
    ) : <>
    {feedback && <div className={`${feedback.kind}-note`} role={feedback.kind === 'error' ? 'alert' : 'status'} data-testid="admin-feedback">{feedback.text}</div>}
    <div className="admin-grid">
      <section className="panel section-card">
        <div className="section-title-row"><div><div className="eyebrow">Comptes Discord liés</div><h2 style={{ marginTop: 6 }}>Membres inscrits</h2></div><span className="role-badge">{membersQuery.data?.total ?? '—'} total</span></div>
        <div className="toolbar" style={{ marginBottom: 15 }}>
          <div className="search-field"><Search size={15} /><input className="text-input" type="search" placeholder="Chercher un membre…" aria-label="Rechercher un membre" data-testid="input-member-search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className="select-input" style={{ width: 145 }} aria-label="Filtrer par rôle" data-testid="select-role-filter" value={memberRoleFilter} onChange={(e) => setMemberRoleFilter(e.target.value)}><option value="">Tous les rôles</option><option value="MEMBER">Membre</option><option value="CAPTAIN">Capitaine</option><option value="ADMIN_PLUS">Admin+</option></select>
        </div>
        {membersQuery.isLoading ? <LoadingRows amount={4} /> : membersQuery.isError ? <ErrorBox onRetry={() => void membersQuery.refetch()} /> : members.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Membre</th><th>Équipe</th><th>Rôle</th></tr></thead><tbody>
          {members.map((member) => <tr key={member.discordId} data-testid={`row-member-${member.discordId}`}><td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar member={member} /><div><strong>{member.username}</strong><div className="member-detail">{member.voiceHours.toFixed(1)} h vocales</div></div></div></td><td>{member.teamName || <span className="member-detail">Sans équipe</span>}</td><td><select className="role-select" aria-label={`Rôle de ${member.username}`} data-testid={`select-role-${member.discordId}`} value={member.role} disabled={setRole.isPending} onChange={(e) => setMemberRole(member, e.target.value as SiteRole)}><option value="MEMBER">Membre</option><option value="CAPTAIN">Capitaine</option><option value="ADMIN_PLUS">Admin+</option></select></td></tr>)}
        </tbody></table></div> : <div className="empty-state" data-testid="empty-members"><div className="empty-symbol"><Search size={17} /></div><strong>Aucun membre trouvé</strong><p>Essaie un autre nom ou change le filtre.</p></div>}
      </section>
      <section className="panel section-card">
        <div className="section-title-row"><div><div className="eyebrow">Les escouades du moment</div><h2 style={{ marginTop: 6 }}>Équipes actives</h2></div><span className="role-badge">{teams.length} équipes</span></div>
        {teamsQuery.isLoading ? <LoadingRows amount={3} /> : teamsQuery.isError ? <ErrorBox onRetry={() => void teamsQuery.refetch()} /> : teams.length ? teams.map((team) => <TeamAdminRow key={team.id} team={team} onRename={saveTeamName} onArchive={archive} onAdd={addToTeam} onRemove={removeFromTeam} />) : <div className="empty-state"><div className="empty-symbol"><Users size={17} /></div><strong>Pas encore d’équipe</strong><p>Les équipes apparaîtront ici après leur création par les capitaines.</p></div>}
      </section>
      <section className="panel section-card" style={{ gridColumn: '1 / -1' }}>
        <div className="section-title-row"><div><div className="eyebrow">La suite de la saison</div><h2 style={{ marginTop: 6 }}>Défis hebdomadaires</h2></div><span className="role-badge">{challenges.length} semaines</span></div>
        <form className="create-form" onSubmit={submitChallenge}>
          <input className="text-input" aria-label="Titre du défi" data-testid="input-challenge-title" placeholder="Titre du prochain défi" minLength={3} maxLength={80} required value={challengeTitle} onChange={(e) => setChallengeTitle(e.target.value)} />
          <input className="text-input" aria-label="Récompense du défi" data-testid="input-challenge-reward" placeholder="Récompense à gagner" minLength={2} maxLength={120} required value={challengeReward} onChange={(e) => setChallengeReward(e.target.value)} />
          <button className="btn btn-primary" disabled={createChallenge.isPending || challengeTitle.trim().length < 3 || challengeReward.trim().length < 2} data-testid="button-create-challenge">{createChallenge.isPending ? <LoaderCircle size={15} /> : <Sparkles size={15} />} Lancer 7 jours</button>
        </form>
        <div className="notice"><Clock3 size={15} /><span>Chaque défi dure sept jours. Les résultats précédents restent visibles après le lancement du suivant.</span></div>
        {challengesQuery.isLoading ? <div style={{ marginTop: 16 }}><LoadingRows amount={2} /></div> : challengesQuery.isError ? <div style={{ marginTop: 16 }}><ErrorBox onRetry={() => void challengesQuery.refetch()} /></div> : challenges.length ? <div style={{ marginTop: 16 }} data-testid="challenge-history">{challenges.map((challenge) => <div className="challenge-item" key={challenge.id} data-testid={`challenge-${challenge.id}`}><div><h3>{challenge.title}</h3><p>Récompense : {challenge.reward} · {formatDate(challenge.startsAt)} — {formatDate(challenge.endsAt)}{challenge.winningTeamName ? ` · Vainqueur : ${challenge.winningTeamName}` : ''}{challenge.winnerUsername ? ` · Tirage : ${challenge.winnerUsername}` : ''}</p></div><span className={`challenge-status ${challenge.status === 'COMPLETED' ? 'completed' : ''}`}>{challenge.status === 'ACTIVE' ? 'EN COURS' : challenge.drawStatus === 'DRAWN' ? 'TERMINÉ · TIRÉ' : challenge.drawStatus === 'NO_ELIGIBLE_MEMBERS' ? 'TERMINÉ · SANS ÉLIGIBLE' : 'TERMINÉ · EN ATTENTE'}</span></div>)}</div> : <div className="empty-state" style={{ marginTop: 16 }} data-testid="empty-challenges"><div className="empty-symbol"><Award size={17} /></div><strong>Aucun défi pour l’instant</strong><p>Le premier défi pourra être créé depuis ce formulaire.</p></div>}
      </section>
    </div>
    <div className="footer-note"><span>GESTION RÉSERVÉE AUX MEMBRES AUTORISÉS</span><span>Les changements sont appliqués côté serveur.</span></div>
    </>}
  </>;
}

function TeamAdminRow({ team, onRename, onArchive, onAdd, onRemove }: {
  team: TeamProgress;
  onRename: (id: string, name: string) => void;
  onArchive: (team: TeamProgress) => void;
  onAdd: (event: React.FormEvent<HTMLFormElement>, teamId: string, input: HTMLInputElement) => void;
  onRemove: (team: TeamProgress, discordId: string) => void;
}) {
  const [name, setName] = useState(team.name);
  return <div className="team-admin-row" data-testid={`admin-team-${team.id}`}>
    <div className="team-admin-top"><div style={{ minWidth: 0 }}><strong>{team.name}</strong><div className="team-admin-meta">Capitaine : {team.captainName} · {team.memberCount} membres · {team.voiceHours.toFixed(1)} h · {team.activeMembers} actifs</div></div>
      <div className="team-admin-actions"><button className="btn btn-quiet btn-small" onClick={() => { const next = window.prompt('Nouveau nom de l’équipe', name); if (next?.trim() && next.trim() !== name) { setName(next.trim()); onRename(team.id, next); } }} data-testid={`button-rename-admin-team-${team.id}`}>Renommer</button><button className="btn btn-danger btn-small" onClick={() => onArchive(team)} data-testid={`button-archive-team-${team.id}`}>Archiver</button></div>
    </div>
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
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={HomePage} /><Route path="/team" component={TeamPage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
