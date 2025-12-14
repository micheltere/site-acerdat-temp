// api/noticias.js
const Parser = require('rss-parser');
const parser = new Parser();

const fontes = [
    { nome: 'ONU News', url: 'https://news.un.org/feed/subscribe/pt/news/all/rss.xml', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png' },
    { nome: 'DW Brasil', url: 'https://rss.dw.com/xml/rss-br-news', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png' },
    { nome: 'RFI', url: 'https://www.rfi.fr/br/geral/rss', logo: 'https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png' },
    { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', logo: 'https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png' },
    { nome: 'Senado', url: 'https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss', logo: 'https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png' },
    { nome: 'Câmara', url: 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', logo: 'https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png' }
];

module.exports = async (req, res) => {
    // Permite acesso de qualquer lugar
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    let todasNoticias = [];

    try {
        const promessas = fontes.map(async (fonte) => {
            try {
                const feed = await parser.parseURL(fonte.url);
                const itens = feed.items.slice(0, 2); // Pega 2 notícias

                return itens.map(item => {
                    let imagemFinal = null;
                    // Tenta achar imagem apenas no RSS (sem entrar no site)
                    if (item.enclosure && item.enclosure.url) imagemFinal = item.enclosure.url;
                    else if (item["content:encoded"]) {
                        const match = item["content:encoded"].match(/src="([^"]+)"/);
                        if (match) imagemFinal = match[1];
                    }
                    
                    // Se não achou, usa o logo
                    if (!imagemFinal) imagemFinal = fonte.logo;

                    return {
                        titulo: item.title,
                        link: item.link,
                        imagem: imagemFinal,
                        fonte: fonte.nome,
                        data: item.pubDate
                    };
                });
            } catch (e) {
                console.error(`Erro na fonte ${fonte.nome}: ${e.message}`);
                return [];
            }
        });

        const resultados = await Promise.all(promessas);
        
        // Junta tudo em uma lista só (flat)
        todasNoticias = resultados.flat();
        
        // Ordena
        todasNoticias.sort((a, b) => new Date(b.data) - new Date(a.data));

        res.status(200).json(todasNoticias);

    } catch (error) {
        console.error("Erro geral na API:", error);
        res.status(500).json({ error: "Erro interno no servidor" });
    }
};