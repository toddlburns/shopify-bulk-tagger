'use client';

import { useState, useMemo } from 'react';

// Valid taxonomy
const VALID_GENRES: Record<string, string> = {
  'Alternative & Indie Rock': 'Genre Parent: Alternative & Indie Rock',
  'Classic Pop': 'Genre Parent: Classic Pop',
  'Classic Rock': 'Genre Parent: Classic Rock',
  'Classical': 'Genre Parent: Classical',
  'Country': 'Genre Parent: Country',
  'Electronic & Dance': 'Genre Parent: Electronic & Dance',
  'Hip-Hop': 'Genre Parent: Hip-Hop',
  'Holiday': 'Genre Parent: Holiday',
  'Jazz': 'Genre Parent: Jazz',
  'K-Pop / J-Pop': 'Genre Parent: K-Pop / J-Pop',
  'Latin': 'Genre Parent: Latin',
  'Metal / Punk / Hard Rock': 'Genre Parent: Metal / Punk / Hard Rock',
  'Modern Pop': 'Genre Parent: Modern Pop',
  'Modern Rock': 'Genre Parent: Modern Rock',
  'R&B / Soul / Funk': 'Genre Parent: R&B / Soul / Funk',
  'Reggae / World / International': 'Genre Parent: Reggae / World / International',
  'Soundtracks': 'Genre Parent: Soundtracks',
};

const VALID_DECADES = ['50C', '60C', '70C', '80C', '90C', '2000c', '2010c', '2020c'];

interface Product {
  handle: string;
  title: string;
  vendor: string;
  tags: string;
  parsedGenre: string | null;
  parsedSubgenre: string | null;
  parsedDecade: string | null;
  hasGenre: boolean;
  hasSubgenre: boolean;
  hasDecade: boolean;
  rawTagsList: string[];
  parsingNotes: string[];
}

interface AuditStats {
  total: number;
  withGenre: number;
  withSubgenre: number;
  withDecade: number;
  complete: number; // has all three
  missingAll: number;
  missingGenreOnly: number;
  missingSubgenreOnly: number;
  missingDecadeOnly: number;
}

type FilterType = 'all' | 'complete' | 'missing-genre' | 'missing-subgenre' | 'missing-decade' | 'missing-all';

