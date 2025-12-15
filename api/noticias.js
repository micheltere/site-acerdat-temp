// api/noticias.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

// Configuração do Parser
const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout: 5000
});

const fontes = [
    // INTERNACIONAIS (Sem scraping, busca bruta no RSS)
    { id: 0, nome: 'ONU News', url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png', usarScraping: false },
    { id: 1, nome: 'DW Brasil', url: 'https://rss.dw.com/xml/rss-br-news', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png', usarScraping: false },
    { id: 2, nome: 'RFI', url: 'https://www.rfi.fr/br/geral/rss', logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png', usarScraping: false },
    
    // NACIONAIS (Com scraping seletivo)
    { id: 3, nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png', usarScraping: true },
    { id: 4, nome: 'Senado', url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png', usarScraping: true },
    { id: 5, nome: 'Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png', usarScraping: true }
];

// --- FUNÇÕES AUXILIARES ---

// 1. Busca Bruta no RSS (Resolve DW e RFI)
function caçarImagemNoRSS(item) {
    // Tenta o padrão primeiro
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;

    // Converte o objeto do item inteiro para texto (JSON string)
    // Isso nos permite procurar links em qualquer lugar, mesmo em tags desconhecidas
    const rawString = JSON.stringify(item);
    
    // Procura por links de imagem (jpg, png, webp, jpeg)
    // A Regex procura: http ou https + qualquer coisa + extensão de imagem
    const regexImagem = /(https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp))/i;
    const match = rawString.match(regexImagem);

    if (match && match[1]) {
        return match[1];
    }

    // Se falhar, tenta procurar dentro do conteúdo HTML por tag <img src="...">
    if (item.content || item['content:encoded']) {
        const html = item.content || item['content:encoded'];
        const imgMatch = html.match(/src=["']([^"']+)["']/);
        if (imgMatch) return imgMatch[1];
    }

    return null;
}

// 2. Raspagem Real (Apenas para Nacionais)
async function buscarImagemReal(urlNoticia) {
    try {
        const { data } = await axios.get(urlNoticia, { 
            timeout: 4000, 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        
        let imagem = $('meta[property="og:image"]').attr('content') || 
                     $('meta[name="twitter:image"]').attr('content');

        if (imagem && !imagem.startsWith('http')) {
            const urlBase = new URL(urlNoticia).origin;
            imagem = imagem.startsWith('/') ? urlBase + imagem : urlBase + '/' + imagem;
        }
        return imagem;
    } catch (e) { return null; }
}

// --- API PRINCIPAL ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const { id } = req.query;

    if (id === undefined || !fontes[id]) {
        return res.status(400).json({ error: "Fonte inválida" });
    }

    const fonte = fontes[id];

    try {
        const feed = await parser.parseURL(fonte.url);
        const itens = feed.items.slice(0, 4);

        const noticiasProcessadas = await Promise.all(itens.map(async (item) => {
            let imagemFinal = null;

            // PASSO 1: Caça a imagem no RSS (Estratégia Força Bruta)
            imagemFinal = caçarImagemNoRSS(item);

            // PASSO 2: Se não achou ou é ruim, e a fonte permite, faz Scraping
            if (fonte.usarScraping) {
                if (!imagemFinal || imagemFinal.includes('placeholder') || imagemFinal.includes('ebc.png') || imagemFinal.includes('logo')) {
                    const imgScrap = await buscarImagemReal(item.link);
                    if (imgScrap) imagemFinal = imgScrap;
                }
            }

            // PASSO 3: GARANTIA TOTAL (Se tudo falhar, usa o Logo)
            // Isso garante que a notícia NUNCA fique invisível
            if (!imagemFinal) {
                imagemFinal = fonte.logo;
            }

            return {
                titulo: item.title,
                link: item.link,
                imagem: imagemFinal,
                fonte: fonte.nome,
                data: item.pubDate
            };
        }));

        res.status(200).json(noticiasProcessadas);

    } catch (error) {
        console.error(`Erro crítico na fonte ${fonte.nome}:`, error.message);
        // Retorna array vazio em caso de falha total de conexão, para não travar o front
        res.status(200).json([]);
    }
};