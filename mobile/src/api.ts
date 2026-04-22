import { API_BASE_URL } from './constants';
import { supabase } from './supabase';

const USE_MOCK = false;

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type NavigateToLogin = () => void;
let _onUnauthorized: NavigateToLogin = () => {};

export function setUnauthorizedHandler(fn: NavigateToLogin) {
  _onUnauthorized = fn;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    _onUnauthorized();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

// ── Property types ────────────────────────────────────────────────────────────

export interface MobileProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  dealScore: number;
  capRate: number;
  cashFlow: number;
  image: string | null;
  lat: number | null;
  lng: number | null;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

const MOCK_PROPERTIES: MobileProperty[] = [
  { id: 'p1', address: '4521 Oak Creek Drive', city: 'Dallas', state: 'TX', zip: '75201', price: 342000, beds: 3, baths: 2, sqft: 1840, dealScore: 81, capRate: 6.4, cashFlow: 312, image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&q=70', lat: 32.7767, lng: -96.7970 },
  { id: 'p2', address: '1872 Magnolia Street', city: 'Dallas', state: 'TX', zip: '75206', price: 285000, beds: 3, baths: 2, sqft: 1520, dealScore: 74, capRate: 5.8, cashFlow: 198, image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=70', lat: 32.7957, lng: -96.7543 },
  { id: 'p3', address: '9034 Sunset Ridge Ln', city: 'Dallas', state: 'TX', zip: '75218', price: 419000, beds: 4, baths: 3, sqft: 2280, dealScore: 62, capRate: 4.9, cashFlow: 88, image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&q=70', lat: 32.8212, lng: -96.7021 },
];

// ── API functions ─────────────────────────────────────────────────────────────

export async function searchProperties(query?: string): Promise<MobileProperty[]> {
  if (USE_MOCK) {
    if (!query) return MOCK_PROPERTIES;
    const q = query.toLowerCase();
    return MOCK_PROPERTIES.filter(p =>
      p.address.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q) ||
      p.zip.includes(q)
    );
  }

  const params = new URLSearchParams();
  if (query) params.set('query', query);
  const data = await request<any[]>(`/properties/search?${params}`);
  return data.map(p => ({
    id: p.id,
    address: p.address,
    city: p.city,
    state: p.state,
    zip: p.zip,
    price: p.price,
    beds: p.beds,
    baths: p.baths,
    sqft: p.sqft,
    dealScore: p.dealScore,
    capRate: p.capRate,
    cashFlow: p.cashFlow,
    image: p.image ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
  }));
}

export async function getProperty(id: string): Promise<MobileProperty | null> {
  if (USE_MOCK) {
    return MOCK_PROPERTIES.find(p => p.id === id) ?? null;
  }
  const p = await request<any>(`/properties/${id}`);
  return {
    id: p.id, address: p.address, city: p.city, state: p.state, zip: p.zip,
    price: p.price, beds: p.beds, baths: p.baths, sqft: p.sqft,
    dealScore: p.dealScore, capRate: p.capRate, cashFlow: p.cashFlow,
    image: p.image ?? null, lat: p.lat ?? null, lng: p.lng ?? null,
  };
}
