// api/noticias.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

// Configuração centralizada das fontes
const fontes = [
    { id: 0, nome: 'ONU News', url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png' },
    { id: 1, nome: 'DW Brasil', url: 'https://rss.dw.com/xml/rss-br-news', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png' },
    { id: 2, nome: 'RFI', url: 'https://www.rfi.fr/br/geral/rss', logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png' },
    { id: 3, nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png' },
    { id: 4, nome: 'Senado', url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png' },
    { id: 5, nome: 'Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png' }
];

// Função de Raspagem Real (Simulando Browser)
async function buscarImagemReal(urlNoticia) {
    try {
        const { data } = await axios.get(urlNoticia, { 
            timeout: 5000, // 5 segundos max por página
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });
        
        const $ = cheerio.load(data);
        
        // Busca a imagem nas tags de redes sociais
        let imagem = $('meta[property="og:image"]').attr('content') || 
                     $('meta[name="twitter:image"]').attr('content') ||
                     $('link[rel="image_src"]').attr('href');

        // Corrige URL relativa se necessário (ex: /imagem.jpg -> https://site.com/imagem.jpg)
        if (imagem && !imagem.startsWith('http')) {
            const urlBase = new URL(urlNoticia).origin;
            imagem = imagem.startsWith('/') ? urlBase + imagem : urlBase + '/' + imagem;
        }

        return imagem;
    } catch (error) {
        console.error(`Erro ao raspar ${urlNoticia}: ${error.message}`);
        return null;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Pega o ID da fonte que o Frontend pediu (ex: ?id=3)
    const { id } = req.query;
    
    // Se não mandou ID ou ID inválido, retorna erro
    if (id === undefined || !fontes[id]) {
        return res.status(400).json({ error: "Fonte inválida" });
    }

    const fonte = fontes[id];

    try {
        const feed = await parser.parseURL(fonte.url);
        // Pega as 3 notícias mais recentes
        const itens = feed.items.slice(0, 3); 

        // Processa as 3 notícias EM PARALELO (muito rápido)
        const noticiasProcessadas = await Promise.all(itens.map(async (item) => {
            let imagemFinal = null;

            // 1. Tenta RSS primeiro
            if (item.enclosure && item.enclosure.url) imagemFinal = item.enclosure.url;
            else if (item["content:encoded"]) {
                const match = item["content:encoded"].match(/src="([^"]+)"/);
                if (match) imagemFinal = match[1];
            }

            // 2. Se a imagem for ruim, placeholder ou não existir -> RASPA O SITE
            if (!imagemFinal || imagemFinal.includes('placeholder') || imagemFinal.includes('ebc.png') || imagemFinal.includes('logo')) {
                const imgScrap = await buscarImagemReal(item.link);
                if (imgScrap) imagemFinal = imgScrap;
            }

            // 3. Último caso: Logo
            if (!imagemFinal) imagemFinal = fonte.logo;

            return {
                titulo: item.title,
                link: item.link,
                imagem: imagemFinal,
                fonte: fonte.nome,
                data: item.pubDate
            };
        }));

        // Retorna apenas as notícias dessa fonte
        res.status(200).json(noticiasProcessadas);

    } catch (error) {
        console.error(`Erro fatal na fonte ${fonte.nome}:`, error);
        // Retorna array vazio para não quebrar o front
        res.status(200).json([]); 
    }
};