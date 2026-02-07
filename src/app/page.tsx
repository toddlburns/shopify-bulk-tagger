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
  _count?: { rules: number; answers: number };
  rules?: Rule[];
  answers?: Answer[];
  certainties?: Array<{
    handle: string;
    tagType: string;
    value: string;
    pct: number;
    source: string;
  }>;
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
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    fetch('/api/sessions')
      .then(res => res.json())
      .then(setSessions)
      .catch(console.error);
  }, []);

  // Generate questions when products change
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
              context: `${topGenre[1]} of ${total} products already have this tag.`,
              impact: `Would tag ${missingGenre} more products`,
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
              context: `${topDecade[1]} of ${total} products already have this decade.`,
              impact: `Would tag ${missingDecade} more products`,
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

    // Filter out already answered
    const filtered = newQuestions.filter(q => !questionHistory.find(h => h.questionId === q.id));
    setQuestions(filtered);
    setCurrentQuestionIndex(0);
  }, [vendors, questionHistory]);

  useEffect(() => {
    if (Object.keys(vendors).length > 0) {
      generateQuestions();
    }
  }, [vendors, generateQuestions]);

  // Parse CSV helper
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

  // Load CSV files
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

    // Re-apply saved rules
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

  // Create new session
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
  };

  // Load existing session
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

    // Rebuild certainty from saved data
    const certMap: Record<string, CertaintyData> = {};
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
    setCertainty(certMap);

    setShowSessionPicker(false);
  };

  // Save progress
  const saveProgress = async () => {
    if (!currentSession) return;

    setSaving(true);

    // Convert certainty map to array
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
        certainties: certArray
      })
    });

    setSaving(false);
    showToast(`Saved! ${questionHistory.length} questions, ${rules.length} rules`);
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Answer question
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

      // Apply rule
      const newCertainty = { ...certainty };
      applyRuleToProducts(rule, vendors, newCertainty);
      setCertainty(newCertainty);
    }

    setCurrentQuestionIndex(prev => prev + 1);
    setDetailedAnswer('');

    // Auto-save
    setTimeout(() => saveProgress(), 100);
  };

  // Get affected products for current question
  const getAffectedProducts = (): Product[] => {
    const q = questions[currentQuestionIndex];
    if (!q) return [];

    const vendorData = vendors[q.vendor];
    if (!vendorData) return [];

    const tagType = q.type.includes('genre') ? 'existingGenre' : 'existingDecade';
    return vendorData.products.filter(p => !p[tagType]);
  };

  // Calculate stats
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

  // Session picker view
  if (showSessionPicker) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-white mb-2">Tag Quest</h1>
            <p className="text-gray-400 text-lg">Answer questions. Build certainty. Tag everything.</p>
          </div>

          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8">
            <h2 className="text-2xl font-bold mb-6">Choose a Session</h2>

            {sessions.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Continue Previous</h3>
                <div className="space-y-2">
                  {sessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => loadSession(s.id)}
                      className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-purple-500 transition-all flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-sm text-gray-500">
                          {s._count?.answers || 0} questions answered, {s._count?.rules || 0} rules
                        </div>
                      </div>
                      <div className="text-sm text-gray-400">
                        {new Date(s.updatedAt).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Start Fresh</h3>
              <button
                onClick={() => createSession('Session ' + new Date().toLocaleDateString())}
                className="w-full p-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all"
              >
                + New Session
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main app view
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-fade-in">
          <span className="text-2xl">✓</span>
          <div className="font-bold">{toast}</div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">Tag Quest</h1>
          <p className="text-gray-400 text-lg">
            {currentSession?.name}
            <button
              onClick={() => setShowSessionPicker(true)}
              className="ml-3 text-purple-400 hover:text-purple-300 text-sm"
            >
              (switch)
            </button>
          </p>
        </div>

        {/* Stats Bar */}
        {products.length > 0 && (
          <div className="mb-6">
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-white font-semibold">Overall Progress</span>
                <span className="text-green-400 font-bold">{stats.pct}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${stats.pct}%` }}
                />
              </div>
              <div className="text-gray-400 text-xs mt-2">
                {questionHistory.length} questions answered
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-white">{products.length}</div>
                <div className="text-gray-400 text-sm">Products</div>
              </div>
              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-green-400">{stats.high}</div>
                <div className="text-gray-400 text-sm">High Certainty</div>
              </div>
              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-yellow-400">{stats.medium}</div>
                <div className="text-gray-400 text-sm">Medium</div>
              </div>
              <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-red-400">{stats.low}</div>
                <div className="text-gray-400 text-sm">Needs Work</div>
              </div>
            </div>
          </div>
        )}

        {/* Load Section */}
        {products.length === 0 && (
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 text-center mb-6">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-2xl font-bold mb-4">Load Your Products</h2>
            <p className="text-gray-600 mb-6">
              {questionHistory.length > 0
                ? `You have ${questionHistory.length} saved answers. Load your CSVs to continue.`
                : 'Drop your Shopify product export CSVs to begin'}
            </p>
            <div className="flex gap-4 justify-center items-center">
              <input
                type="file"
                multiple
                accept=".csv"
                onChange={e => e.target.files && loadData(e.target.files)}
                className="text-sm file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:font-semibold file:bg-violet-100 file:text-violet-700 hover:file:bg-violet-200 file:cursor-pointer file:transition-all"
              />
            </div>
          </div>
        )}

        {/* Summary Section */}
        {products.length > 0 && (
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">📊</span> What I Found
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4">
                <div className="text-3xl font-bold text-green-600">
                  {Math.round(100 * withGenre / products.length)}%
                </div>
                <div className="text-gray-600">have genre tags</div>
              </div>
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4">
                <div className="text-3xl font-bold text-blue-600">
                  {Math.round(100 * withDecade / products.length)}%
                </div>
                <div className="text-gray-600">have decade tags</div>
              </div>
            </div>
          </div>
        )}

        {/* Question Section */}
        {products.length > 0 && currentQuestion && (
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl">
                  {questionHistory.length + 1}
                </div>
                <div className="text-sm text-gray-500">QUESTION</div>
              </div>
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 rounded-full text-sm font-semibold animate-bounce">
                {currentQuestion.affectedCount} products
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-3 text-black">{currentQuestion.text}</h2>
            <p className="text-gray-600 mb-2">{currentQuestion.context}</p>
            <p className="text-blue-600 text-sm mb-2">{currentQuestion.impact}</p>

            <details className="mb-6 bg-gray-50 rounded-xl">
              <summary className="cursor-pointer px-4 py-3 font-medium text-violet-600 hover:text-violet-800">
                Show affected products ({affectedProducts.length})
              </summary>
              <div className="px-4 pb-4 max-h-48 overflow-y-auto text-sm">
                {affectedProducts.map(p => (
                  <div key={p.handle} className="py-1 border-b border-gray-200 last:border-0">
                    <span className="font-medium">{p.title}</span>
                  </div>
                ))}
              </div>
            </details>

            <div className="flex gap-4 mb-6">
              <button
                onClick={() => answerQuestion('yes')}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:from-green-600 hover:to-emerald-700 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                Yes
              </button>
              <button
                onClick={() => answerQuestion('no')}
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 text-white py-4 rounded-xl font-bold text-lg hover:from-red-600 hover:to-rose-700 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                No
              </button>
            </div>

            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or explain in detail:
              </label>
              <textarea
                value={detailedAnswer}
                onChange={e => setDetailedAnswer(e.target.value)}
                rows={2}
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 focus:outline-none transition-all"
                placeholder="e.g., 'Only their 70s albums' or 'Check Discogs for each release'"
              />
              <button
                onClick={() => answerQuestion('detailed')}
                className="mt-3 bg-gray-700 text-white px-6 py-2 rounded-full text-sm font-semibold hover:bg-gray-800 transition-all"
              >
                Submit Detailed Answer
              </button>
            </div>
          </div>
        )}

        {/* All done message */}
        {products.length > 0 && !currentQuestion && (
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 mb-6 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2">All Done!</h2>
            <p className="text-gray-600">No more questions based on current data patterns.</p>
          </div>
        )}

        {/* Action Buttons */}
        {products.length > 0 && (
          <div className="flex gap-4">
            <button
              onClick={saveProgress}
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
            >
              <span className="text-xl">💾</span>
              {saving ? 'Saving...' : 'Save Progress'}
            </button>
            <button
              onClick={() => setShowPlaybook(true)}
              className="flex-1 bg-white text-gray-800 py-4 rounded-xl font-bold border-2 border-gray-200 hover:border-violet-500 transition-all flex items-center justify-center gap-2"
            >
              <span className="text-xl">📋</span> Generate Playbook
            </button>
          </div>
        )}
      </div>

      {/* Playbook Modal */}
      {showPlaybook && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-2xl font-bold">📋 Bulk Edit Playbook</h2>
              <button
                onClick={() => setShowPlaybook(false)}
                className="text-gray-500 hover:text-gray-700 text-3xl"
              >
                x
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[50vh]">
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
                  return (
                    <p className="text-gray-500 text-center py-8">
                      No high-certainty tags ready yet. Keep answering questions!
                    </p>
                  );
                }

                return entries.map(([key, handles], idx) => {
                  const [type, value] = key.split(':');
                  const tag = type === 'genre' ? `Genre Parent: ${value}` : value;

                  return (
                    <div key={key} className="mb-6 border-l-4 border-violet-500 pl-4">
                      <div className="font-bold text-lg mb-1">Step {idx + 1}: Add &quot;{tag}&quot;</div>
                      <div className="text-gray-600 mb-2">{handles.length} products</div>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-violet-600 font-medium">Show handles</summary>
                        <pre className="mt-2 bg-gray-100 p-3 rounded-lg text-xs overflow-auto max-h-32">
                          {handles.join('\n')}
                        </pre>
                      </details>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="p-6 border-t flex gap-4">
              <button
                onClick={() => {
                  const content = document.querySelector('.overflow-y-auto')?.textContent || '';
                  navigator.clipboard.writeText(content);
                }}
                className="flex-1 bg-gray-200 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-all"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowPlaybook(false)}
                className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 rounded-xl font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease;
        }
      `}</style>
    </div>
  );
}
