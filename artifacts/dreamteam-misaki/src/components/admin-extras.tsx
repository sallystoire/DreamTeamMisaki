import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDreamTeamDashboardQueryKey, getGetMyTeamQueryKey, getListAdminChallengesQueryKey, getListAdminMembersQueryKey,
  getListAdminTeamsQueryKey, useClearAdminChallengeReward, useCreateAdminTeam, useListAdminMembers, useUpdateAdminChallengeReward,
} from '@workspace/api-client-react';
import type { Challenge } from '@workspace/api-client-react';
import { Gift, LoaderCircle, RefreshCw, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/errors';

type Note = { text: string; kind: 'error' | 'success' } | null;

export function CreateTeamForm() {
  const auth = useAuth();
  const qc = useQueryClient();
  const create = useCreateAdminTeam();
  const members = useListAdminMembers(undefined, { query: { queryKey: getListAdminMembersQueryKey() } });
  const [name, setName] = useState('');
  const [captain, setCaptain] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [note, setNote] = useState<Note>(null);
  const me = auth.user?.discordId || auth.user?.id;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNote(null);
    const data = { name: name.trim(), ...(captain ? { captainDiscordId: captain } : {}), ...(joinCode.trim() ? { joinCode: joinCode.trim() } : {}) };
    create.mutate({ data }, {
      onSuccess: (team) => {
        setNote({ text: `Équipe « ${team.name} » créée.`, kind: 'success' });
        setName(''); setCaptain(''); setJoinCode('');
        void qc.invalidateQueries({ queryKey: getListAdminTeamsQueryKey() });
        void qc.invalidateQueries({ queryKey: getListAdminMembersQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetDreamTeamDashboardQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
      },
      onError: (err) => setNote({ text: apiErrorMessage(err, 'Création impossible. Vérifie le nom, le capitaine et le code.'), kind: 'error' }),
    });
  };
  return <section className="panel section-card" style={{ gridColumn: '1 / -1' }} data-testid="section-create-team">
    <div className="section-title-row"><div><div className="eyebrow">Admin+</div><h2 style={{ marginTop: 6 }}>Créer une équipe</h2></div><Users size={20} color="#ec4899" /></div>
    <form className="cap-grid" onSubmit={submit}>
      <label className="cap-field">Nom de l’équipe<input className="text-input" required minLength={2} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-new-team-name" /></label>
      <label className="cap-field">Capitaine
        <select className="select-input" value={captain} onChange={(e) => setCaptain(e.target.value)} data-testid="select-new-team-captain">
          <option value="">Moi-même{me ? '' : ' (compte actuel)'}</option>
          {(members.data?.items ?? []).filter((m) => m.discordId !== me).map((m) => <option key={m.discordId} value={m.discordId}>{m.username}{m.role === 'CAPTAIN' ? ' (Capitaine)' : ''}</option>)}
        </select>
        {members.isError && <span className="hint" role="alert" style={{ margin: 0 }}>Liste indisponible. <button type="button" className="btn btn-quiet btn-small" onClick={() => void members.refetch()}><RefreshCw size={12} /> Réessayer</button></span>}
      </label>
      <label className="cap-field">Code d’invitation (optionnel)<input className="text-input" minLength={4} maxLength={32} pattern="[A-Za-z0-9\-]{4,32}" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Généré si vide" data-testid="input-new-team-code" /></label>
      <div className="cap-field" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" disabled={create.isPending || name.trim().length < 2} data-testid="button-create-team">{create.isPending ? <LoaderCircle size={14} className="spin" /> : <Users size={14} />} Créer l’équipe</button>
      </div>
    </form>
    {note && <div className={`${note.kind}-note`} role={note.kind === 'error' ? 'alert' : 'status'} data-testid="text-create-team-note">{note.text}</div>}
  </section>;
}

export function RewardManager({ challenges }: { challenges: Challenge[] }) {
  const qc = useQueryClient();
  const update = useUpdateAdminChallengeReward();
  const clear = useClearAdminChallengeReward();
  const active = challenges.find((c) => c.status === 'ACTIVE');
  const [reward, setReward] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const activeId = active?.id;
  const activeReward = active?.reward;
  useEffect(() => { setReward(activeReward ?? ''); setConfirming(false); }, [activeId, activeReward]);
  if (!active) return null;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListAdminChallengesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetDreamTeamDashboardQueryKey() });
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setNote(null);
    const value = reward.trim();
    if (!value) { setConfirming(true); return; }
    update.mutate({ challengeId: active.id, data: { reward: value } }, {
      onSuccess: (c) => { setReward(c.reward); setNote({ text: 'Récompense mise à jour.', kind: 'success' }); refresh(); },
      onError: (err) => setNote({ text: apiErrorMessage(err, 'Impossible de modifier la récompense.'), kind: 'error' }),
    });
  };
  const remove = () => {
    setNote(null);
    clear.mutate({ challengeId: active.id }, {
      onSuccess: () => { setReward(''); setConfirming(false); setNote({ text: 'Récompense retirée. Le défi et les scores sont conservés.', kind: 'success' }); refresh(); },
      onError: (err) => { setConfirming(false); setNote({ text: apiErrorMessage(err, 'Impossible de retirer la récompense.'), kind: 'error' }); },
    });
  };
  const busy = update.isPending || clear.isPending;
  return <div className="reward-admin" data-testid="reward-manager">
    <div className="eyebrow" style={{ color: '#f5c75a' }}>Récompense de la semaine</div>
    <p className="hint" style={{ marginTop: 4 }}>{active.title} · {active.reward ? `Actuellement : ${active.reward}` : 'Aucune récompense définie'}</p>
    <form className="form-row" onSubmit={save}>
      <input className="text-input" aria-label="Récompense" maxLength={120} value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Ex. 3 mois de Nitro" data-testid="input-reward" />
      <button className="btn btn-primary" disabled={busy || reward.trim() === (active.reward ?? '')} data-testid="button-save-reward">{update.isPending ? <LoaderCircle size={14} className="spin" /> : <Gift size={14} />} Enregistrer</button>
      <button type="button" className="btn btn-danger" disabled={busy || !active.reward} onClick={() => setConfirming(true)} data-testid="button-remove-reward"><Trash2 size={14} /> Retirer</button>
    </form>
    {confirming && <div className="notice" role="alertdialog" aria-label="Confirmer le retrait de la récompense" style={{ flexWrap: 'wrap' }} data-testid="confirm-remove-reward">
      <span style={{ flex: 1 }}>Retirer la récompense ? Le défi et les scores restent intacts, il n’y aura simplement plus de lot.</span>
      <button className="btn btn-danger btn-small" onClick={remove} disabled={clear.isPending} data-testid="button-confirm-remove-reward">{clear.isPending ? <LoaderCircle size={12} className="spin" /> : null} Oui, retirer</button>
      <button className="btn btn-quiet btn-small" onClick={() => setConfirming(false)} data-testid="button-cancel-remove-reward">Annuler</button>
    </div>}
    {note && <div className={`${note.kind}-note`} role={note.kind === 'error' ? 'alert' : 'status'} data-testid="text-reward-note">{note.text}</div>}
  </div>;
}
