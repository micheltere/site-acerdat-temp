// api/noticias.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

const fontes = [
    { nome: 'ONU News', url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png' },
    { nome: 'DW Brasil', url: 'https://rss.dw.com/xml/rss-br-news', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png' },
    { nome: 'RFI', url: 'https://www.rfi.fr/br/geral/rss', logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png' },
    { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png' },
    { nome: 'Senado', url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png' },
    { nome: 'Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png' }
];

// Sites que SABEMOS que precisam de scraping forçado
const fontesTeimosas = ['Agência Brasil', 'Câmara', 'RFI'];

async function buscarImagemReal(urlNoticia) {
    try {
        // O Disfarce: Fingimos ser um navegador Chrome real
        const { data } = await axios.get(urlNoticia, { 
            timeout: 5000, 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Referer': 'https://www.google.com/'
            }
        });
        
        const $ = cheerio.load(data);
        
        // Tenta pegar a imagem "Open Graph" (usada pelo Facebook/WhatsApp)
        let imagem = $('meta[property="og:image"]').attr('content');
        
        // Se não achar, tenta Twitter Card
        if (!imagem) imagem = $('meta[name="twitter:image"]').attr('content');
        
        // Se a imagem for relativa (começar com /), coloca o domínio na frente
        if (imagem && imagem.startsWith('/')) {
            const urlBase = new URL(urlNoticia).origin;
            imagem = urlBase + imagem;
        }

        return imagem;
    } catch (error) {
        console.log(`Falha ao raspar ${urlNoticia}:`, error.message);
        return null; 
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    let todasNoticias = [];

    try {
        const promessas = fontes.map(async (fonte) => {
            try {
                const feed = await parser.parseURL(fonte.url);
                const itensRecentes = feed.items.slice(0, 2); // 2 de cada para ser rápido

                const noticiasProcessadas = await Promise.all(itensRecentes.map(async (item) => {
                    let imagemFinal = null;
                    const precisaRaspar = fontesTeimosas.includes(fonte.nome);

                    // 1. Tenta RSS (se não for fonte teimosa)
                    if (!precisaRaspar) {
                        if (item.enclosure && item.enclosure.url) imagemFinal = item.enclosure.url;
                        else if (item["content:encoded"]) {
                            const match = item["content:encoded"].match(/src="([^"]+)"/);
                            if (match) imagemFinal = match[1];
                        }
                    }

                    // 2. Se for teimosa ou se a imagem do RSS for ruim, ativa o SCRAPING
                    if (precisaRaspar || !imagemFinal || imagemFinal.includes('placeholder') || imagemFinal.includes('ebc.png')) {
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
                
                todasNoticias.push(...noticiasProcessadas);
            } catch (e) {
                console.error(`Erro na fonte ${fonte.nome}`);
            }
        });

        await Promise.all(promessas);
        todasNoticias.sort((a, b) => new Date(b.data) - new Date(a.data));
        
        res.status(200).json(todasNoticias);

    } catch (error) {
        res.status(500).json({ error: "Erro interno" });
    }
};