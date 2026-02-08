import { NextRequest, NextResponse } from 'next/server';

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;

interface DiscogsSearchResult {
  results: Array<{
    id: number;
    type: string;
    master_id?: number;
    title: string;
    year?: number;
    genre?: string[];
    style?: string[];
  }>;
}

interface DiscogsMasterRelease {
  id: number;
  title: string;
  year: number;
  genres: string[];
  styles: string[];
}

export interface DiscogsData {
  year: number | null;
  genre: string | null;
  style: string | null;
  genres: string[];
  styles: string[];
}

// Cache results to avoid repeated lookups
const cache = new Map<string, { data: DiscogsData; fetchedAt: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

async function fetchDiscogs(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
      'User-Agent': 'TagQuest/1.0',
    },
  });
}

async function lookupRelease(artist: string, title: string): Promise<DiscogsData> {
  const cacheKey = `${artist.toLowerCase()}::${title.toLowerCase()}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  const emptyResult: DiscogsData = { year: null, genre: null, style: null, genres: [], styles: [] };

  try {
    // Search for master release (original release)
    const query = `${artist} ${title}`;
    const searchUrl = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=master&per_page=5`;

    const searchRes = await fetchDiscogs(searchUrl);
    if (!searchRes.ok) {
      console.error('Discogs search failed:', searchRes.status);
      return emptyResult;
    }

    const searchData: DiscogsSearchResult = await searchRes.json();

    if (!searchData.results || searchData.results.length === 0) {
      // Try release search as fallback
      const releaseUrl = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=5`;
      const releaseRes = await fetchDiscogs(releaseUrl);
      const releaseData: DiscogsSearchResult = await releaseRes.json();

      if (releaseData.results && releaseData.results.length > 0) {
        const release = releaseData.results[0];
        const data: DiscogsData = {
          year: release.year || null,
          genre: release.genre?.[0] || null,
          style: release.style?.[0] || null,
          genres: release.genre || [],
          styles: release.style || [],
        };
        cache.set(cacheKey, { data, fetchedAt: Date.now() });
        return data;
      }

      cache.set(cacheKey, { data: emptyResult, fetchedAt: Date.now() });
      return emptyResult;
    }

    // Get the first master release
    const master = searchData.results[0];

    // If we have a master_id, fetch full details
    if (master.id) {
      const masterUrl = `https://api.discogs.com/masters/${master.id}`;
      const masterRes = await fetchDiscogs(masterUrl);

      if (masterRes.ok) {
        const masterData: DiscogsMasterRelease = await masterRes.json();
        const data: DiscogsData = {
          year: masterData.year || null,
          genre: masterData.genres?.[0] || null,
          style: masterData.styles?.[0] || null,
          genres: masterData.genres || [],
          styles: masterData.styles || [],
        };
        cache.set(cacheKey, { data, fetchedAt: Date.now() });
        return data;
      }
    }

    // Fallback to search result data
    const data: DiscogsData = {
      year: master.year || null,
      genre: master.genre?.[0] || null,
      style: master.style?.[0] || null,
      genres: master.genre || [],
      styles: master.style || [],
    };
    cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;

  } catch (error) {
    console.error('Discogs lookup error:', error);
    return emptyResult;
  }
}

// Single lookup
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const artist = searchParams.get('artist');
  const title = searchParams.get('title');

  if (!artist || !title) {
    return NextResponse.json({ error: 'Missing artist or title' }, { status: 400 });
  }

  if (!DISCOGS_TOKEN) {
    return NextResponse.json({ error: 'Discogs token not configured' }, { status: 500 });
  }

  const data = await lookupRelease(artist, title);
  return NextResponse.json(data);
}

// Batch lookup for multiple products
export async function POST(request: NextRequest) {
  if (!DISCOGS_TOKEN) {
    return NextResponse.json({ error: 'Discogs token not configured' }, { status: 500 });
  }

  try {
    const { products } = await request.json() as {
      products: Array<{ handle: string; title: string; vendor: string }>
    };

    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Missing products array' }, { status: 400 });
    }

    const results: Record<string, DiscogsData> = {};

    // Process with rate limiting (Discogs allows 60 req/min)
    // We'll do 1 per second to be safe
    for (const product of products) {
      const data = await lookupRelease(product.vendor, product.title);
      results[product.handle] = data;

      // Rate limit: 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Batch Discogs lookup error:', error);
    return NextResponse.json({ error: 'Failed to process batch' }, { status: 500 });
  }
}

