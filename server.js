const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 3000;

// MIME types for static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Elasticsearch proxy function for single lot ID
function proxyElasticsearch(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const requestData = JSON.parse(body);
            const lotId = requestData.lotId;

            if (!lotId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing lotId' }));
                return;
            }

            const query = {
                query: { term: { LotID: lotId } },
                _source: ["LotID", "Title", "SaleProbability", "PredictedPrice", "House.ID", "House.Name", "Catalog.ID", "ShortDescription", "LongDescription"]
            };

            const esOptions = (index) => ({
                hostname: 'search-discovery-platform-prod.es.us-east-1.aws.found.io',
                path: `/${index}/_search`,
                method: 'POST',
                headers: {
                    'Authorization': 'ApiKey UnRZbUtwa0I1RjB6SnVIbUJqV086bi0zTUUtRjhSV0doZlVCOHkwNW1tZw==',
                    'Content-Type': 'application/json'
                }
            });

            const queryBody = JSON.stringify(query);

            // Try primary index first, fall back to ended index
            const tryIndex = (index, fallback) => {
                const proxyReq = https.request(esOptions(index), (proxyRes) => {
                    let responseData = '';
                    proxyRes.on('data', chunk => responseData += chunk);
                    proxyRes.on('end', () => {
                        try {
                            const parsed = JSON.parse(responseData);
                            if (fallback && (!parsed.hits || parsed.hits.hits.length === 0)) {
                                // Not found in live index, try ended index
                                console.log(`Lot ${lotId} not found in ${index}, trying fallback...`);
                                tryIndex(fallback, null);
                            } else {
                                res.writeHead(proxyRes.statusCode, {
                                    'Content-Type': 'application/json',
                                    'Access-Control-Allow-Origin': '*'
                                });
                                res.end(responseData);
                            }
                        } catch (e) {
                            res.writeHead(proxyRes.statusCode, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*'
                            });
                            res.end(responseData);
                        }
                    });
                });
                proxyReq.on('error', (error) => {
                    console.error('Elasticsearch proxy error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                });
                proxyReq.write(queryBody);
                proxyReq.end();
            };

            tryIndex('la_lot_live', 'la_lot_ended_2026_01_21');

        } catch (error) {
            console.error('Proxy error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// Elasticsearch bulk query for multiple lot IDs
function proxyElasticsearchBulk(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const requestData = JSON.parse(body);
            const lotIds = requestData.lotIds;

            if (!lotIds || !Array.isArray(lotIds) || lotIds.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing or invalid lotIds array' }));
                return;
            }

            const query = {
                query: {
                    terms: {
                        LotID: lotIds
                    }
                },
                size: lotIds.length,
                _source: ["LotID", "Title", "SaleProbability", "PredictedPrice", "House.ID", "House.Name", "Catalog.ID", "ShortDescription", "LongDescription"]
            };

            const esUrl = new URL('https://search-discovery-platform-prod.es.us-east-1.aws.found.io/la_lot_live/_search');

            const options = {
                hostname: esUrl.hostname,
                path: esUrl.pathname + esUrl.search,
                method: 'POST',
                headers: {
                    'Authorization': 'ApiKey UnRZbUtwa0I1RjB6SnVIbUJqV086bi0zTUUtRjhSV0doZlVCOHkwNW1tZw==',
                    'Content-Type': 'application/json'
                }
            };

            const proxyReq = https.request(options, (proxyRes) => {
                let responseData = '';
                proxyRes.on('data', chunk => responseData += chunk);
                proxyRes.on('end', () => {
                    res.writeHead(proxyRes.statusCode, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(responseData);
                });
            });

            proxyReq.on('error', (error) => {
                console.error('Elasticsearch bulk proxy error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            });

            proxyReq.write(JSON.stringify(query));
            proxyReq.end();

        } catch (error) {
            console.error('Proxy error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// Similar Lots API proxy
function proxySimilarLots(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const requestData = JSON.parse(body);

            const apiUrl = new URL('https://internal.atgapi.io/similar-lots/v1/search');

            const options = {
                hostname: apiUrl.hostname,
                path: apiUrl.pathname + apiUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'ssa-api'
                }
            };

            const proxyReq = https.request(options, (proxyRes) => {
                let responseData = '';
                proxyRes.on('data', chunk => responseData += chunk);
                proxyRes.on('end', () => {
                    res.writeHead(proxyRes.statusCode, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(responseData);
                });
            });

            proxyReq.on('error', (error) => {
                console.error('Similar Lots API proxy error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            });

            proxyReq.write(JSON.stringify(requestData));
            proxyReq.end();

        } catch (error) {
            console.error('Proxy error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

const server = http.createServer((req, res) => {
    // Enable CORS for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Elasticsearch proxy endpoint (single lot)
    if (req.url === '/api/es-proxy' && req.method === 'POST') {
        proxyElasticsearch(req, res);
        return;
    }

    // Elasticsearch bulk query endpoint (multiple lots)
    if (req.url === '/api/es-bulk' && req.method === 'POST') {
        proxyElasticsearchBulk(req, res);
        return;
    }

    // Similar Lots API proxy endpoint
    if (req.url === '/api/similar-lots' && req.method === 'POST') {
        proxySimilarLots(req, res);
        return;
    }

    const pathname = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(__dirname, pathname);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`
🚀 Item Recommendations Visualizer running at http://localhost:${PORT}`);
    console.log('\nInstructions:');
    console.log('  1. Open http://localhost:3000 in your browser');
    console.log('  2. Enter a Lot ID and click "Fetch from ES" for the source item');
    console.log('  3. Add views and paste Elasticsearch JSON or Lot IDs');
    console.log('  4. Run analysis to compare variants\n');
});
