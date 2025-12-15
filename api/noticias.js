// api/noticias.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

// Configuração do Leitor de RSS
const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
    },
    timeout: 5000
});

// LISTA DE FONTES COM CONFIGURAÇÃO INDIVIDUAL
const fontes = [
    { 
        id: 0, 
        nome: 'ONU News', 
        url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', 
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png',
        usarScraping: false // ONU bloqueia robôs, confiamos no RSS
    },
    { 
        id: 1, 
        nome: 'DW Brasil', 
        url: 'https://rss.dw.com/xml/rss-br-news', 
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png',
        usarScraping: false // DW bloqueia robôs, confiamos no RSS
    },
    { 
        id: 2, 
        nome: 'RFI', 
        url: 'https://www.rfi.fr/br/geral/rss', 
        logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png',
        usarScraping: false // RFI costuma ter imagem no RSS
    },
    { 
        id: 3, 
        nome: 'Agência Brasil', 
        url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', 
        logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png',
        usarScraping: true // RSS manda imagem preta, PRECISA de scraping
    },
    { 
        id: 4, 
        nome: 'Senado', 
        url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', 
        logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png',
        usarScraping: true // Imagens do RSS são pequenas, scraping ajuda
    },
    { 
        id: 5, 
        nome: 'Câmara', 
        url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', 
        logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png',
        usarScraping: true // RSS muitas vezes sem imagem
    }
];

// Função de Raspagem (Só será usada para os nacionais)
async function buscarImagemReal(urlNoticia) {
    try {
        const { data } = await axios.get(urlNoticia, { 
            timeout: 4000, 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });
        
        const $ = cheerio.load(data);
        
        let imagem = $('meta[property="og:image"]').attr('content') || 
                     $('meta[name="twitter:image"]').attr('content') ||
                     $('link[rel="image_src"]').attr('href');

        if (imagem && !imagem.startsWith('http')) {
            const urlBase = new URL(urlNoticia).origin;
            imagem = imagem.startsWith('/') ? urlBase + imagem : urlBase + '/' + imagem;
        }

        return imagem;
    } catch (error) {
        console.error(`Erro scraping: ${error.message}`);
        return null;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const { id } = req.query;
    
    // Validação básica
    if (id === undefined || !fontes[id]) {
        return res.status(400).json({ error: "Fonte inválida" });
    }

    const fonte = fontes[id];

    try {
        const feed = await parser.parseURL(fonte.url);
        // Pegamos até 4 notícias
        const itens = feed.items.slice(0, 4); 

        const noticiasProcessadas = await Promise.all(itens.map(async (item) => {
            let imagemFinal = null;

            // 1. TENTA PEGAR DO RSS (Funciona bem para Internacionais)
            if (item.enclosure && item.enclosure.url) {
                imagemFinal = item.enclosure.url;
            } else if (item["content:encoded"]) {
                const match = item["content:encoded"].match(/src="([^"]+)"/);
                if (match) imagemFinal = match[1];
            } else if (item.content) {
                const match = item.content.match(/src="([^"]+)"/);
                if (match) imagemFinal = match[1];
            }

            // 2. SCRAPING SELETIVO
            // Só ativa o robô pesado se a fonte permitir E se a imagem estiver ruim/ausente
            if (fonte.usarScraping) {
                if (!imagemFinal || imagemFinal.includes('placeholder') || imagemFinal.includes('ebc.png') || imagemFinal.includes('logo')) {
                    const imgScrap = await buscarImagemReal(item.link);
                    if (imgScrap) imagemFinal = imgScrap;
                }
            }

            // 3. FALLBACK (Logo)
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
        // Se der erro, retorna lista vazia (não quebra o site)
        res.status(200).json([]); 
    }
};