// Lookup for a vendor's products to help auto-answer questions
export async function PUT(request: NextRequest) {
  if (!DISCOGS_TOKEN) {
    return NextResponse.json({ error: 'Discogs token not configured' }, { status: 500 });
  }

  try {
    const { vendor, products, suggestedGenre, suggestedDecade } = await request.json() as {
      vendor: string;
      products: Array<{ handle: string; title: string }>;
      suggestedGenre?: string;
      suggestedDecade?: string;
    };

    if (!vendor || !products) {
      return NextResponse.json({ error: 'Missing vendor or products' }, { status: 400 });
    }

    // Sample up to 5 products to check Discogs data
    const sample = products.slice(0, 5);
    const discogsResults: DiscogsData[] = [];

    for (const product of sample) {
      const data = await lookupRelease(vendor, product.title);
      discogsResults.push(data);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Analyze results
    const genreCounts: Record<string, number> = {};
    const styleCounts: Record<string, number> = {};
    const decades: number[] = [];

    for (const result of discogsResults) {
      if (result.genre) {
        genreCounts[result.genre] = (genreCounts[result.genre] || 0) + 1;
      }
      for (const g of result.genres) {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      }
      if (result.style) {
        styleCounts[result.style] = (styleCounts[result.style] || 0) + 1;
      }
      for (const s of result.styles) {
        styleCounts[s] = (styleCounts[s] || 0) + 1;
      }
      if (result.year) {
        decades.push(Math.floor(result.year / 10) * 10);
      }
    }

    // Find most common genre and decade
    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
    const topStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0];

    const decadeCounts: Record<number, number> = {};
    for (const d of decades) {
      decadeCounts[d] = (decadeCounts[d] || 0) + 1;
    }
    const topDecade = Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0];

    // Check if Discogs agrees with suggestions
    let genreConfidence = 0;
    let decadeConfidence = 0;
    let recommendedGenre: string | null = null;
    let recommendedDecade: string | null = null;

    if (suggestedGenre && topGenre) {
      // Check if suggested genre matches Discogs top genre
      const suggested = suggestedGenre.toLowerCase();
      const discogs = topGenre[0].toLowerCase();
      if (suggested === discogs || suggested.includes(discogs) || discogs.includes(suggested)) {
        genreConfidence = Math.round((topGenre[1] / sample.length) * 100);
      }
      recommendedGenre = topGenre[0];
    }

    if (suggestedDecade && topDecade) {
      // Check if suggested decade matches
      const suggestedDecadeNum = parseInt(suggestedDecade.replace(/\D/g, ''));
      const discogsDecade = parseInt(topDecade[0]);

      // Handle century formats like "80C" or "1980s"
      const normalizedSuggested = suggestedDecadeNum < 100
        ? 1900 + suggestedDecadeNum
        : suggestedDecadeNum;

      if (normalizedSuggested === discogsDecade) {
        decadeConfidence = Math.round((parseInt(topDecade[1].toString()) / sample.length) * 100);
      }
      recommendedDecade = `${topDecade[0]}s`;
    }

    return NextResponse.json({
      sampleSize: sample.length,
      genreAnalysis: {
        topGenre: topGenre?.[0] || null,
        count: topGenre?.[1] || 0,
        confidence: genreConfidence,
        allGenres: genreCounts,
        recommended: recommendedGenre,
      },
      styleAnalysis: {
        topStyle: topStyle?.[0] || null,
        count: topStyle?.[1] || 0,
        allStyles: styleCounts,
      },
      decadeAnalysis: {
        topDecade: topDecade ? `${topDecade[0]}s` : null,
        count: topDecade ? parseInt(topDecade[1].toString()) : 0,
        confidence: decadeConfidence,
        allDecades: decadeCounts,
        recommended: recommendedDecade,
      },
      products: sample.map((p, i) => ({
        handle: p.handle,
        title: p.title,
        discogs: discogsResults[i],
      })),
    });
  } catch (error) {
    console.error('Vendor analysis error:', error);
    return NextResponse.json({ error: 'Failed to analyze vendor' }, { status: 500 });
  }
}
