// api/noticias.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const parser = new Parser();

// Lista das suas fontes
const fontes = [
    { nome: 'ONU News', url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png' },
    { nome: 'DW Brasil', url: 'https://rss.dw.com/xml/rss-br-news', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png' },
    { nome: 'RFI', url: 'https://www.rfi.fr/br/geral/rss', logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png' },
    { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png' },
    { nome: 'Senado', url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png' },
    { nome: 'Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png' }
];

// Função auxiliar para raspar a imagem real da página
async function buscarImagemReal(urlNoticia) {
    try {
        const { data } = await axios.get(urlNoticia, { timeout: 3000 }); // Espera no máx 3s
        const $ = cheerio.load(data);
        // Tenta pegar a imagem que o Facebook/Twitter usariam (geralmente alta qualidade)
        const imagem = $('meta[property="og:image"]').attr('content') || 
                       $('meta[name="twitter:image"]').attr('content');
        return imagem;
    } catch (error) {
        return null;
    }
}

export default async function handler(req, res) {
    // Permite que seu site acesse essa API (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');

    let todasNoticias = [];

    // Processa todas as fontes em paralelo
    const promessas = fontes.map(async (fonte) => {
        try {
            const feed = await parser.parseURL(fonte.url);
            
            // Pega as 2 mais recentes de cada fonte
            const itensRecentes = feed.items.slice(0, 2);

            // Para cada notícia, vamos verificar a imagem
            const noticiasProcessadas = await Promise.all(itensRecentes.map(async (item) => {
                let imagemFinal = null;

                // 1. Tenta achar no RSS
                if (item.enclosure && item.enclosure.url) imagemFinal = item.enclosure.url;
                else if (item["content:encoded"]) {
                    const match = item["content:encoded"].match(/src="([^"]+)"/);
                    if (match) imagemFinal = match[1];
                }

                // 2. Se a imagem for ruim ou não existir, ativa o SCRAPING (O Segredo)
                if (!imagemFinal || imagemFinal.includes('ebc.png') || imagemFinal.includes('placeholder')) {
                    const imagemRaspada = await buscarImagemReal(item.link);
                    if (imagemRaspada) imagemFinal = imagemRaspada;
                }

                // 3. Se ainda assim falhar, usa o logo
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

        } catch (error) {
            console.error(`Erro ao ler ${fonte.nome}:`, error.message);
        }
    });

    await Promise.all(promessas);

    // Ordena por data
    todasNoticias.sort((a, b) => new Date(b.data) - new Date(a.data));

    res.status(200).json(todasNoticias);
}