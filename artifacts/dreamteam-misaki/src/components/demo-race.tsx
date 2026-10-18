import type { CSSProperties } from 'react';
import { Gift, LogIn } from 'lucide-react';

const DEMO = [
  { name: 'Aurore Boréale', hours: 41.8, end: 1, mid: 0.52, hue: 'a' },
  { name: 'Les Noctambules', hours: 38.2, end: 0.9, mid: 0.64, hue: 'b' },
  { name: 'Étoile Filante', hours: 33.5, end: 0.78, mid: 0.4, hue: 'c' },
  { name: 'Lune Rousse', hours: 27.1, end: 0.66, mid: 0.5, hue: 'a' },
  { name: 'Pulsar', hours: 21.4, end: 0.52, mid: 0.3, hue: 'b' },
];

export function DemoRace() {
  return <div className="race-grid"><section className="panel demo-race" aria-labelledby="demo-title" data-testid="demo-race">
    <div className="panel-head">
      <div>
        <span className="demo-badge" data-testid="text-demo-label">Démonstration · équipes fictives</span>
        <h2 id="demo-title" className="panel-title" style={{ marginTop: 10 }}>Aperçu de la course</h2>
        <p className="panel-caption">Rien de ce qui suit n’est réel : voici seulement l’ambiance d’une semaine de course.</p>
      </div>
    </div>
    <div className="demo-lanes" role="img" aria-label="Animation de démonstration : cinq équipes fictives courent vers un cadeau à l’arrivée">
      {DEMO.map((t, i) => <div className="demo-lane" key={t.name} style={{ '--p': t.end, '--mid': t.mid } as CSSProperties}>
        <div className="demo-label"><span className="rank-number">{String(i + 1).padStart(2, '0')}</span><span className="team-name">{t.name}</span></div>
        <div className="demo-track"><div className={`demo-runner h-${t.hue}`}><span /></div><div className="demo-hours">{t.hours.toFixed(1)} h</div></div>
      </div>)}
      <div className="demo-finish" aria-hidden="true"><div className="demo-gift"><Gift size={26} /></div><div className="demo-sparks"><i /><i /><i /><i /><i /></div></div>
    </div>
    <div className="demo-cta" data-testid="text-demo-cta">
      <p>Connecte toi avec Discord pour pouvoir rentrer dans une équipe et suivre l’avancé de ton équipe !</p>
      <a className="btn btn-primary" href="/api/auth/discord/login" data-testid="link-demo-login"><LogIn size={14} /> Connexion Discord</a>
    </div>
  </section>
    <aside>
      <div className="reward-card" data-testid="demo-reward-card">
        <div className="reward-kicker">À la clé cette semaine</div>
        <h2 className="reward-title" data-testid="text-demo-reward">NITRO BOOST !</h2>
        <p className="reward-copy">Exemple de récompense pour cet aperçu fictif.</p>
        <div className="reward-icon"><Gift size={22} /></div>
      </div>
    </aside>
  </div>;
}
