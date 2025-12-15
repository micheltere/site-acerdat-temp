// api/noticias.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

// Configuração das Fontes
const fontes = [
    // Internacionais (Geralmente têm RSS bom, não precisa raspar)
    { nome: 'ONU News', url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png' },
    { nome: 'DW Brasil', url: 'https://rss.dw.com/xml/rss-br-news', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png' },
    { nome: 'RFI', url: 'https://www.rfi.fr/br/geral/rss', logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png' },
    
    // Nacionais (RSS ruim, PRECISAM de raspagem)
    { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png' },
    { nome: 'Senado', url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png' },
    { nome: 'Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png' }
];

// LISTA VIP: Só entra no site para raspar imagem se estiver nesta lista
const fontesParaRaspar = ['Agência Brasil', 'Câmara', 'Senado'];

// Função de Raspagem (Com timeout curto de 2 segundos para não travar)
async function buscarImagemReal(urlNoticia) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // Max 2 segundos

        const { data } = await axios.get(urlNoticia, { 
            signal: controller.signal,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' 
            }
        });
        clearTimeout(timeoutId);
        
        const $ = cheerio.load(data);
        let imagem = $('meta[property="og:image"]').attr('content') || 
                     $('meta[name="twitter:image"]').attr('content');

        if (imagem && imagem.startsWith('/')) {
            const urlBase = new URL(urlNoticia).origin;
            imagem = urlBase + imagem;
        }
        return imagem;
    } catch (error) {
        return null; 
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    let todasNoticias = [];

    try {
        // Processa todas as fontes em paralelo
        const promises = fontes.map(async (fonte) => {
            try {
                // Timeout no RSS também (3 segundos)
                const feed = await parser.parseURL(fonte.url);
                const itens = feed.items.slice(0, 2); // 2 notícias

                const noticiasProcessadas = await Promise.all(itens.map(async (item) => {
                    let imagemFinal = null;
                    const precisaRaspar = fontesParaRaspar.includes(fonte.nome);

                    // 1. Tenta pegar do RSS (Prioridade para Internacionais)
                    if (item.enclosure && item.enclosure.url) imagemFinal = item.enclosure.url;
                    else if (item["content:encoded"]) {
                        const match = item["content:encoded"].match(/src="([^"]+)"/);
                        if (match) imagemFinal = match[1];
                    }

                    // 2. Só ativa o robô se for FONTE BRASILEIRA ou se não achou nada
                    if (precisaRaspar || !imagemFinal || imagemFinal.includes('placeholder')) {
                        const imgScrap = await buscarImagemReal(item.link);
                        if (imgScrap) imagemFinal = imgScrap;
                    }

                    // 3. Fallback
                    if (!imagemFinal) imagemFinal = fonte.logo;

                    return {
                        titulo: item.title,
                        link: item.link,
                        imagem: imagemFinal,
                        fonte: fonte.nome,
                        data: item.pubDate
                    };
                }));
                return noticiasProcessadas;
            } catch (e) {
                console.error(`Erro na fonte ${fonte.nome}`);
                return []; // Se der erro, retorna vazio mas não trava os outros
            }
        });

        const resultados = await Promise.all(promises);
        
        // Junta tudo
        resultados.forEach(lista => {
            if (lista) todasNoticias.push(...lista);
        });

        // Ordena por data
        todasNoticias.sort((a, b) => new Date(b.data) - new Date(a.data));

        res.status(200).json(todasNoticias);

    } catch (error) {
        res.status(500).json({ error: "Erro interno" });
    }
};