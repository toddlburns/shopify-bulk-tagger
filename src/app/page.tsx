'use client';

import { useState, useEffect, useCallback } from 'react';

const APP_PASSWORD = 'racine456';

interface Product {
  handle: string;
  title: string;
  vendor: string;
  existingGenre: string | null;
  existingSubgenre: string | null;
  existingDecade: string | null;
}

interface VendorData {
  products: Product[];
  existingGenres: Record<string, number>;
  existingDecades: Record<string, number>;
}

interface Question {
  id: string;
  text: string;
  context: string;
  impact: string;
  affectedCount: number;
  type: string;
  vendor: string;
  suggestedValue: string;
  existingPct: number;
}

interface Rule {
  type: string;
  vendor: string;
  tagType: string;
  value: string;
  certaintyPct: number;
  reason: string;
}

interface Answer {
  questionId: string;
  questionText: string;
  answer: string;
}

interface CertaintyValue {
  value: string;
  pct: number;
  source: string;
}

interface CertaintyData {
  genre: CertaintyValue | Record<string, never>;
  subgenre: CertaintyValue | Record<string, never>;
  decade: CertaintyValue | Record<string, never>;
}

interface Session {
  id: string;
  name: string;
  updatedAt: string;
  _count?: { rules: number; answers: number; products: number };
  rules?: Rule[];
  answers?: Answer[];
  certainties?: Array<{
    handle: string;
    tagType: string;
    value: string;
    pct: number;
    source: string;
  }>;
  products?: Product[];
}

