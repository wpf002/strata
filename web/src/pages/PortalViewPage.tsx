import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, MapPin, ExternalLink, Phone, Mail, Building2 } from 'lucide-react';
import { clsx } from 'clsx';
import { viewPortal, recordPortalActivity } from '../api/client';
import type { PortalPublicView, PortalProperty } from '../api/client';
import { ScoreBadge, fmt } from '../components/UI';

const FAVORITES_KEY = 'strata.portalFavorites';

function loadFavorites(token: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${FAVORITES_KEY}.${token}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveFavorites(token: string, ids: Set<string>) {
  try {
    localStorage.setItem(`${FAVORITES_KEY}.${token}`, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

// Identify the viewer. Agents can share `/portal/{token}?email=bob@email.com`
// to pre-attribute views without asking the client to type their name.
function useViewerIdentity() {
  const [clientName, setClientName] = useState<string | undefined>();
  const [clientEmail, setClientEmail] = useState<string | undefined>();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email') || params.get('client_email') || undefined;
    const name = params.get('name') || params.get('client_name') || undefined;
    if (email) setClientEmail(email);
    if (name) setClientName(name);
  }, []);
  return { clientName, clientEmail };
}

export default function PortalViewPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalPublicView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const { clientName, clientEmail } = useViewerIdentity();

  const log = useCallback(
    (actionType: string, propertyId?: string) => {
      if (!token) return;
      recordPortalActivity(token, { propertyId, actionType, clientName, clientEmail });
    },
    [token, clientName, clientEmail],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setNotFound(false);
    viewPortal(token)
      .then(d => {
        setData(d);
        setFavorites(loadFavorites(token));
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  // Fire a single "viewed" beacon for the portal load.
  useEffect(() => {
    if (data && token) {
      log('viewed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, token]);

  const sorted = useMemo(() => {
    if (!data) return [] as PortalProperty[];
    // Favorited properties float to the top.
    const favs = [...data.properties].filter(p => favorites.has(p.id));
    const rest = [...data.properties].filter(p => !favorites.has(p.id));
    return [...favs, ...rest];
  }, [data, favorites]);

  const toggleFavorite = (propertyId: string) => {
    if (!token) return;
    const next = new Set(favorites);
    const isFav = next.has(propertyId);
    if (isFav) {
      next.delete(propertyId);
      log('unfavorited', propertyId);
    } else {
      next.add(propertyId);
      log('favorited', propertyId);
    }
    setFavorites(next);
    saveFavorites(token, next);
  };

  const onPropertyView = (propertyId: string) => {
    log('viewed', propertyId);
  };

  if (loading) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="glass rounded-xl w-48 h-16 animate-pulse" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center text-center p-6">
        <div>
          <p className="text-xl font-semibold text-white mb-2">Portal Not Found</p>
          <p className="text-sm text-slate-500">This link has expired or been archived. Ask your agent for an updated link.</p>
        </div>
      </div>
    );
  }

  const { agent, properties } = data;
  const agentName = agent.name || 'Your Agent';

  return (
    <div className="min-h-screen grid-bg">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Agent header */}
        <div className="glass rounded-2xl p-4 md:p-6 mb-6 md:mb-8 border border-white/8 flex items-center gap-4">
          {agent.photo ? (
            <img src={agent.photo} alt={agentName} className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <span className="text-amber-400 font-semibold text-lg">{agentName.charAt(0)}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Curated for you by</p>
            <p className="text-base md:text-lg font-semibold text-white truncate">{agentName}</p>
            {agent.brokerage && (
              <p className="text-sm text-slate-400 flex items-center gap-1.5 truncate">
                <Building2 size={12} className="text-slate-500 flex-shrink-0" /> {agent.brokerage}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
              {agent.email && (
                <a href={`mailto:${agent.email}`} className="flex items-center gap-1 hover:text-amber-400 transition-colors">
                  <Mail size={11} /> {agent.email}
                </a>
              )}
              {agent.phone && (
                <a href={`tel:${agent.phone}`} className="flex items-center gap-1 hover:text-amber-400 transition-colors">
                  <Phone size={11} /> {agent.phone}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="mb-5 md:mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold text-white" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {data.portalName}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {properties.length} {properties.length === 1 ? 'property' : 'properties'} selected for you by {agentName}
          </p>
        </div>

        {/* Properties */}
        {properties.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center border border-white/5">
            <p className="text-sm text-slate-400">No properties in this collection yet. Your agent will add some soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {sorted.map(p => (
              <PortalPropertyCard
                key={p.id}
                property={p}
                isFavorite={favorites.has(p.id)}
                onToggleFavorite={() => toggleFavorite(p.id)}
                onView={() => onPropertyView(p.id)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-slate-600">
            Powered by <Link to="/" className="text-amber-400/80 hover:text-amber-400 transition-colors">STRATA</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function PortalPropertyCard({
  property: p,
  isFavorite,
  onToggleFavorite,
  onView,
}: {
  property: PortalProperty;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onView: () => void;
}) {
  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/8 hover:border-white/15 transition-colors">
      <div className="relative">
        {p.image ? (
          <img src={p.image} alt={p.address} className="w-full h-52 md:h-60 object-cover" />
        ) : (
          <div className="w-full h-52 md:h-60 bg-navy-800" />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {p.dealScore !== null && <ScoreBadge score={p.dealScore} />}
        </div>
        <button
          onClick={onToggleFavorite}
          aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
          className={clsx(
            'absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center transition-all',
            isFavorite
              ? 'bg-red-500/90 text-white shadow-lg'
              : 'bg-black/40 backdrop-blur text-white hover:bg-red-500/80',
          )}
        >
          <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="p-5">
        <p className="text-base font-semibold text-white truncate">{p.address}</p>
        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
          <MapPin size={11} className="text-slate-500 flex-shrink-0" />
          {p.city}{p.state ? `, ${p.state}` : ''}
        </p>

        <div className="flex items-center justify-between mt-4">
          {p.price !== null ? (
            <p className="text-xl font-semibold text-white font-mono">{fmt.currency(p.price)}</p>
          ) : (
            <p className="text-sm text-slate-500">Price TBD</p>
          )}
          <div className="text-xs text-slate-400 font-mono">
            {p.beds ?? '—'} bd · {p.baths ?? '—'} ba · {p.sqft ? `${p.sqft.toLocaleString()} sqft` : '— sqft'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/5">
          <Stat label="Est. Rent" value={p.rentEstimate ? `${fmt.compact(p.rentEstimate)}/mo` : '—'} />
          <Stat label="Neighborhood" value={p.neighborhoodScore !== null ? `${p.neighborhoodScore}/100` : '—'} />
          <Stat label="Days on Market" value={p.daysOnMarket !== null ? `${p.daysOnMarket}d` : '—'} />
        </div>

        <Link
          to={`/intelligence/${p.id}`}
          onClick={onView}
          className="mt-4 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-sm font-semibold text-amber-400 hover:bg-amber-500/25 transition-colors"
        >
          Get Full Analysis <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-white font-mono">{value}</p>
    </div>
  );
}
