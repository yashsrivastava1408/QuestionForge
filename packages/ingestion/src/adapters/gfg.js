/**
 * GeeksForGeeks Ingestion Adapter
 * Uses Cheerio (server-side HTML parsing) to extract question data.
 */
export class GFGAdapter {
    async fetchQuestion(slug) {
        try {
            const url = `https://www.geeksforgeeks.org/${slug}/`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            if (!resp.ok)
                return null;
            const html = await resp.text();
            // Dynamic import of cheerio
            const { load } = await import('cheerio');
            const $ = load(html);
            const title = $('h1').first().text().trim();
            const statement = $('.entry-content p').slice(0, 5).map((_, el) => $(el).text()).get().join('\n').trim();
            return {
                title,
                statement,
                difficulty: 'MEDIUM',
                type: 'DSA',
                topic: 'Arrays',
                tags: [],
                sourceUrl: url,
                sourcePlatform: 'gfg',
                languages: ['python', 'java', 'cpp', 'javascript'],
            };
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=gfg.js.map