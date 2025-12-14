// api/noticias.js
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

// CONFIGURAÇÃO DO DISFARCE (User-Agent)
// Usamos isso tanto para ler o RSS quanto para raspar imagens
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// Configura o leitor de RSS para não ser bloqueado pela ONU/DW
const parser = new Parser({
    headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
    },
    timeout: 5000 // 5 segundos max para ler o RSS
});

const fontes = [
    { nome: 'ONU News', url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png' },
    { nome: 'DW Brasil', url: 'https://rss.dw.com/xml/rss-br-news', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png' },
    { nome: 'RFI', url: 'https://www.rfi.fr/br/geral/rss', logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png' },
    { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png' },
    { nome: 'Senado', url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png' },
    { nome: 'Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png' }
];

// Sites que precisam de raspagem forçada de imagem
const fontesTeimosas = ['Agência Brasil', 'Câmara', 'RFI', 'Senado'];

async function buscarImagemReal(urlNoticia) {
    try {
        const { data } = await axios.get(urlNoticia, { 
            timeout: 4000, 
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const $ = cheerio.load(data);
        
        let imagem = $('meta[property="og:image"]').attr('content') || 
                     $('meta[name="twitter:image"]').attr('content') ||
                     $('link[rel="image_src"]').attr('href');
        
        // Corrige URLs relativas (ex: "/imagens/foto.jpg" vira "https://site.com/imagens/foto.jpg")
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
        // Usamos Promise.allSettled em vez de Promise.all
        // Isso garante que se a ONU falhar, a Agência Brasil continua aparecendo!
        const resultados = await Promise.allSettled(fontes.map(async (fonte) => {
            try {
                const feed = await parser.parseURL(fonte.url);
                // Pegamos 3 notícias de cada para garantir volume
                const itensRecentes = feed.items.slice(0, 3); 

                const noticiasProcessadas = await Promise.all(itensRecentes.map(async (item) => {
                    let imagemFinal = null;
                    const precisaRaspar = fontesTeimosas.includes(fonte.nome);

                    // 1. Tenta RSS (Se não for proibido)
                    if (!precisaRaspar) {
                        if (item.enclosure && item.enclosure.url) imagemFinal = item.enclosure.url;
                        else if (item["content:encoded"]) {
                            const match = item["content:encoded"].match(/src="([^"]+)"/);
                            if (match) imagemFinal = match[1];
                        }
                    }

                    // 2. Scraping (Obrigatório para teimosos ou se falhou no RSS)
                    if (precisaRaspar || !imagemFinal || imagemFinal.includes('placeholder') || imagemFinal.includes('ebc.png')) {
                         const imgScrap = await buscarImagemReal(item.link);
                         if (imgScrap) imagemFinal = imgScrap;
                    }

                    // 3. Fallback Logo
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
                console.error(`Erro ao processar ${fonte.nome}: ${e.message}`);
                return []; // Retorna lista vazia se der erro, não quebra o site
            }
        }));

        // Filtra apenas o que deu certo e junta tudo
        resultados.forEach(resultado => {
            if (resultado.status === 'fulfilled') {
                todasNoticias.push(...resultado.value);
            }
        });

        // Ordena
        todasNoticias.sort((a, b) => new Date(b.data) - new Date(a.data));
        
        res.status(200).json(todasNoticias);

    } catch (error) {
        console.error("Erro fatal:", error);
        res.status(500).json({ error: "Erro interno" });
    }
};