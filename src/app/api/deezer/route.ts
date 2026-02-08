import { NextRequest, NextResponse } from 'next/server';

interface DeezerAlbum {
  id: number;
  title: string;
  release_date: string;
  artist: {
    id: number;
    name: string;
  };
}

interface DeezerSearchResult {
  data: Array<{
    id: number;
    title: string;
    album: DeezerAlbum;
    artist: {
      id: number;
      name: string;
    };
  }>;
}

// Cache results in memory to avoid repeated lookups
const cache = new Map<string, { year: string | null; fetchedAt: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const artist = searchParams.get('artist');
  const title = searchParams.get('title');

  if (!artist || !title) {
    return NextResponse.json({ error: 'Missing artist or title' }, { status: 400 });
  }

  const cacheKey = `${artist.toLowerCase()}::${title.toLowerCase()}`;

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json({ year: cached.year, cached: true });
  }

  try {
    // Search Deezer - try artist + album first
    const query = `artist:"${artist}" album:"${title}"`;
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Deezer API error: ${response.status}`);
    }

    const data: DeezerSearchResult = await response.json();

    let year: string | null = null;

    if (data.data && data.data.length > 0) {
      // Find the best match - look for release_date in album
      for (const track of data.data) {
        if (track.album?.release_date) {
          // release_date format is "YYYY-MM-DD"
          year = track.album.release_date.split('-')[0];
          break;
        }
      }
    }

    // If no results, try a simpler search
    if (!year) {
      const simpleQuery = `${artist} ${title}`;
      const simpleUrl = `https://api.deezer.com/search?q=${encodeURIComponent(simpleQuery)}&limit=5`;
      const simpleResponse = await fetch(simpleUrl);
      const simpleData: DeezerSearchResult = await simpleResponse.json();

      if (simpleData.data && simpleData.data.length > 0) {
        for (const track of simpleData.data) {
          if (track.album?.release_date) {
            year = track.album.release_date.split('-')[0];
            break;
          }
        }
      }
    }

    // Cache the result
    cache.set(cacheKey, { year, fetchedAt: Date.now() });

    return NextResponse.json({ year, cached: false });
  } catch (error) {
    console.error('Deezer lookup error:', error);
    return NextResponse.json({ error: 'Failed to fetch from Deezer', year: null }, { status: 500 });
  }
}

// Batch lookup endpoint for multiple products
export async function POST(request: NextRequest) {
  try {
    const { products } = await request.json() as {
      products: Array<{ handle: string; title: string; vendor: string }>
    };

    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Missing products array' }, { status: 400 });
    }

    const results: Record<string, string | null> = {};

    // Process with rate limiting (Deezer allows 50 req/5sec)
    for (const product of products) {
      const cacheKey = `${product.vendor.toLowerCase()}::${product.title.toLowerCase()}`;

      // Check cache
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        results[product.handle] = cached.year;
        continue;
      }

      try {
        const query = `artist:"${product.vendor}" album:"${product.title}"`;
        const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=3`;

        const response = await fetch(url);
        const data: DeezerSearchResult = await response.json();

        let year: string | null = null;
        if (data.data && data.data.length > 0) {
          for (const track of data.data) {
            if (track.album?.release_date) {
              year = track.album.release_date.split('-')[0];
              break;
            }
          }
        }

        cache.set(cacheKey, { year, fetchedAt: Date.now() });
        results[product.handle] = year;

        // Rate limit: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        results[product.handle] = null;
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Batch Deezer lookup error:', error);
    return NextResponse.json({ error: 'Failed to process batch' }, { status: 500 });
  }
}
