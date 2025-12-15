// api/noticias.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

// Configuração do Leitor de RSS (com campos extras para pegar imagens escondidas)
const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['enclosure', 'enclosure'],
            ['content:encoded', 'contentEncoded'],
            ['content', 'content']
        ]
    },
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout: 5000
});

const fontes = [
    { 
        id: 0, 
        nome: 'ONU News', 
        url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', 
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png',
        usarScraping: false 
    },
    { 
        id: 1, 
        nome: 'DW Brasil', 
        url: 'https://rss.dw.com/xml/rss-br-news', 
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png',
        usarScraping: false 
    },
    { 
        id: 2, 
        nome: 'RFI', 
        url: 'https://www.rfi.fr/br/geral/rss', 
        logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png',
        usarScraping: false 
    },
    { 
        id: 3, 
        nome: 'Agência Brasil', 
        url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', 
        logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png',
        usarScraping: true 
    },
    { 
        id: 4, 
        nome: 'Senado', 
        url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', 
        logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png',
        usarScraping: true 
    },
    { 
        id: 5, 
        nome: 'Câmara', 
        url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', 
        logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png',
        usarScraping: true 
    }
];

// Função auxiliar para procurar imagem em TODOS os lugares possíveis do RSS
function extrairImagemDoRSS(item) {
    // 1. Tenta enclosure (padrão)
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    
    // 2. Tenta media:content (Usado por DW/Yahoo)
    if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) return item.mediaContent.$.url;
    if (item.mediaContent && item.mediaContent.url) return item.mediaContent.url;

    // 3. Tenta media:thumbnail (Usado por RFI/YouTube)
    if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) return item.mediaThumbnail.$.url;
    if (item.mediaThumbnail && item.mediaThumbnail.url) return item.mediaThumbnail.url;

    // 4. Tenta achar tag <img> dentro do conteúdo HTML
    const htmlContent = item.contentEncoded || item.content || "";
    const match = htmlContent.match(/src=["']([^"']+)["']/);
    if (match) return match[1];

    return null;
}

// Função de Raspagem (Só para nacionais)
async function buscarImagemReal(urlNoticia) {
    try {
        const { data } = await axios.get(urlNoticia, { 
            timeout: 4000, 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        let imagem = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
        
        if (imagem && !imagem.startsWith('http')) {
            const urlBase = new URL(urlNoticia).origin;
            imagem = imagem.startsWith('/') ? urlBase + imagem : urlBase + '/' + imagem;
        }
        return imagem;
    } catch (e) { return null; }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const { id } = req.query;
    if (id === undefined || !fontes[id]) return res.status(400).json({ error: "Fonte inválida" });

    const fonte = fontes[id];

    try {
        const feed = await parser.parseURL(fonte.url);
        const itens = feed.items.slice(0, 4); 

        const noticiasProcessadas = await Promise.all(itens.map(async (item) => {
            // AQUI ESTÁ A MÁGICA: O Detetive de Imagens entra em ação
            let imagemFinal = extrairImagemDoRSS(item);

            // Se o detetive falhou E a fonte permite, chama o Robô de Raspagem
            if (fonte.usarScraping) {
                if (!imagemFinal || imagemFinal.includes('placeholder') || imagemFinal.includes('ebc.png') || imagemFinal.includes('logo')) {
                    const imgScrap = await buscarImagemReal(item.link);
                    if (imgScrap) imagemFinal = imgScrap;
                }
            }

            // Fallback
            if (!imagemFinal) imagemFinal = fonte.logo;

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
        console.error(`Erro na fonte ${fonte.nome}:`, error);
        res.status(200).json([]); 
    }
};