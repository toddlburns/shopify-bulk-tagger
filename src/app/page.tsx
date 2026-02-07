'use client';

import { useState, useEffect, useCallback } from 'react';

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
  const [uploadingCatalog, setUploadingCatalog] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    fetch('/api/sessions')
      .then(res => res.json())
      .then(setSessions)
      .catch(console.error);

    // Fetch catalog count
    fetch('/api/products')
      .then(res => res.json())
      .then((data: Product[]) => setCatalogCount(data.length))
      .catch(console.error);
  }, []);

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
    const newProducts: Product[] = [];
    const seen = new Set<string>();

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

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: newProducts })
    });
    const result = await res.json();

    setCatalogCount(result.total);
    setUploadingCatalog(false);
    setShowCatalogManager(false);
    showToast(`Catalog updated: ${result.total} products`);
  };

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

    await fetch(`/api/sessions/${currentSession.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rules,
        answers: questionHistory,
        certainties: certArray,
        products: products.map(p => ({
          handle: p.handle,
          title: p.title,
          vendor: p.vendor,
          existingGenre: p.existingGenre,
          existingSubgenre: p.existingSubgenre,
          existingDecade: p.existingDecade
        }))
      })
    });

    setSaving(false);
    showToast(`Saved! ${questionHistory.length} Qs answered`);
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const answerQuestion = (type: 'yes' | 'no' | 'detailed') => {
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

    setCurrentQuestionIndex(prev => prev + 1);
    setDetailedAnswer('');
    setTimeout(() => saveProgress(), 100);
  };

  const getAffectedProducts = (): Product[] => {
    const q = questions[currentQuestionIndex];
    if (!q) return [];

    const vendorData = vendors[q.vendor];
    if (!vendorData) return [];

    const tagType = q.type.includes('genre') ? 'existingGenre' : 'existingDecade';
    return vendorData.products.filter(p => !p[tagType]);
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

  const stats = getStats();
  const currentQuestion = questions[currentQuestionIndex];
  const affectedProducts = getAffectedProducts();
  const withGenre = products.filter(p => p.existingGenre).length;
  const withDecade = products.filter(p => p.existingDecade).length;

  // Session picker
  if (showSessionPicker) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 p-4">
        <div className="max-w-md mx-auto pt-8">
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
              <div className="mb-4 space-y-2">
                {sessions.map(s => (
                  <div
                    key={s.id}
                    className="relative p-3 rounded-xl bg-gradient-to-r from-violet-50 to-fuchsia-50 border-2 border-violet-200 hover:border-violet-400 transition-all"
                  >
                    {editingSessionId === s.id ? (
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveRename(s.id)}
                          className="flex-1 px-2 py-1 rounded border border-violet-300 text-sm text-black"
                          autoFocus
                        />
                        <button
                          onClick={() => saveRename(s.id)}
                          className="px-2 py-1 bg-emerald-500 text-white rounded text-xs font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingSessionId(null)}
                          className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs font-bold"
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
                          <div className="font-semibold text-gray-800">{s.name}</div>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => startRenaming(s, e)}
                              className="p-1 text-gray-400 hover:text-violet-600 transition-colors"
                              title="Rename"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={(e) => deleteSession(s.id, e)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
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
              className={`w-full p-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-bold transition-all shadow-lg ${catalogCount > 0 ? 'hover:from-fuchsia-600 hover:to-violet-600' : 'opacity-70'}`}
            >
              🚀 New Session
            </button>
          </div>
        </div>

        {/* Catalog Manager Modal */}
        {showCatalogManager && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Product Catalog</h2>
                <button onClick={() => setShowCatalogManager(false)} className="text-gray-400 text-2xl">×</button>
              </div>

              <p className="text-gray-600 text-sm mb-4">
                Upload your Shopify CSV exports here. Products are stored globally and used by all sessions.
              </p>

              {catalogCount > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                  <div className="text-emerald-800 font-medium">{catalogCount.toLocaleString()} products in catalog</div>
                  <div className="text-emerald-600 text-xs">Uploading new CSVs will update existing products</div>
                </div>
              )}

              <input
                type="file"
                multiple
                accept=".csv"
                onChange={e => e.target.files && uploadToCatalog(e.target.files)}
                disabled={uploadingCatalog}
                className="w-full text-sm file:mr-2 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-bold file:bg-fuchsia-100 file:text-fuchsia-600 hover:file:bg-fuchsia-200 file:cursor-pointer disabled:opacity-50"
              />

              {uploadingCatalog && (
                <div className="mt-4 text-center text-violet-600 font-medium">
                  Uploading products...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main app
  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-700 p-3">
      {/* Toast */}
      {toast && (
        <div className="fixed top-3 right-3 bg-emerald-500 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm font-bold animate-bounce">
          ✓ {toast}
        </div>
      )}

      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-black text-white">🏷️ TAG QUEST</h1>
          <button
            onClick={() => setShowSessionPicker(true)}
            className="text-white/70 text-xs hover:text-white"
          >
            switch
          </button>
        </div>

        {/* Stats */}
        {products.length > 0 && (
          <div className="bg-white/20 backdrop-blur rounded-xl p-3 mb-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 bg-white/30 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-400 to-emerald-400 transition-all"
                  style={{ width: `${stats.pct}%` }}
                />
              </div>
              <span className="text-white font-bold text-sm">{stats.pct}%</span>
            </div>
            <div className="flex justify-between text-xs text-white/80">
              <span>🎯 {questionHistory.length} answered</span>
              <span>📦 {products.length} products</span>
              <span>✅ {stats.high} done</span>
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

        {/* Summary */}
        {products.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-4 mb-3">
            <div className="flex gap-3">
              <div className="flex-1 bg-emerald-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-emerald-600">
                  {Math.round(100 * withGenre / products.length)}%
                </div>
                <div className="text-xs text-gray-500">genres</div>
              </div>
              <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-blue-600">
                  {Math.round(100 * withDecade / products.length)}%
                </div>
                <div className="text-xs text-gray-500">decades</div>
              </div>
            </div>
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

            <details className="mb-4 bg-gray-50 rounded-lg">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-violet-600">
                👁️ See {affectedProducts.length} products
              </summary>
              <div className="px-3 pb-3 max-h-32 overflow-y-auto text-xs text-black">
                {affectedProducts.map(p => (
                  <div key={p.handle} className="py-1 border-b border-gray-100 last:border-0">
                    {p.title}
                  </div>
                ))}
              </div>
            </details>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => answerQuestion('yes')}
                className="flex-1 bg-gradient-to-r from-emerald-400 to-green-500 text-white py-3 rounded-xl font-bold text-lg hover:scale-105 transition-transform shadow-lg"
              >
                👍 YES
              </button>
              <button
                onClick={() => answerQuestion('no')}
                className="flex-1 bg-gradient-to-r from-rose-400 to-red-500 text-white py-3 rounded-xl font-bold text-lg hover:scale-105 transition-transform shadow-lg"
              >
                👎 NO
              </button>
            </div>

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

        {/* Actions */}
        {products.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={saveProgress}
              disabled={saving}
              className="flex-1 bg-white/20 backdrop-blur text-white py-3 rounded-xl font-bold text-sm hover:bg-white/30 transition-all disabled:opacity-50"
            >
              💾 {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setShowPlaybook(true)}
              className="flex-1 bg-white text-violet-600 py-3 rounded-xl font-bold text-sm hover:bg-violet-50 transition-all"
            >
              📋 Playbook
            </button>
          </div>
        )}
      </div>

      {/* Playbook Modal */}
      {showPlaybook && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">📋 Playbook</h2>
              <button onClick={() => setShowPlaybook(false)} className="text-gray-400 text-2xl">×</button>
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
            <div className="p-4 border-t">
              <button
                onClick={() => setShowPlaybook(false)}
                className="w-full bg-violet-500 text-white py-2 rounded-xl font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