export default function AuditPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, stage: '' });
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [verificationMode, setVerificationMode] = useState(false);
  const [verificationSample, setVerificationSample] = useState<Product[]>([]);

  // Parse tags from a product's tag string
  const parseTags = (tagString: string): {
    genre: string | null;
    subgenre: string | null;
    decade: string | null;
    allTags: string[];
    notes: string[];
  } => {
    const notes: string[] = [];
    const allTags = tagString
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    let genre: string | null = null;
    let subgenre: string | null = null;
    let decade: string | null = null;

    for (const tag of allTags) {
      // Check for Genre Parent
      if (tag.toLowerCase().startsWith('genre parent:')) {
        const value = tag.substring('genre parent:'.length).trim();
        // Validate against known genres
        const matchedGenre = Object.keys(VALID_GENRES).find(
          g => g.toLowerCase() === value.toLowerCase()
        );
        if (matchedGenre) {
          genre = matchedGenre;
        } else {
          genre = value; // Keep it but note it's non-standard
          notes.push(`Non-standard genre: "${value}"`);
        }
      }

      // Check for subgenre
      if (tag.toLowerCase().startsWith('subgenre:')) {
        subgenre = tag.substring('subgenre:'.length).trim();
      }

      // Check for decade (various formats)
      const decadeMatch = tag.match(/^(\d{2,4})[cC]$/);
      if (decadeMatch) {
        decade = tag;
        // Normalize format check
        if (!VALID_DECADES.includes(tag) && !VALID_DECADES.includes(tag.toLowerCase())) {
          notes.push(`Non-standard decade format: "${tag}"`);
        }
      }
    }

    return { genre, subgenre, decade, allTags, notes };
  };

  // Parse CSV line handling quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleFileUpload = async (files: FileList) => {
    setLoading(true);
    setProducts([]);

    const allProducts: Product[] = [];
    const seenHandles = new Set<string>();
    const fileArray = Array.from(files);

    for (let fileIdx = 0; fileIdx < fileArray.length; fileIdx++) {
      const file = fileArray[fileIdx];
      setUploadProgress({
        stage: `Reading ${file.name}...`,
        current: fileIdx + 1,
        total: fileArray.length
      });

      const text = await file.text();
      const lines = text.split('\n');
      const headers = parseCSVLine(lines[0]);

      // Find column indices
      const idx = {
        handle: headers.findIndex(h => h.toLowerCase() === 'handle'),
        title: headers.findIndex(h => h.toLowerCase() === 'title'),
        vendor: headers.findIndex(h => h.toLowerCase() === 'vendor'),
        tags: headers.findIndex(h => h.toLowerCase() === 'tags'),
      };

      if (idx.handle === -1 || idx.tags === -1) {
        console.error('Missing required columns');
        continue;
      }

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = parseCSVLine(lines[i]);
        const handle = values[idx.handle];

        if (!handle || seenHandles.has(handle)) continue;
        seenHandles.add(handle);

        const tags = values[idx.tags] || '';
        const parsed = parseTags(tags);

        allProducts.push({
          handle,
          title: values[idx.title] || '',
          vendor: values[idx.vendor] || '',
          tags,
          parsedGenre: parsed.genre,
          parsedSubgenre: parsed.subgenre,
          parsedDecade: parsed.decade,
          hasGenre: !!parsed.genre,
          hasSubgenre: !!parsed.subgenre,
          hasDecade: !!parsed.decade,
          rawTagsList: parsed.allTags,
          parsingNotes: parsed.notes,
        });
      }
    }

    setProducts(allProducts);
    setUploadProgress({ stage: 'Done!', current: 100, total: 100 });
    setLoading(false);
  };

  // Calculate stats
  const stats: AuditStats = useMemo(() => {
    const s: AuditStats = {
      total: products.length,
      withGenre: 0,
      withSubgenre: 0,
      withDecade: 0,
      complete: 0,
      missingAll: 0,
      missingGenreOnly: 0,
      missingSubgenreOnly: 0,
      missingDecadeOnly: 0,
    };

    for (const p of products) {
      if (p.hasGenre) s.withGenre++;
      if (p.hasSubgenre) s.withSubgenre++;
      if (p.hasDecade) s.withDecade++;
      if (p.hasGenre && p.hasSubgenre && p.hasDecade) s.complete++;
      if (!p.hasGenre && !p.hasSubgenre && !p.hasDecade) s.missingAll++;
      if (!p.hasGenre && p.hasSubgenre && p.hasDecade) s.missingGenreOnly++;
      if (p.hasGenre && !p.hasSubgenre && p.hasDecade) s.missingSubgenreOnly++;
      if (p.hasGenre && p.hasSubgenre && !p.hasDecade) s.missingDecadeOnly++;
    }

    return s;
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    switch (filter) {
      case 'complete':
        filtered = filtered.filter(p => p.hasGenre && p.hasSubgenre && p.hasDecade);
        break;
      case 'missing-genre':
        filtered = filtered.filter(p => !p.hasGenre);
        break;
      case 'missing-subgenre':
        filtered = filtered.filter(p => !p.hasSubgenre);
        break;
      case 'missing-decade':
        filtered = filtered.filter(p => !p.hasDecade);
        break;
      case 'missing-all':
        filtered = filtered.filter(p => !p.hasGenre && !p.hasSubgenre && !p.hasDecade);
        break;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.handle.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.vendor.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [products, filter, searchQuery]);

  // Generate verification sample
  const generateVerificationSample = () => {
    // Get 20 random products with diverse characteristics
    const withAll = products.filter(p => p.hasGenre && p.hasSubgenre && p.hasDecade);
    const missingSome = products.filter(p => (p.hasGenre || p.hasSubgenre || p.hasDecade) && !(p.hasGenre && p.hasSubgenre && p.hasDecade));
    const missingAll = products.filter(p => !p.hasGenre && !p.hasSubgenre && !p.hasDecade);
    const withNotes = products.filter(p => p.parsingNotes.length > 0);

    const sample: Product[] = [];
    const addRandom = (arr: Product[], count: number) => {
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(count, shuffled.length); i++) {
        if (!sample.find(s => s.handle === shuffled[i].handle)) {
          sample.push(shuffled[i]);
        }
      }
    };

    addRandom(withAll, 5);
    addRandom(missingSome, 5);
    addRandom(missingAll, 5);
    addRandom(withNotes, 5);

    setVerificationSample(sample);
    setVerificationMode(true);
  };

  // Export functions
  const exportMissingGenre = () => {
    const missing = products.filter(p => !p.hasGenre);
    const csv = [
      ['Handle', 'Title', 'Vendor', 'Current Tags'].join(','),
      ...missing.map(p => [
        `"${p.handle}"`,
        `"${p.title.replace(/"/g, '""')}"`,
        `"${p.vendor.replace(/"/g, '""')}"`,
        `"${p.tags.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'missing-genre.csv';
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Phase 1: Data Audit</h1>
          <p className="text-gray-600 mt-1">Upload your CSVs to analyze tag coverage</p>
        </div>

        {/* Upload Section */}
        {products.length === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Upload Your Product CSVs</h2>
            <p className="text-gray-500 mb-6">Select one or both Shopify export files</p>
            <label className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium cursor-pointer hover:bg-blue-700 transition-colors">
              Choose CSV Files
              <input
                type="file"
                multiple
                accept=".csv"
                onChange={e => e.target.files && handleFileUpload(e.target.files)}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <div className="text-gray-800 font-medium">{uploadProgress.stage}</div>
          </div>
        )}

        {/* Stats Dashboard */}
        {products.length > 0 && !verificationMode && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="text-3xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
                <div className="text-gray-500 text-sm">Total Products</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-4">
                <div className="text-3xl font-bold text-emerald-600">{stats.complete.toLocaleString()}</div>
                <div className="text-gray-500 text-sm">Fully Tagged</div>
                <div className="text-emerald-600 text-xs font-medium">{Math.round(100 * stats.complete / stats.total)}%</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-4">
                <div className="text-3xl font-bold text-amber-600">{(stats.total - stats.complete - stats.missingAll).toLocaleString()}</div>
                <div className="text-gray-500 text-sm">Partially Tagged</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4">
                <div className="text-3xl font-bold text-red-600">{stats.missingAll.toLocaleString()}</div>
                <div className="text-gray-500 text-sm">No Tags</div>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="font-bold text-gray-800 mb-4">Tag Coverage</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Genre</span>
                    <span className="font-medium">{stats.withGenre.toLocaleString()} / {stats.total.toLocaleString()} ({Math.round(100 * stats.withGenre / stats.total)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-emerald-500 h-3 rounded-full transition-all"
                      style={{ width: `${100 * stats.withGenre / stats.total}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Subgenre</span>
                    <span className="font-medium">{stats.withSubgenre.toLocaleString()} / {stats.total.toLocaleString()} ({Math.round(100 * stats.withSubgenre / stats.total)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all"
                      style={{ width: `${100 * stats.withSubgenre / stats.total}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Decade</span>
                    <span className="font-medium">{stats.withDecade.toLocaleString()} / {stats.total.toLocaleString()} ({Math.round(100 * stats.withDecade / stats.total)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-violet-500 h-3 rounded-full transition-all"
                      style={{ width: `${100 * stats.withDecade / stats.total}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={generateVerificationSample}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors"
              >
                🔍 Verify Parsing (20 samples)
              </button>
              <button
                onClick={exportMissingGenre}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                📥 Export Missing Genre
              </button>
              <button
                onClick={() => setProducts([])}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                🔄 Start Over
              </button>
            </div>

            {/* Filter and Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { key: 'all', label: `All (${stats.total})` },
                  { key: 'complete', label: `Complete (${stats.complete})` },
                  { key: 'missing-genre', label: `Missing Genre (${stats.total - stats.withGenre})` },
                  { key: 'missing-subgenre', label: `Missing Subgenre (${stats.total - stats.withSubgenre})` },
                  { key: 'missing-decade', label: `Missing Decade (${stats.total - stats.withDecade})` },
                  { key: 'missing-all', label: `Missing All (${stats.missingAll})` },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key as FilterType)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filter === f.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search by handle, title, or vendor..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            {/* Product List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-600">Product</th>
                      <th className="text-left p-3 font-medium text-gray-600">Vendor</th>
                      <th className="text-center p-3 font-medium text-gray-600">Genre</th>
                      <th className="text-center p-3 font-medium text-gray-600">Subgenre</th>
                      <th className="text-center p-3 font-medium text-gray-600">Decade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredProducts.slice(0, 100).map(p => (
                      <tr key={p.handle} className="hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium text-gray-900 truncate max-w-xs">{p.title}</div>
                          <div className="text-gray-400 text-xs truncate">{p.handle}</div>
                        </td>
                        <td className="p-3 text-gray-600">{p.vendor}</td>
                        <td className="p-3 text-center">
                          {p.hasGenre ? (
                            <span className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                              {p.parsedGenre}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {p.hasSubgenre ? (
                            <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {p.parsedSubgenre}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {p.hasDecade ? (
                            <span className="inline-block px-2 py-1 bg-violet-100 text-violet-700 rounded text-xs font-medium">
                              {p.parsedDecade}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredProducts.length > 100 && (
                <div className="p-3 bg-gray-50 text-center text-gray-500 text-sm">
                  Showing 100 of {filteredProducts.length.toLocaleString()} products
                </div>
              )}
            </div>
          </>
        )}

        {/* Verification Mode */}
        {verificationMode && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Verification Checkpoint</h2>
                <p className="text-gray-500 text-sm">Review these 20 samples to confirm parsing is correct</p>
              </div>
              <button
                onClick={() => setVerificationMode(false)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
              >
                ✓ Parsing Looks Correct
              </button>
            </div>

            <div className="space-y-4">
              {verificationSample.map(p => (
                <div key={p.handle} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">{p.title}</div>
                      <div className="text-gray-500 text-base mt-1">{p.vendor} • <span className="text-gray-400">{p.handle}</span></div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {p.hasGenre && <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium">Genre ✓</span>}
                      {p.hasSubgenre && <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">Subgenre ✓</span>}
                      {p.hasDecade && <span className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-sm font-medium">Decade ✓</span>}
                      {!p.hasGenre && <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium">No Genre</span>}
                      {!p.hasSubgenre && <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium">No Subgenre</span>}
                      {!p.hasDecade && <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium">No Decade</span>}
                    </div>
                  </div>

                  <div className="bg-gray-100 rounded-lg p-4 mb-4">
                    <div className="text-sm text-gray-500 mb-2 font-medium">Raw Tags:</div>
                    <div className="text-base text-gray-800 leading-relaxed break-words">{p.tags || '(empty)'}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <div className="text-sm text-emerald-600 font-medium mb-1">Parsed Genre</div>
                      <div className="text-lg font-semibold text-gray-900">{p.parsedGenre || '—'}</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-sm text-blue-600 font-medium mb-1">Parsed Subgenre</div>
                      <div className="text-lg font-semibold text-gray-900">{p.parsedSubgenre || '—'}</div>
                    </div>
                    <div className="bg-violet-50 rounded-lg p-3">
                      <div className="text-sm text-violet-600 font-medium mb-1">Parsed Decade</div>
                      <div className="text-lg font-semibold text-gray-900">{p.parsedDecade || '—'}</div>
                    </div>
                  </div>

                  {p.parsingNotes.length > 0 && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-base">
                      ⚠️ {p.parsingNotes.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setVerificationMode(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium"
              >
                ← Back to Dashboard
              </button>
              <button
                onClick={() => setVerificationMode(false)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
              >
                ✓ Parsing Looks Correct - Continue to Phase 2
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