export default function TagQuest() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Record<string, VendorData>>({});
  const [certainty, setCertainty] = useState<Record<string, CertaintyData>>({});
  const [rules, setRules] = useState<Rule[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionHistory, setQuestionHistory] = useState<Answer[]>([]);
  const [detailedAnswer, setDetailedAnswer] = useState('');

  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(true);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [showCatalogManager, setShowCatalogManager] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [uploadingCatalog, setUploadingCatalog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ stage: '', current: 0, total: 0 });
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const [checkpointNotes, setCheckpointNotes] = useState('');
  const [discogsData, setDiscogsData] = useState<Record<string, {
    year: number | null;
    genre: string | null;
    style: string | null;
  }>>({});
  const [loadingDiscogs, setLoadingDiscogs] = useState(false);
  const [discogsAnalysis, setDiscogsAnalysis] = useState<{
    genreAnalysis?: { topGenre: string | null; confidence: number; recommended: string | null };
    decadeAnalysis?: { topDecade: string | null; confidence: number; recommended: string | null };
    styleAnalysis?: { topStyle: string | null };
  } | null>(null);
  const [analyzingQuestion, setAnalyzingQuestion] = useState(false);
  const [showDataExplorer, setShowDataExplorer] = useState(false);
  const [showMetaQuestions, setShowMetaQuestions] = useState(false);
  const [selectedMetaQuestion, setSelectedMetaQuestion] = useState<{
    type: 'genre' | 'decade';
    value: string;
    vendors: string[];
    totalProducts: number;
  } | null>(null);
  const [verifyingMeta, setVerifyingMeta] = useState(false);
  const [metaVerification, setMetaVerification] = useState<Record<string, {
    confirmed: boolean;
    discogsGenre?: string;
    confidence?: number;
  }>>({});

  // Check for saved authentication
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('tagquest_auth');
      if (saved === 'true') {
        setIsAuthenticated(true);
      }
    } catch {
      // localStorage not available
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    fetch('/api/sessions')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data);
        }
      })
      .catch(console.error);

    // Fetch catalog count
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCatalogCount(data.length);
        }
      })
      .catch(console.error);
  }, [isAuthenticated]);

  const generateQuestions = useCallback(() => {
    const newQuestions: Question[] = [];

    for (const [vendor, data] of Object.entries(vendors)) {
      if (vendor === 'uDiscover Music' || vendor === 'Various Artists') continue;

      const total = data.products.length;
      if (total < 2) continue;

      const genreCounts = data.existingGenres;
      const totalWithGenre = Object.values(genreCounts).reduce((a, b) => a + b, 0);
      const missingGenre = total - totalWithGenre;

      if (missingGenre > 0 && totalWithGenre > 0) {
        const entries = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
        if (entries.length > 0) {
          const topGenre = entries[0];
          const pct = Math.round(100 * topGenre[1] / total);

          if (pct >= 50) {
            newQuestions.push({
              id: `vendor-genre-${vendor}`,
              text: `Should all "${vendor}" products be "${topGenre[0]}"?`,
              context: `${topGenre[1]} of ${total} already tagged`,
              impact: `+${missingGenre} products`,
              affectedCount: missingGenre,
              type: 'vendor-genre',
              vendor: vendor,
              suggestedValue: topGenre[0],
              existingPct: pct
            });
          }
        }
      }

      const decadeCounts = data.existingDecades;
      const totalWithDecade = Object.values(decadeCounts).reduce((a, b) => a + b, 0);
      const missingDecade = total - totalWithDecade;

      if (missingDecade > 0 && totalWithDecade > 0) {
        const entries = Object.entries(decadeCounts).sort((a, b) => b[1] - a[1]);
        if (entries.length > 0) {
          const topDecade = entries[0];
          const pct = Math.round(100 * topDecade[1] / total);

          if (pct >= 50) {
            newQuestions.push({
              id: `vendor-decade-${vendor}`,
              text: `Should all "${vendor}" products be "${topDecade[0]}"?`,
              context: `${topDecade[1]} of ${total} already tagged`,
              impact: `+${missingDecade} products`,
              affectedCount: missingDecade,
              type: 'vendor-decade',
              vendor: vendor,
              suggestedValue: topDecade[0],
              existingPct: pct
            });
          }
        }
      }
    }

    newQuestions.sort((a, b) => {
      if (b.affectedCount !== a.affectedCount) return b.affectedCount - a.affectedCount;
      return b.existingPct - a.existingPct;
    });

    const filtered = newQuestions.filter(q => !questionHistory.find(h => h.questionId === q.id));
    setQuestions(filtered);
    setCurrentQuestionIndex(0);
  }, [vendors, questionHistory]);

  useEffect(() => {
    if (Object.keys(vendors).length > 0) {
      generateQuestions();
    }
  }, [vendors, generateQuestions]);

  const handleLogin = () => {
    if (passwordInput === APP_PASSWORD) {
      setIsAuthenticated(true);
      try {
        window.localStorage.setItem('tagquest_auth', 'true');
      } catch {
        // localStorage not available
      }
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  // Loading screen
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-5xl mb-4">🏷️</div>
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  // Password screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 p-4 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🏷️</div>
            <h1 className="text-2xl font-black text-gray-800">TAG QUEST</h1>
            <p className="text-gray-500 text-sm mt-1">Enter password to continue</p>
          </div>

          <input
            type="password"
            value={passwordInput}
            onChange={e => {
              setPasswordInput(e.target.value);
              setPasswordError(false);
            }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Password"
            className={`w-full p-4 rounded-xl border-2 text-lg text-center ${
              passwordError ? 'border-red-400 bg-red-50' : 'border-gray-200'
            } focus:border-violet-400 focus:outline-none`}
            autoFocus
          />

          {passwordError && (
            <p className="text-red-500 text-sm text-center mt-2">Incorrect password</p>
          )}

          <button
            onClick={handleLogin}
            className="w-full mt-4 p-4 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-bold text-lg active:scale-95 transition-all"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  const loadCatalogProducts = async () => {
    const res = await fetch('/api/products');
    const catalogProducts: Product[] = await res.json();

    if (catalogProducts.length === 0) return;

    const newVendors: Record<string, VendorData> = {};
    const newCertainty: Record<string, CertaintyData> = {};

    for (const product of catalogProducts) {
      if (!newVendors[product.vendor]) {
        newVendors[product.vendor] = { products: [], existingGenres: {}, existingDecades: {} };
      }
      newVendors[product.vendor].products.push(product);

      if (product.existingGenre) {
        newVendors[product.vendor].existingGenres[product.existingGenre] =
          (newVendors[product.vendor].existingGenres[product.existingGenre] || 0) + 1;
      }
      if (product.existingDecade) {
        newVendors[product.vendor].existingDecades[product.existingDecade] =
          (newVendors[product.vendor].existingDecades[product.existingDecade] || 0) + 1;
      }

      newCertainty[product.handle] = { genre: {}, subgenre: {}, decade: {} };
      if (product.existingGenre) {
        newCertainty[product.handle].genre = { value: product.existingGenre, pct: 100, source: 'existing' };
      }
      if (product.existingSubgenre) {
        newCertainty[product.handle].subgenre = { value: product.existingSubgenre, pct: 100, source: 'existing' };
      }
      if (product.existingDecade) {
        newCertainty[product.handle].decade = { value: product.existingDecade, pct: 100, source: 'existing' };
      }
    }

    setProducts(catalogProducts);
    setVendors(newVendors);
    setCertainty(newCertainty);

    // Apply any existing rules
    for (const rule of rules) {
      applyRuleToProducts(rule, newVendors, newCertainty);
    }
  };

  const uploadToCatalog = async (files: FileList) => {
    setUploadingCatalog(true);
    setUploadProgress({ stage: 'Reading files...', current: 0, total: files.length });

    const newProducts: Product[] = [];
    const seen = new Set<string>();
    const fileArray = Array.from(files);

    for (let fileIdx = 0; fileIdx < fileArray.length; fileIdx++) {
      const file = fileArray[fileIdx];
      setUploadProgress({ stage: `Reading ${file.name}...`, current: fileIdx + 1, total: fileArray.length });

      const text = await file.text();
      const lines = text.split('\n');
      const headers = parseCSVLine(lines[0]);
      const idx = {
        handle: headers.indexOf('Handle'),
        title: headers.indexOf('Title'),
        vendor: headers.indexOf('Vendor'),
        tags: headers.indexOf('Tags')
      };

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const handle = values[idx.handle];
        if (!handle || seen.has(handle)) continue;
        seen.add(handle);

        const tags = values[idx.tags] || '';
        const genreMatch = tags.match(/Genre Parent:\s*([^,]+)/i);
        const subgenreMatch = tags.match(/subgenre:\s*([^,]+)/i);
        const decadeMatch = tags.match(/\b(\d{2,4}[cC])\b/);

        newProducts.push({
          handle,
          title: values[idx.title] || '',
          vendor: values[idx.vendor] || '',
          existingGenre: genreMatch ? genreMatch[1].trim() : null,
          existingSubgenre: subgenreMatch ? subgenreMatch[1].trim() : null,
          existingDecade: decadeMatch ? decadeMatch[1].toUpperCase() : null
        });
      }
    }

    // Clear existing catalog first
    setUploadProgress({ stage: 'Clearing old catalog...', current: 0, total: 100 });
    await fetch('/api/products', { method: 'DELETE' });

    // Upload in small chunks for real progress
    const chunkSize = 1000;
    const totalChunks = Math.ceil(newProducts.length / chunkSize);

    for (let i = 0; i < newProducts.length; i += chunkSize) {
      const chunkNum = Math.floor(i / chunkSize) + 1;
      const chunk = newProducts.slice(i, i + chunkSize);
      const progress = Math.round((chunkNum / totalChunks) * 100);

      setUploadProgress({
        stage: `Uploading batch ${chunkNum} of ${totalChunks}...`,
        current: progress,
        total: 100
      });

      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: chunk })
      });
    }

    setUploadProgress({ stage: 'Done!', current: 100, total: 100 });
    setCatalogCount(newProducts.length);

    setTimeout(() => {
      setUploadingCatalog(false);
      setUploadProgress({ stage: '', current: 0, total: 0 });
      setShowCatalogManager(false);
      showToast(`Catalog updated: ${newProducts.length.toLocaleString()} products`);
    }, 500);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      }
      else current += char;
    }
    result.push(current.trim());
    return result;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const loadData = async (files: FileList) => {
    const newProducts: Product[] = [];
    const newVendors: Record<string, VendorData> = {};
    const seen = new Set<string>();
    const newCertainty: Record<string, CertaintyData> = { ...certainty };

    for (const file of Array.from(files)) {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = parseCSVLine(lines[0]);
      const idx = {
        handle: headers.indexOf('Handle'),
        title: headers.indexOf('Title'),
        vendor: headers.indexOf('Vendor'),
        tags: headers.indexOf('Tags')
      };

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const handle = values[idx.handle];
        if (!handle || seen.has(handle)) continue;
        seen.add(handle);

        const tags = values[idx.tags] || '';
        const genreMatch = tags.match(/Genre Parent:\s*([^,]+)/i);
        const subgenreMatch = tags.match(/subgenre:\s*([^,]+)/i);
        const decadeMatch = tags.match(/\b(\d{2,4}[cC])\b/);

        const product: Product = {
          handle,
          title: values[idx.title] || '',
          vendor: values[idx.vendor] || '',
          existingGenre: genreMatch ? genreMatch[1].trim() : null,
          existingSubgenre: subgenreMatch ? subgenreMatch[1].trim() : null,
          existingDecade: decadeMatch ? decadeMatch[1].toUpperCase() : null
        };

        newProducts.push(product);

        if (!newVendors[product.vendor]) {
          newVendors[product.vendor] = { products: [], existingGenres: {}, existingDecades: {} };
        }
        newVendors[product.vendor].products.push(product);

        if (product.existingGenre) {
          newVendors[product.vendor].existingGenres[product.existingGenre] =
            (newVendors[product.vendor].existingGenres[product.existingGenre] || 0) + 1;
        }
        if (product.existingDecade) {
          newVendors[product.vendor].existingDecades[product.existingDecade] =
            (newVendors[product.vendor].existingDecades[product.existingDecade] || 0) + 1;
        }

        if (!newCertainty[handle]) {
          newCertainty[handle] = { genre: {}, subgenre: {}, decade: {} };
        }
        if (product.existingGenre) {
          newCertainty[handle].genre = { value: product.existingGenre, pct: 100, source: 'existing' };
        }
        if (product.existingSubgenre) {
          newCertainty[handle].subgenre = { value: product.existingSubgenre, pct: 100, source: 'existing' };
        }
        if (product.existingDecade) {
          newCertainty[handle].decade = { value: product.existingDecade, pct: 100, source: 'existing' };
        }
      }
    }

    setProducts(newProducts);
    setVendors(newVendors);
    setCertainty(newCertainty);

    for (const rule of rules) {
      applyRuleToProducts(rule, newVendors, newCertainty);
    }
  };

  const applyRuleToProducts = (
    rule: Rule,
    vendorData: Record<string, VendorData>,
    certData: Record<string, CertaintyData>
  ) => {
    const vData = vendorData[rule.vendor];
    if (!vData) return;

    for (const product of vData.products) {
      const current = certData[product.handle]?.[rule.tagType as keyof CertaintyData] as CertaintyValue | undefined;
      if (!current?.value || current.pct < rule.certaintyPct) {
        if (!certData[product.handle]) {
          certData[product.handle] = { genre: {}, subgenre: {}, decade: {} };
        }
        certData[product.handle][rule.tagType as keyof CertaintyData] = {
          value: rule.value,
          pct: rule.certaintyPct,
          source: 'rule'
        };
      }
    }
  };

  const createSession = async (name: string) => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const session = await res.json();
    setSessions(prev => [session, ...prev]);
    setCurrentSession(session);
    setShowSessionPicker(false);

    // Save to localStorage for review page access
    try {
      localStorage.setItem('tagquest_current_session', JSON.stringify({ id: session.id, name: session.name }));
    } catch {
      // localStorage not available
    }

    // Auto-load products from catalog
    await loadCatalogProducts();
  };

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this session? This cannot be undone.')) return;

    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    showToast('Session deleted');
  };

  const startRenaming = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingName(session.name);
  };

  const saveRename = async (sessionId: string) => {
    if (!editingName.trim()) return;

    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingName.trim() })
    });

    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, name: editingName.trim() } : s
    ));
    setEditingSessionId(null);
    setEditingName('');
  };

  const loadSession = async (sessionId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    const session: Session = await res.json();

    setCurrentSession(session);
    setRules(session.rules || []);
    setQuestionHistory((session.answers || []).map(a => ({
      questionId: a.questionId,
      questionText: a.questionText,
      answer: a.answer
    })));

    // Save to localStorage for review page access
    try {
      localStorage.setItem('tagquest_current_session', JSON.stringify({ id: session.id, name: session.name }));
    } catch {
      // localStorage not available
    }

    // Load products from global catalog
    const catalogRes = await fetch('/api/products');
    const catalogProducts: Product[] = await catalogRes.json();

    if (catalogProducts.length > 0) {
      const loadedVendors: Record<string, VendorData> = {};
      const certMap: Record<string, CertaintyData> = {};

      for (const product of catalogProducts) {
        if (!loadedVendors[product.vendor]) {
          loadedVendors[product.vendor] = { products: [], existingGenres: {}, existingDecades: {} };
        }
        loadedVendors[product.vendor].products.push(product);

        if (product.existingGenre) {
          loadedVendors[product.vendor].existingGenres[product.existingGenre] =
            (loadedVendors[product.vendor].existingGenres[product.existingGenre] || 0) + 1;
        }
        if (product.existingDecade) {
          loadedVendors[product.vendor].existingDecades[product.existingDecade] =
            (loadedVendors[product.vendor].existingDecades[product.existingDecade] || 0) + 1;
        }

        // Initialize certainty from product tags
        certMap[product.handle] = { genre: {}, subgenre: {}, decade: {} };
        if (product.existingGenre) {
          certMap[product.handle].genre = { value: product.existingGenre, pct: 100, source: 'existing' };
        }
        if (product.existingSubgenre) {
          certMap[product.handle].subgenre = { value: product.existingSubgenre, pct: 100, source: 'existing' };
        }
        if (product.existingDecade) {
          certMap[product.handle].decade = { value: product.existingDecade, pct: 100, source: 'existing' };
        }
      }

      // Override with saved session certainties
      for (const c of session.certainties || []) {
        if (!certMap[c.handle]) {
          certMap[c.handle] = { genre: {}, subgenre: {}, decade: {} };
        }
        certMap[c.handle][c.tagType as keyof CertaintyData] = {
          value: c.value,
          pct: c.pct,
          source: c.source
        };
      }

      setProducts(catalogProducts);
      setVendors(loadedVendors);
      setCertainty(certMap);

      // Apply saved rules
      for (const rule of session.rules || []) {
        applyRuleToProducts(rule, loadedVendors, certMap);
      }
    }

    setShowSessionPicker(false);
  };

  // Sync/refresh from server - reloads everything for this session
  const syncFromServer = async () => {
    if (!currentSession) return;

    setSyncing(true);
    try {
      // Reload the full session from server
      const res = await fetch(`/api/sessions/${currentSession.id}`);
      const session: Session = await res.json();

      const newRules = session.rules || [];
      const newHistory = (session.answers || []).map(a => ({
        questionId: a.questionId,
        questionText: a.questionText,
        answer: a.answer
      }));

      setRules(newRules);
      setQuestionHistory(newHistory);

      // Reload certainties from products + session
      const certMap: Record<string, CertaintyData> = {};

      for (const product of products) {
        certMap[product.handle] = { genre: {}, subgenre: {}, decade: {} };
        if (product.existingGenre) {
          certMap[product.handle].genre = { value: product.existingGenre, pct: 100, source: 'existing' };
        }
        if (product.existingSubgenre) {
          certMap[product.handle].subgenre = { value: product.existingSubgenre, pct: 100, source: 'existing' };
        }
        if (product.existingDecade) {
          certMap[product.handle].decade = { value: product.existingDecade, pct: 100, source: 'existing' };
        }
      }

      for (const c of session.certainties || []) {
        if (!certMap[c.handle]) {
          certMap[c.handle] = { genre: {}, subgenre: {}, decade: {} };
        }
        certMap[c.handle][c.tagType as keyof CertaintyData] = {
          value: c.value,
          pct: c.pct,
          source: c.source
        };
      }

      // Apply rules to update certainties
      for (const rule of newRules) {
        applyRuleToProducts(rule, vendors, certMap);
      }

      setCertainty(certMap);

      showToast(`Synced! ${newHistory.length} answers loaded`);
    } catch (error) {
      console.error('Sync failed:', error);
      showToast('Sync failed');
    }
    setSyncing(false);
  };

  const saveProgress = async () => {
    if (!currentSession) return;

    setSaving(true);

    const certArray: Array<{
      handle: string;
      tagType: string;
      value: string;
      pct: number;
      source: string;
    }> = [];

    for (const [handle, data] of Object.entries(certainty)) {
      for (const tagType of ['genre', 'subgenre', 'decade'] as const) {
        const val = data[tagType] as CertaintyValue;
        if (val?.value) {
          certArray.push({
            handle,
            tagType,
            value: val.value,
            pct: val.pct,
            source: val.source
          });
        }
      }
    }

    // Don't send products - they're in the global catalog now
    try {
      const res = await fetch(`/api/sessions/${currentSession.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules,
          answers: questionHistory,
          certainties: certArray
        })
      });

      if (!res.ok) {
        throw new Error('Save failed');
      }

      setLastSaved(new Date());
      showToast(`Saved! ${questionHistory.length} answers`);
    } catch (error) {
      console.error('Save failed:', error);
      showToast('Save failed!');
    }

    setSaving(false);
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const answerQuestion = (type: 'yes' | 'no' | 'detailed' | 'skip') => {
    const q = questions[currentQuestionIndex];
    if (!q) return;

    let response = type as string;
    if (type === 'detailed') {
      response = detailedAnswer.trim();
      if (!response) return;
    }

    const newHistory = [...questionHistory, {
      questionId: q.id,
      questionText: q.text,
      answer: response
    }];
    setQuestionHistory(newHistory);

    // Skip doesn't create rules, just moves to next question
    if (type === 'yes') {
      const rule: Rule = {
        type: q.type,
        vendor: q.vendor,
        tagType: q.type.includes('genre') ? 'genre' : 'decade',
        value: q.suggestedValue,
        certaintyPct: Math.min(95, q.existingPct + 10),
        reason: 'User confirmed'
      };

      const newRules = [...rules, rule];
      setRules(newRules);

      const newCertainty = { ...certainty };
      applyRuleToProducts(rule, vendors, newCertainty);
      setCertainty(newCertainty);
    }

    setDetailedAnswer('');
    setDiscogsAnalysis(null); // Clear Discogs analysis for next question

    // Check if we've hit a checkpoint (every 10 questions)
    if ((newHistory.length) % 10 === 0) {
      setShowCheckpoint(true);
      setTimeout(() => saveProgress(), 100);
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
      setTimeout(() => saveProgress(), 100);
    }
  };

  const continueAfterCheckpoint = () => {
    setShowCheckpoint(false);
    setDiscogsAnalysis(null); // Clear Discogs analysis for next question
    setCurrentQuestionIndex(prev => prev + 1);
  };

  const getAffectedProducts = (): Product[] => {
    const q = questions[currentQuestionIndex];
    if (!q) return [];

    const vendorData = vendors[q.vendor];
    if (!vendorData) return [];

    const tagType = q.type.includes('genre') ? 'existingGenre' : 'existingDecade';
    return vendorData.products.filter(p => !p[tagType]);
  };

  const fetchDiscogsData = async (productsToFetch: Product[]) => {
    // Filter out products we already have data for
    const needsFetch = productsToFetch.filter(p => discogsData[p.handle] === undefined);
    if (needsFetch.length === 0) return;

    setLoadingDiscogs(true);
    try {
      const res = await fetch('/api/discogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: needsFetch.slice(0, 10) }) // Limit to 10 (rate limits)
      });
      const data = await res.json();
      if (data.results) {
        setDiscogsData(prev => ({ ...prev, ...data.results }));
      }
    } catch (error) {
      console.error('Failed to fetch Discogs data:', error);
    }
    setLoadingDiscogs(false);
  };

  const analyzeQuestionWithDiscogs = async () => {
    const q = currentQuestion;
    if (!q) return;

    setAnalyzingQuestion(true);
    setDiscogsAnalysis(null);

    try {
      const vendorProducts = affectedProducts.map(p => ({ handle: p.handle, title: p.title }));
      const isGenreQuestion = q.type.includes('genre');

      const res = await fetch('/api/discogs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor: q.vendor,
          products: vendorProducts,
          suggestedGenre: isGenreQuestion ? q.suggestedValue : undefined,
          suggestedDecade: !isGenreQuestion ? q.suggestedValue : undefined,
        })
      });

      const analysis = await res.json();
      setDiscogsAnalysis(analysis);

      // Also update individual product data from the sample
      if (analysis.products) {
        const newData: Record<string, { year: number | null; genre: string | null; style: string | null }> = {};
        for (const p of analysis.products) {
          if (p.discogs) {
            newData[p.handle] = {
              year: p.discogs.year,
              genre: p.discogs.genre,
              style: p.discogs.style,
            };
          }
        }
        setDiscogsData(prev => ({ ...prev, ...newData }));
      }
    } catch (error) {
      console.error('Failed to analyze with Discogs:', error);
    }
    setAnalyzingQuestion(false);
  };

  // Get grouped meta-questions
  const getMetaQuestions = () => {
    const genreGroups: Record<string, { vendors: string[]; totalProducts: number }> = {};
    const decadeGroups: Record<string, { vendors: string[]; totalProducts: number }> = {};

    for (const q of questions) {
      const vendorData = vendors[q.vendor];
      const productCount = vendorData?.products.length || 0;

      if (q.type.includes('genre')) {
        if (!genreGroups[q.suggestedValue]) {
          genreGroups[q.suggestedValue] = { vendors: [], totalProducts: 0 };
        }
        genreGroups[q.suggestedValue].vendors.push(q.vendor);
        genreGroups[q.suggestedValue].totalProducts += productCount;
      } else {
        if (!decadeGroups[q.suggestedValue]) {
          decadeGroups[q.suggestedValue] = { vendors: [], totalProducts: 0 };
        }
        decadeGroups[q.suggestedValue].vendors.push(q.vendor);
        decadeGroups[q.suggestedValue].totalProducts += productCount;
      }
    }

    return {
      genres: Object.entries(genreGroups)
        .map(([value, data]) => ({ type: 'genre' as const, value, ...data }))
        .sort((a, b) => b.vendors.length - a.vendors.length),
      decades: Object.entries(decadeGroups)
        .map(([value, data]) => ({ type: 'decade' as const, value, ...data }))
        .sort((a, b) => b.vendors.length - a.vendors.length),
    };
  };

  // Verify meta-question with Discogs (sample vendors)
  const verifyMetaWithDiscogs = async (meta: { type: 'genre' | 'decade'; value: string; vendors: string[] }) => {
    setVerifyingMeta(true);
    setMetaVerification({});

    const results: Record<string, { confirmed: boolean; discogsGenre?: string; confidence?: number }> = {};

    // Sample up to 5 vendors
    const sampleVendors = meta.vendors.slice(0, 5);

    for (const vendor of sampleVendors) {
      const vendorData = vendors[vendor];
      if (!vendorData) continue;

      try {
        const sampleProducts = vendorData.products.slice(0, 3);
        const res = await fetch('/api/discogs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor,
            products: sampleProducts.map(p => ({ handle: p.handle, title: p.title })),
            suggestedGenre: meta.type === 'genre' ? meta.value : undefined,
            suggestedDecade: meta.type === 'decade' ? meta.value : undefined,
          })
        });

        const analysis = await res.json();

        if (meta.type === 'genre') {
          results[vendor] = {
            confirmed: (analysis.genreAnalysis?.confidence || 0) > 0,
            discogsGenre: analysis.genreAnalysis?.topGenre,
            confidence: analysis.genreAnalysis?.confidence,
          };
        } else {
          results[vendor] = {
            confirmed: (analysis.decadeAnalysis?.confidence || 0) > 0,
            discogsGenre: analysis.decadeAnalysis?.topDecade,
            confidence: analysis.decadeAnalysis?.confidence,
          };
        }
      } catch (error) {
        console.error(`Failed to verify ${vendor}:`, error);
        results[vendor] = { confirmed: false };
      }
    }

    setMetaVerification(results);
    setVerifyingMeta(false);
  };

  // Apply meta-question answer to all vendors
  const answerMetaQuestion = (answer: 'yes' | 'no' | 'skip') => {
    if (!selectedMetaQuestion) return;

    const { type, value, vendors: metaVendors } = selectedMetaQuestion;
    const tagType = type === 'genre' ? 'genre' : 'decade';
    const newHistory = [...questionHistory];
    const newRules = [...rules];
    const newCertainty = { ...certainty };

    for (const vendor of metaVendors) {
      const questionId = `vendor-${type}-${vendor}`;

      // Add to history
      newHistory.push({
        questionId,
        questionText: `Should all "${vendor}" products be "${value}"?`,
        answer,
      });

      // If yes, create rule and apply
      if (answer === 'yes') {
        const vendorData = vendors[vendor];
        if (!vendorData) continue;

        // Calculate existing percentage
        const existingCount = type === 'genre'
          ? vendorData.existingGenres[value] || 0
          : vendorData.existingDecades[value] || 0;
        const existingPct = Math.round(100 * existingCount / vendorData.products.length);

        const rule: Rule = {
          type: `vendor-${type}`,
          vendor,
          tagType,
          value,
          certaintyPct: Math.min(95, existingPct + 10),
          reason: 'User confirmed (meta-question)'
        };

        newRules.push(rule);
        applyRuleToProducts(rule, vendors, newCertainty);
      }
    }

    setQuestionHistory(newHistory);
    setRules(newRules);
    setCertainty(newCertainty);

    // Remove answered questions from queue
    const answeredIds = new Set(metaVendors.map(v => `vendor-${type}-${v}`));
    setQuestions(prev => prev.filter(q => !answeredIds.has(q.id)));

    // Close modal and save
    setSelectedMetaQuestion(null);
    setMetaVerification({});
    showToast(`Applied to ${metaVendors.length} vendors!`);
    setTimeout(() => saveProgress(), 100);
  };

  const getStats = () => {
    let high = 0, medium = 0, low = 0;

    for (const product of products) {
      const c = certainty[product.handle];
      const genreVal = c?.genre as CertaintyValue | undefined;
      const genrePct = genreVal?.pct || 0;

      if (genrePct >= 80) high++;
      else if (genrePct >= 50) medium++;
      else low++;
    }

    const pct = products.length > 0 ? Math.round(100 * high / products.length) : 0;
    return { high, medium, low, pct };
  };

  const getDetailedStats = () => {
    const stats = {
      genre: { total: products.length, certain: 0, high: 0, medium: 0, low: 0, none: 0 },
      decade: { total: products.length, certain: 0, high: 0, medium: 0, low: 0, none: 0 },
      overall: { questionsRemaining: questions.length, questionsAnswered: questionHistory.length }
    };

    for (const product of products) {
      const c = certainty[product.handle];

      // Genre stats
      const genreVal = c?.genre as CertaintyValue | undefined;
      const genrePct = genreVal?.pct || 0;
      if (genrePct === 100) stats.genre.certain++;
      else if (genrePct >= 80) stats.genre.high++;
      else if (genrePct >= 50) stats.genre.medium++;
      else if (genrePct > 0) stats.genre.low++;
      else stats.genre.none++;

      // Decade stats
      const decadeVal = c?.decade as CertaintyValue | undefined;
      const decadePct = decadeVal?.pct || 0;
      if (decadePct === 100) stats.decade.certain++;
      else if (decadePct >= 80) stats.decade.high++;
      else if (decadePct >= 50) stats.decade.medium++;
      else if (decadePct > 0) stats.decade.low++;
      else stats.decade.none++;
    }

    return stats;
  };

  const stats = getStats();
  const detailedStats = getDetailedStats();
  const currentQuestion = questions[currentQuestionIndex];
  const affectedProducts = getAffectedProducts();

  // Calculate progress percentages
  const genreProgress = products.length > 0
    ? Math.round(100 * (detailedStats.genre.certain + detailedStats.genre.high) / products.length)
    : 0;
  const decadeProgress = products.length > 0
    ? Math.round(100 * (detailedStats.decade.certain + detailedStats.decade.high) / products.length)
    : 0;

  // Get last 10 answers for checkpoint
  const getLastTenAnswers = () => {
    const start = Math.max(0, questionHistory.length - 10);
    return questionHistory.slice(start);
  };

  // Check if answer is detailed (not just yes/no)
  const isDetailedAnswer = (answer: string) => {
    return answer !== 'yes' && answer !== 'no';
  };

  // Session picker
  if (showSessionPicker) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 p-4 pb-safe">
        <div className="max-w-md mx-auto pt-safe sm:pt-8">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-black text-white drop-shadow-lg">🏷️ TAG QUEST</h1>
            <p className="text-white/80 text-sm mt-1">Level up your product tags!</p>
          </div>

          {/* Product Catalog Status */}
          <div className="bg-white/20 backdrop-blur rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-bold">Product Catalog</div>
                <div className="text-white/70 text-sm">
                  {catalogCount > 0 ? `${catalogCount.toLocaleString()} products loaded` : 'No products uploaded yet'}
                </div>
              </div>
              <button
                onClick={() => setShowCatalogManager(true)}
                className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-all"
              >
                {catalogCount > 0 ? 'Update' : 'Upload'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-5">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Choose Session</h2>

            {sessions.length > 0 && (
              <div className="mb-4 space-y-3">
                {sessions.map(s => (
                  <div
                    key={s.id}
                    className="relative p-4 sm:p-3 rounded-xl bg-gradient-to-r from-violet-50 to-fuchsia-50 border-2 border-violet-200 hover:border-violet-400 active:scale-[0.98] transition-all touch-manipulation"
                  >
                    {editingSessionId === s.id ? (
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveRename(s.id)}
                          className="flex-1 px-3 py-2 rounded-lg border border-violet-300 text-base text-black"
                          autoFocus
                        />
                        <button
                          onClick={() => saveRename(s.id)}
                          className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold active:scale-95"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingSessionId(null)}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg text-sm font-bold active:scale-95"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => catalogCount > 0 ? loadSession(s.id) : showToast('Upload products first!')}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-gray-800 text-base">{s.name}</div>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => startRenaming(s, e)}
                              className="p-2 text-gray-400 hover:text-violet-600 active:scale-90 transition-all"
                              title="Rename"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={(e) => deleteSession(s.id, e)}
                              className="p-2 text-gray-400 hover:text-red-500 active:scale-90 transition-all"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {s._count?.answers || 0} answered • {new Date(s.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => catalogCount > 0 ? createSession('Session ' + new Date().toLocaleDateString()) : showToast('Upload products first!')}
              className={`w-full p-4 sm:p-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-bold text-lg sm:text-base transition-all shadow-lg active:scale-95 touch-manipulation ${catalogCount > 0 ? 'hover:from-fuchsia-600 hover:to-violet-600' : 'opacity-70'}`}
            >
              🚀 New Session
            </button>
          </div>
        </div>

        {/* Catalog Manager Modal */}
        {showCatalogManager && (
          <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 z-50">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 pb-safe">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Product Catalog</h2>
                {!uploadingCatalog && (
                  <button onClick={() => setShowCatalogManager(false)} className="p-2 text-gray-400 text-2xl active:scale-90 transition-all">×</button>
                )}
              </div>

              <p className="text-gray-600 text-base sm:text-sm mb-4">
                Upload your Shopify CSV exports here. Products are stored globally and used by all sessions.
              </p>

              {catalogCount > 0 && !uploadingCatalog && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 sm:p-3 mb-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-emerald-800 font-medium text-base">{catalogCount.toLocaleString()} products</div>
                      <div className="text-emerald-600 text-sm sm:text-xs">in catalog</div>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm('Clear all products from catalog? This cannot be undone.')) {
                          await fetch('/api/products', { method: 'DELETE' });
                          setCatalogCount(0);
                          showToast('Catalog cleared');
                        }
                      }}
                      className="px-3 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-medium active:scale-95 transition-all"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}

              {!uploadingCatalog ? (
                <label className="block w-full p-4 sm:p-3 text-center bg-fuchsia-100 text-fuchsia-600 rounded-xl font-bold text-base cursor-pointer active:scale-95 transition-all touch-manipulation">
                  Choose CSV Files
                  <input
                    type="file"
                    multiple
                    accept=".csv"
                    onChange={e => e.target.files && uploadToCatalog(e.target.files)}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="bg-gray-100 rounded-xl p-4">
                  <div className="text-gray-800 font-medium text-center mb-3 flex items-center justify-center gap-2">
                    <span className="inline-block w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></span>
                    {uploadProgress.stage || 'Starting...'}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-500 transition-all duration-300"
                      style={{ width: `${uploadProgress.current}%` }}
                    />
                  </div>
                  <div className="text-violet-600 font-bold text-lg text-center mt-2">
                    {uploadProgress.current}%
                  </div>
                  <div className="text-gray-400 text-xs text-center mt-1">
                    Do not close this window
                  </div>
                </div>
              )}

              {!uploadingCatalog && (
                <button
                  onClick={() => setShowCatalogManager(false)}
                  className="w-full mt-4 p-4 sm:p-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-base active:scale-95 transition-all touch-manipulation"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main app
  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 p-3 pb-safe">
      {/* Toast */}
      {toast && (
        <div className="fixed top-safe right-3 bg-emerald-500 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm font-bold animate-bounce">
          {toast}
        </div>
      )}

      <div className="max-w-lg mx-auto pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl sm:text-2xl font-black text-white">🏷️ TAG QUEST</h1>
          <div className="flex items-center gap-2">
            {/* Sync indicator */}
            {lastSaved && (
              <span className="text-white/50 text-xs hidden sm:inline">
                saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={syncFromServer}
              disabled={syncing}
              className="p-2 text-white/70 hover:text-white active:scale-95 transition-all disabled:opacity-50"
              title="Sync from server"
            >
              <span className={syncing ? 'animate-spin inline-block' : ''}>🔄</span>
            </button>
            <button
              onClick={() => setShowMetaQuestions(true)}
              className="p-2 text-white/70 hover:text-white active:scale-95 transition-all"
              title="Meta questions"
            >
              ⚡
            </button>
            <button
              onClick={() => setShowDataExplorer(true)}
              className="p-2 text-white/70 hover:text-white active:scale-95 transition-all"
              title="Explore data"
            >
              🔍
            </button>
            <button
              onClick={() => setShowSessionPicker(true)}
              className="px-3 py-2 text-white/70 text-xs hover:text-white bg-white/10 rounded-lg active:scale-95 transition-all"
            >
              switch
            </button>
          </div>
        </div>

        {/* Progress to 100% */}
        {products.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Progress to 100%</h3>
              <button
                onClick={() => window.location.href = '/review'}
                className="text-violet-600 text-xs font-medium hover:underline"
              >
                Review Answers
              </button>
            </div>

            {/* Genre Progress */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Genres</span>
                <span className="text-sm font-bold text-emerald-600">{genreProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-300"
                  style={{ width: `${genreProgress}%` }}
                />
              </div>
              <div className="flex gap-3 mt-1 text-xs text-gray-500">
                <span className="text-emerald-600">● 100%: {detailedStats.genre.certain.toLocaleString()}</span>
                <span className="text-yellow-600">● 80-99%: {detailedStats.genre.high.toLocaleString()}</span>
                <span className="text-gray-400">● Needs work: {(detailedStats.genre.medium + detailedStats.genre.low + detailedStats.genre.none).toLocaleString()}</span>
              </div>
            </div>

            {/* Decade Progress */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Decades</span>
                <span className="text-sm font-bold text-blue-600">{decadeProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-300"
                  style={{ width: `${decadeProgress}%` }}
                />
              </div>
              <div className="flex gap-3 mt-1 text-xs text-gray-500">
                <span className="text-blue-600">● 100%: {detailedStats.decade.certain.toLocaleString()}</span>
                <span className="text-yellow-600">● 80-99%: {detailedStats.decade.high.toLocaleString()}</span>
                <span className="text-gray-400">● Needs work: {(detailedStats.decade.medium + detailedStats.decade.low + detailedStats.decade.none).toLocaleString()}</span>
              </div>
            </div>

            {/* Questions summary */}
            <div className="pt-3 border-t border-gray-100">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{questionHistory.length}</span> answered, <span className="font-medium">{questions.length}</span> to go
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator if no products */}
        {products.length === 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
            <div className="text-5xl mb-3">📦</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Loading Products...</h2>
            <p className="text-gray-500 text-sm">
              Fetching from catalog
            </p>
          </div>
        )}


        {/* Question */}
        {products.length > 0 && currentQuestion && (
          <div className="bg-white rounded-2xl shadow-xl p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm">
                  {questionHistory.length + 1}
                </div>
                <span className="text-xs text-gray-400 uppercase font-bold">Question</span>
              </div>
              <div className="bg-gradient-to-r from-amber-400 to-orange-400 text-white px-3 py-1 rounded-full text-xs font-bold">
                {currentQuestion.impact}
              </div>
            </div>

            <h2 className="text-lg font-bold text-black mb-2">{currentQuestion.text}</h2>
            <p className="text-gray-500 text-sm mb-3">{currentQuestion.context}</p>

            {/* Ask Discogs Button */}
            <button
              onClick={analyzeQuestionWithDiscogs}
              disabled={analyzingQuestion}
              className="w-full mb-3 p-3 bg-gradient-to-r from-orange-400 to-amber-500 text-white rounded-xl font-bold text-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {analyzingQuestion ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Asking Discogs...
                </>
              ) : (
                <>🎵 Ask Discogs</>
              )}
            </button>

            {/* Discogs Analysis Results */}
            {discogsAnalysis && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-sm font-bold text-amber-800 mb-2">Discogs Says:</div>

                {currentQuestion.type.includes('genre') ? (
                  <div className="space-y-2">
                    {discogsAnalysis.genreAnalysis?.topGenre && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Top Genre:</span>
                        <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded font-medium text-sm">
                          {discogsAnalysis.genreAnalysis.topGenre}
                        </span>
                      </div>
                    )}
                    {discogsAnalysis.styleAnalysis?.topStyle && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Top Style:</span>
                        <span className="px-2 py-1 bg-violet-100 text-violet-800 rounded font-medium text-sm">
                          {discogsAnalysis.styleAnalysis.topStyle}
                        </span>
                      </div>
                    )}
                    {(discogsAnalysis.genreAnalysis?.confidence ?? 0) > 0 && (
                      <div className="text-xs text-emerald-600 font-medium">
                        ✓ Matches suggestion with {discogsAnalysis.genreAnalysis?.confidence}% confidence
                      </div>
                    )}
                    {discogsAnalysis.genreAnalysis?.topGenre &&
                     (discogsAnalysis.genreAnalysis?.confidence ?? 0) === 0 &&
                     discogsAnalysis.genreAnalysis.topGenre.toLowerCase() !== currentQuestion.suggestedValue.toLowerCase() && (
                      <div className="text-xs text-amber-600 font-medium">
                        ⚠️ Discogs suggests &quot;{discogsAnalysis.genreAnalysis.topGenre}&quot; instead
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {discogsAnalysis.decadeAnalysis?.topDecade && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Top Decade:</span>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium text-sm">
                          {discogsAnalysis.decadeAnalysis.topDecade}
                        </span>
                      </div>
                    )}
                    {(discogsAnalysis.decadeAnalysis?.confidence ?? 0) > 0 && (
                      <div className="text-xs text-emerald-600 font-medium">
                        ✓ Matches suggestion with {discogsAnalysis.decadeAnalysis?.confidence}% confidence
                      </div>
                    )}
                    {discogsAnalysis.decadeAnalysis?.topDecade &&
                     (discogsAnalysis.decadeAnalysis?.confidence ?? 0) === 0 && (
                      <div className="text-xs text-amber-600 font-medium">
                        ⚠️ Discogs suggests &quot;{discogsAnalysis.decadeAnalysis.topDecade}&quot; instead
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <details
              className="mb-4 bg-gray-50 rounded-lg"
              onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open) {
                  fetchDiscogsData(affectedProducts);
                }
              }}
            >
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-violet-600">
                👁️ See {affectedProducts.length} products
                {loadingDiscogs && <span className="ml-2 text-gray-400">(loading from Discogs...)</span>}
              </summary>
              <div className="px-3 pb-3 max-h-48 overflow-y-auto text-xs">
                {affectedProducts.map(p => (
                  <div key={p.handle} className="py-2 border-b border-gray-100 last:border-0">
                    <div className="flex justify-between items-center">
                      <span className="text-black flex-1 mr-2">{p.title}</span>
                      {discogsData[p.handle]?.year && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {discogsData[p.handle].year}
                        </span>
                      )}
                    </div>
                    {discogsData[p.handle] && (discogsData[p.handle].genre || discogsData[p.handle].style) && (
                      <div className="flex gap-1 mt-1">
                        {discogsData[p.handle].genre && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                            {discogsData[p.handle].genre}
                          </span>
                        )}
                        {discogsData[p.handle].style && (
                          <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-xs">
                            {discogsData[p.handle].style}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>

            <div className="flex gap-3 mb-3">
              <button
                onClick={() => answerQuestion('yes')}
                className="flex-1 bg-gradient-to-r from-emerald-400 to-green-500 text-white py-4 sm:py-3 rounded-2xl font-bold text-xl sm:text-lg active:scale-95 hover:scale-105 transition-transform shadow-lg touch-manipulation"
              >
                👍 YES
              </button>
              <button
                onClick={() => answerQuestion('no')}
                className="flex-1 bg-gradient-to-r from-rose-400 to-red-500 text-white py-4 sm:py-3 rounded-2xl font-bold text-xl sm:text-lg active:scale-95 hover:scale-105 transition-transform shadow-lg touch-manipulation"
              >
                👎 NO
              </button>
            </div>

            <button
              onClick={() => answerQuestion('skip')}
              className="w-full mb-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm active:scale-95 transition-all touch-manipulation border-2 border-dashed border-gray-300"
            >
              🤔 I don&apos;t know (save for later)
            </button>

            <details className="text-sm">
              <summary className="cursor-pointer text-gray-400 text-xs">More options...</summary>
              <div className="mt-2">
                <textarea
                  value={detailedAnswer}
                  onChange={e => setDetailedAnswer(e.target.value)}
                  rows={2}
                  className="w-full border rounded-lg p-2 text-sm text-black"
                  placeholder="Explain..."
                />
                <button
                  onClick={() => answerQuestion('detailed')}
                  className="mt-2 bg-gray-700 text-white px-4 py-1 rounded-full text-xs font-bold"
                >
                  Submit
                </button>
              </div>
            </details>
          </div>
        )}

        {/* All done */}
        {products.length > 0 && !currentQuestion && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-3 text-center">
            <div className="text-5xl mb-2">🎉</div>
            <h2 className="text-xl font-bold text-gray-800">All Done!</h2>
            <p className="text-gray-500 text-sm">No more questions!</p>
          </div>
        )}

        {/* Actions - fixed at bottom on mobile */}
        {products.length > 0 && (
          <div className="flex gap-3 pb-4">
            <button
              onClick={saveProgress}
              disabled={saving}
              className="flex-1 bg-white/20 backdrop-blur text-white py-4 sm:py-3 rounded-xl font-bold text-base sm:text-sm active:scale-95 hover:bg-white/30 transition-all disabled:opacity-50 touch-manipulation"
            >
              {saving ? '⏳ Saving...' : '💾 Save'}
            </button>
            <button
              onClick={() => setShowPlaybook(true)}
              className="flex-1 bg-white text-violet-600 py-4 sm:py-3 rounded-xl font-bold text-base sm:text-sm active:scale-95 hover:bg-violet-50 transition-all touch-manipulation"
            >
              📋 Playbook
            </button>
          </div>
        )}
      </div>

      {/* Playbook Modal */}
      {showPlaybook && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] sm:max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">📋 Playbook</h2>
              <button onClick={() => setShowPlaybook(false)} className="p-2 text-gray-400 text-2xl active:scale-90 transition-all">×</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              {(() => {
                const groups: Record<string, string[]> = {};

                for (const product of products) {
                  const c = certainty[product.handle];
                  if (!c) continue;

                  for (const type of ['genre', 'decade'] as const) {
                    const val = c[type] as CertaintyValue;
                    if (val?.pct >= 80 && val?.source === 'rule') {
                      const key = `${type}:${val.value}`;
                      if (!groups[key]) groups[key] = [];
                      groups[key].push(product.handle);
                    }
                  }
                }

                const entries = Object.entries(groups);
                if (entries.length === 0) {
                  return <p className="text-gray-400 text-center py-4 text-sm">Keep answering to build your playbook!</p>;
                }

                return entries.map(([key, handles], idx) => {
                  const [type, value] = key.split(':');
                  const tag = type === 'genre' ? `Genre Parent: ${value}` : value;

                  return (
                    <div key={key} className="mb-4 border-l-4 border-violet-400 pl-3">
                      <div className="font-bold text-sm">Step {idx + 1}: Add &quot;{tag}&quot;</div>
                      <div className="text-gray-500 text-xs">{handles.length} products</div>
                      <details className="text-xs mt-1">
                        <summary className="cursor-pointer text-violet-500">Show handles</summary>
                        <pre className="mt-1 bg-gray-100 p-2 rounded text-xs overflow-auto max-h-24 text-black">
                          {handles.join('\n')}
                        </pre>
                      </details>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="p-4 border-t pb-safe">
              <button
                onClick={() => setShowPlaybook(false)}
                className="w-full bg-violet-500 text-white py-4 sm:py-3 rounded-xl font-bold text-lg sm:text-base active:scale-95 transition-all touch-manipulation"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkpoint Modal - Every 10 Questions */}
      {showCheckpoint && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b bg-gradient-to-r from-fuchsia-500 to-violet-500">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">🎯 Checkpoint!</h2>
                  <p className="text-white/80 text-sm">{questionHistory.length} questions answered</p>
                </div>
                <div className="text-4xl">🏆</div>
              </div>
            </div>

            <div className="p-4 overflow-y-auto max-h-[45vh]">
              {/* Progress Snapshot */}
              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <h3 className="font-bold text-gray-800 text-sm mb-2">Progress Snapshot</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-emerald-600">{genreProgress}%</div>
                    <div className="text-xs text-gray-500">Genres</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-blue-600">{decadeProgress}%</div>
                    <div className="text-xs text-gray-500">Decades</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-violet-600">{rules.length}</div>
                    <div className="text-xs text-gray-500">Rules Created</div>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-amber-600">{stats.high.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Products Tagged</div>
                  </div>
                </div>
              </div>

              {/* Last 10 Answers */}
              <div className="mb-4">
                <h3 className="font-bold text-gray-800 text-sm mb-2">Last 10 Answers</h3>
                <div className="space-y-2">
                  {getLastTenAnswers().map((answer, idx) => (
                    <div
                      key={answer.questionId}
                      className={`p-3 rounded-lg border ${
                        isDetailedAnswer(answer.answer)
                          ? 'bg-amber-50 border-amber-200'
                          : answer.answer === 'yes'
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-bold text-gray-400">
                          #{questionHistory.length - getLastTenAnswers().length + idx + 1}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm text-gray-800">{answer.questionText}</div>
                          <div className={`text-xs font-medium mt-1 ${
                            isDetailedAnswer(answer.answer)
                              ? 'text-amber-600'
                              : answer.answer === 'yes'
                              ? 'text-emerald-600'
                              : 'text-gray-500'
                          }`}>
                            {isDetailedAnswer(answer.answer) ? (
                              <span>📝 {answer.answer}</span>
                            ) : answer.answer === 'yes' ? (
                              <span>✓ Yes</span>
                            ) : (
                              <span>✗ No</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes for Later */}
              <div>
                <h3 className="font-bold text-gray-800 text-sm mb-2">Notes for Later</h3>
                <textarea
                  value={checkpointNotes}
                  onChange={e => setCheckpointNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-black placeholder-gray-400"
                  placeholder="Jot down thoughts about API integrations (Discogs/MusicBrainz), edge cases, or things to revisit..."
                />
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 pb-safe">
              <div className="flex gap-3">
                <button
                  onClick={continueAfterCheckpoint}
                  className="flex-1 bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white py-4 sm:py-3 rounded-xl font-bold text-base active:scale-95 transition-all touch-manipulation"
                >
                  Continue Answering
                </button>
                <button
                  onClick={() => {
                    setShowCheckpoint(false);
                    window.location.href = '/review';
                  }}
                  className="flex-1 bg-white border-2 border-violet-500 text-violet-600 py-4 sm:py-3 rounded-xl font-bold text-base active:scale-95 transition-all touch-manipulation"
                >
                  Review Answers
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Explorer Modal */}
      {showDataExplorer && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">🔍 Data Explorer</h2>
              <button onClick={() => setShowDataExplorer(false)} className="p-2 text-gray-400 text-2xl">×</button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[70vh]">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-violet-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-violet-600">{Object.keys(vendors).length}</div>
                  <div className="text-xs text-gray-500">Vendors</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{products.length.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Products</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600">{questions.length}</div>
                  <div className="text-xs text-gray-500">Questions Left</div>
                </div>
              </div>

              {/* Suspicious Vendors */}
              <div className="mb-4">
                <h3 className="font-bold text-gray-800 text-sm mb-2">⚠️ Suspicious Vendor Names</h3>
                <p className="text-xs text-gray-500 mb-2">These look like tag remnants or data issues:</p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {(() => {
                    const suspicious = Object.keys(vendors).filter(v => {
                      const lower = v.toLowerCase();
                      return (
                        v.includes(':') ||
                        v.includes('Cat:') ||
                        v.includes('Genre') ||
                        lower.includes('various') ||
                        lower.includes('unknown') ||
                        v.length < 2 ||
                        /^\d+$/.test(v) ||
                        /^[^a-zA-Z]*$/.test(v)
                      );
                    });

                    if (suspicious.length === 0) {
                      return <p className="text-gray-400 text-sm">No suspicious vendors found</p>;
                    }

                    return suspicious.map(v => (
                      <div key={v} className="flex justify-between items-center py-1 border-b border-red-100 last:border-0">
                        <span className="text-red-800 text-sm font-mono">{v}</span>
                        <span className="text-red-600 text-xs">{vendors[v].products.length} products</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Skipped Questions */}
              <div className="mb-4">
                <h3 className="font-bold text-gray-800 text-sm mb-2">🤔 Skipped Questions (Need Research)</h3>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {(() => {
                    const skipped = questionHistory.filter(a => a.answer === 'skip');
                    if (skipped.length === 0) {
                      return <p className="text-gray-400 text-sm">No skipped questions yet</p>;
                    }
                    return skipped.map(q => (
                      <div key={q.questionId} className="py-1 border-b border-gray-100 last:border-0">
                        <span className="text-gray-700 text-sm">{q.questionText}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Question Efficiency Ideas */}
              <div className="mb-4">
                <h3 className="font-bold text-gray-800 text-sm mb-2">💡 Higher-Level Patterns</h3>
                <p className="text-xs text-gray-500 mb-2">Instead of per-vendor questions, we could ask:</p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2 text-sm">
                  {(() => {
                    // Group questions by suggested value
                    const genreGroups: Record<string, string[]> = {};
                    const decadeGroups: Record<string, string[]> = {};

                    for (const q of questions) {
                      if (q.type.includes('genre')) {
                        if (!genreGroups[q.suggestedValue]) genreGroups[q.suggestedValue] = [];
                        genreGroups[q.suggestedValue].push(q.vendor);
                      } else {
                        if (!decadeGroups[q.suggestedValue]) decadeGroups[q.suggestedValue] = [];
                        decadeGroups[q.suggestedValue].push(q.vendor);
                      }
                    }

                    const topGenres = Object.entries(genreGroups)
                      .sort((a, b) => b[1].length - a[1].length)
                      .slice(0, 3);

                    const topDecades = Object.entries(decadeGroups)
                      .sort((a, b) => b[1].length - a[1].length)
                      .slice(0, 3);

                    return (
                      <>
                        {topGenres.map(([genre, vendorList]) => (
                          <div key={genre} className="text-emerald-800">
                            <span className="font-medium">&quot;All {vendorList.length} vendors suggesting {genre}&quot;</span>
                            <span className="text-emerald-600 text-xs ml-2">→ 1 question instead of {vendorList.length}</span>
                          </div>
                        ))}
                        {topDecades.map(([decade, vendorList]) => (
                          <div key={decade} className="text-blue-800">
                            <span className="font-medium">&quot;All {vendorList.length} vendors suggesting {decade}&quot;</span>
                            <span className="text-blue-600 text-xs ml-2">→ 1 question instead of {vendorList.length}</span>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* All Vendors List */}
              <details className="mb-4">
                <summary className="font-bold text-gray-800 text-sm cursor-pointer">📋 All Vendors ({Object.keys(vendors).length})</summary>
                <div className="mt-2 bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto">
                  {Object.entries(vendors)
                    .sort((a, b) => b[1].products.length - a[1].products.length)
                    .map(([vendor, data]) => (
                      <div key={vendor} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                        <span className="text-gray-800 text-sm">{vendor}</span>
                        <span className="text-gray-500 text-xs">{data.products.length} products</span>
                      </div>
                    ))}
                </div>
              </details>
            </div>

            <div className="p-4 border-t pb-safe">
              <button
                onClick={() => setShowDataExplorer(false)}
                className="w-full bg-violet-500 text-white py-3 rounded-xl font-bold active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meta Questions Modal */}
      {showMetaQuestions && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b bg-gradient-to-r from-amber-500 to-orange-500">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">⚡ Meta Questions</h2>
                  <p className="text-white/80 text-sm">Answer once, apply to many vendors</p>
                </div>
                <button onClick={() => setShowMetaQuestions(false)} className="p-2 text-white/70 text-2xl">×</button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {(() => {
                const meta = getMetaQuestions();
                const allMeta = [...meta.genres, ...meta.decades].filter(m => m.vendors.length > 1);

                if (allMeta.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <div className="text-4xl mb-2">🎯</div>
                      <p className="text-gray-500">No meta-questions available</p>
                      <p className="text-gray-400 text-sm">All remaining questions are unique</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {allMeta.map((m) => (
                      <button
                        key={`${m.type}-${m.value}`}
                        onClick={() => {
                          setSelectedMetaQuestion(m);
                          setMetaVerification({});
                        }}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                          m.type === 'genre'
                            ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-400'
                            : 'border-blue-200 bg-blue-50 hover:border-blue-400'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className={`text-sm font-bold ${m.type === 'genre' ? 'text-emerald-800' : 'text-blue-800'}`}>
                              {m.type === 'genre' ? '🎵' : '📅'} All &quot;{m.value}&quot; vendors
                            </div>
                            <div className="text-gray-600 text-sm mt-1">
                              {m.vendors.length} vendors • {m.totalProducts.toLocaleString()} products
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                            m.type === 'genre' ? 'bg-emerald-200 text-emerald-800' : 'bg-blue-200 text-blue-800'
                          }`}>
                            {m.vendors.length}x faster
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t pb-safe">
              <button
                onClick={() => setShowMetaQuestions(false)}
                className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-bold active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Meta Question Detail */}
      {selectedMetaQuestion && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
            <div className={`p-4 border-b ${
              selectedMetaQuestion.type === 'genre'
                ? 'bg-gradient-to-r from-emerald-500 to-green-500'
                : 'bg-gradient-to-r from-blue-500 to-indigo-500'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {selectedMetaQuestion.type === 'genre' ? '🎵' : '📅'} Tag as &quot;{selectedMetaQuestion.value}&quot;?
                  </h2>
                  <p className="text-white/80 text-sm">
                    {selectedMetaQuestion.vendors.length} vendors • {selectedMetaQuestion.totalProducts.toLocaleString()} products
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedMetaQuestion(null);
                    setMetaVerification({});
                  }}
                  className="p-2 text-white/70 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto max-h-[45vh]">
              {/* Verify with Discogs */}
              <button
                onClick={() => verifyMetaWithDiscogs(selectedMetaQuestion)}
                disabled={verifyingMeta}
                className="w-full mb-4 p-3 bg-gradient-to-r from-orange-400 to-amber-500 text-white rounded-xl font-bold text-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {verifyingMeta ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Verifying with Discogs...
                  </>
                ) : (
                  <>🎵 Verify with Discogs (sample 5 vendors)</>
                )}
              </button>

              {/* Verification Results */}
              {Object.keys(metaVerification).length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                  <h3 className="font-bold text-gray-800 text-sm mb-2">Discogs Verification:</h3>
                  <div className="space-y-2">
                    {Object.entries(metaVerification).map(([vendor, result]) => (
                      <div key={vendor} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate flex-1 mr-2">{vendor}</span>
                        {result.confirmed ? (
                          <span className="text-emerald-600 font-medium">✓ Confirmed</span>
                        ) : result.discogsGenre ? (
                          <span className="text-amber-600 font-medium">⚠️ {result.discogsGenre}</span>
                        ) : (
                          <span className="text-gray-400">? No data</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const confirmed = Object.values(metaVerification).filter(v => v.confirmed).length;
                    const total = Object.keys(metaVerification).length;
                    return (
                      <div className={`mt-2 text-sm font-medium ${
                        confirmed === total ? 'text-emerald-600' :
                        confirmed > total / 2 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {confirmed}/{total} vendors confirmed by Discogs
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Vendor List */}
              <details className="mb-4">
                <summary className="cursor-pointer font-bold text-gray-800 text-sm">
                  📋 All {selectedMetaQuestion.vendors.length} vendors
                </summary>
                <div className="mt-2 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {selectedMetaQuestion.vendors.map(v => (
                    <div key={v} className="py-1 border-b border-gray-100 last:border-0 text-sm text-gray-700">
                      {v}
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div className="p-4 border-t bg-gray-50 pb-safe">
              <div className="flex gap-3 mb-3">
                <button
                  onClick={() => answerMetaQuestion('yes')}
                  className="flex-1 bg-gradient-to-r from-emerald-400 to-green-500 text-white py-4 rounded-xl font-bold text-lg active:scale-95 transition-transform shadow-lg"
                >
                  👍 YES to all
                </button>
                <button
                  onClick={() => answerMetaQuestion('no')}
                  className="flex-1 bg-gradient-to-r from-rose-400 to-red-500 text-white py-4 rounded-xl font-bold text-lg active:scale-95 transition-transform shadow-lg"
                >
                  👎 NO to all
                </button>
              </div>
              <button
                onClick={() => answerMetaQuestion('skip')}
                className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-medium text-sm active:scale-95 transition-all border-2 border-dashed border-gray-300"
              >
                🤔 Skip all for now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

